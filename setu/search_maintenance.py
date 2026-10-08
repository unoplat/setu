"""Keeps the ⌘K search index (setu.search.EnvisionSearch) in step with the database.

Frappe's own ``update_doc_index``/``delete_doc_index`` (registered for every
DocType by Frappe's hooks) loop over all ``sqlite_search`` classes and stop at
the first one that is disabled or has no index, before checking which DocTypes
that class covers. ERPNext's ItemSearch is off unless a site enables it, so it
can stop Envision's updates depending on the order classes are registered in.
They also write before the database commits. So Envision keeps its index the
way ERPNext keeps Item's (item_search.queue_item): its own document hooks call
this class's ``index_doc``/``remove_doc`` directly, whatever the class order.

How a change reaches the index
------------------------------
- A Task (milestones included), Envision Module or Envision Link that changes
  is noted by (doctype, name), once per transaction (``queue``). Its hooks:
  ``on_change``, which Frappe runs after every insert, save, submit, cancel,
  update after submit and ``db_set``, and on delete; ``after_delete``; and
  ``after_rename``, which notes the old name and the new one (a merge deletes
  the old record too).
- After the transaction commits (``frappe.db.after_commit``), each noted record
  is reconciled from the database as it now stands: indexed if it exists and
  ``EnvisionSearch.is_indexable``, removed otherwise. A rolled-back transaction
  reconciles too (``frappe.db.after_rollback``), so a row Frappe's own hook wrote
  before the rollback goes back to what the database holds. Frappe runs one of
  the two and drops the other.
- On Frappe 16.50 ``index_doc`` writes at once, so in a web request the index is
  updated before the response goes out. Newer Frappe queues ``index_doc`` for a
  scheduler job, so on an upgrade a save can take minutes to show in search.
- A Project whose Envision flag or status changes, or that is renamed, gets a
  background job reconciling its Tasks, Modules and Links: ERPNext's
  ``set_project_status`` cancels Tasks with ``frappe.db.set_value``, and a
  rename rewrites their ``project`` in SQL, neither raising document events.

Failures
--------
Indexing never fails a save: errors are logged ("Envision search index") and
the records retried in a background job, a few times, then logged with the
command below. Nothing is done while the index is missing or being built from
scratch: a build reads the database, and Frappe's catch-up after it indexes
records changed during the build and drops those deleted with a Deleted
Document (not ``delete_permanently``, as setu.api.task.delete_task uses).

Not covered: writes that bypass document events (``frappe.db.set_value``,
``frappe.db.sql``, data patches) other than the Project cases above, records
missed before this module existed, and a failure that outlasts the retries.
Two transactions committing the same record at once can leave the older text
indexed until the next change, as nothing orders the two index writes. The
search API reads every hit back from the database, so a stale row can show a
result's old description or rank it oddly, but never a record the user may not
see. A missing row hides the record until it is reconciled.

Repairing the index (run by hand, never automatically)
------------------------------------------------------
``reconcile_index`` brings a bounded set of records in step::

    bench --site SITE execute setu.search_maintenance.reconcile_index \\
        --kwargs "{'doctype': 'Task', 'project': 'PROJ-0001'}"
    bench --site SITE execute setu.search_maintenance.reconcile_index \\
        --kwargs "{'doctype': 'Envision Link', 'modified_since': '2026-09-01', 'limit': 2000}"
    bench --site SITE execute setu.search_maintenance.reconcile_index \\
        --kwargs "{'doctype': 'Task', 'names': ['TASK-2026-00031'], 'dry_run': True}"

It needs a doctype and at least one of ``names``, ``project`` or
``modified_since``, handles at most ``limit`` records (500 unless given,
never more than 5000) and reports what it did. A record deleted outright is
found only by name, or, with ``project``, among the index's own rows for that
project. It changes only the search index, never the database or an index file.
"""

import time

import frappe
from frappe.utils import cint, get_datetime

from setu.search import EnvisionSearch

INDEXED_DOCTYPES = tuple(EnvisionSearch.INDEXABLE_DOCTYPES)

# Fields Envision indexes or decides eligibility by, per DocType: a db_set of
# anything else (ERPNext's progress, Setu's _user_tags) leaves the index alone.
WATCHED_FIELDS = {
	doctype: tuple(
		field
		for definition in config["fields"]
		for field in ((definition,) if isinstance(definition, str) else definition.values())
	)
	for doctype, config in EnvisionSearch.INDEXABLE_DOCTYPES.items()
}

# More records than this in one transaction (an import, a bulk edit) are left to
# a background job rather than holding up the response.
INLINE_LIMIT = 50
# Tries in the background job, with a growing pause between them for a locked
# SQLite file, before the records are logged for reconcile_index.
ATTEMPTS = 3
RECONCILE_LIMIT = 500
MAX_RECONCILE_LIMIT = 5000
JOB_TIMEOUT = 30 * 60

LOG_TITLE = "Envision search index"
PENDING = "setu_search_pending"


# Document hooks (hooks.py)


def on_change(doc, method=None) -> None:
	"""Task, Envision Module, Envision Link ``on_change``."""
	if doc.flags.in_delete or any(doc.has_value_changed(field) for field in WATCHED_FIELDS[doc.doctype]):
		queue(doc.doctype, doc.name)


def after_delete(doc, method=None) -> None:
	"""Task, Envision Module, Envision Link ``after_delete``: also runs when a
	delete skips ``on_trash`` and with it ``on_change``."""
	queue(doc.doctype, doc.name)


def after_rename(doc, method, old: str, new: str, merge: bool) -> None:
	"""Task, Envision Module, Envision Link ``after_rename``. The rename writes
	the new name in SQL, without a save, so both names are reconciled: the old
	one comes out, the new one goes in (or, for a merge, is refreshed)."""
	queue(doc.doctype, old)
	queue(doc.doctype, new)


def on_project_change(doc, method=None) -> None:
	"""Project ``on_change``: whether its records may be indexed follows its
	Envision flag, and ERPNext cancels its Tasks in SQL before saving a new
	status. A new Project has nothing to reconcile, nor does one being deleted
	(Envision deletes its Modules and Links, firing their own hooks)."""
	if doc.flags.in_delete or doc.get_doc_before_save() is None:
		return
	if doc.has_value_changed("envision_enabled") or doc.has_value_changed("status"):
		queue_project(doc.name)


def on_project_rename(doc, method, old: str, new: str, merge: bool) -> None:
	"""Project ``after_rename``: the rename rewrote each record's ``project`` in
	SQL, and the index filters on it, so the records would drop out of search."""
	queue_project(new)


# After the transaction


def queue(doctype: str, name: str | None) -> None:
	"""Reconcile ``doctype``/``name`` once this transaction ends."""
	if not name:
		return
	try:
		# frappe.db is a proxy; the connection behind it is what commits.
		pending(frappe.local.db)[(doctype, name)] = None
	except Exception:
		log_failure("could not note a record to reindex", [(doctype, name)])


def pending(db) -> dict[tuple[str, str], None]:
	"""This transaction's records (a dict, so in order and once each). Its
	callbacks are added with the first record; a commit runs one and drops the
	other, as does a rollback. Tied to ``db`` so a new connection starts over."""
	state = getattr(frappe.local, PENDING, None)
	if state is None or state[0] is not db:
		state = (db, {})
		setattr(frappe.local, PENDING, state)
		db.after_commit.add(flush)
		db.after_rollback.add(flush)
	return state[1]


def flush() -> None:
	"""Reconcile what this transaction noted. Never raises: in a web request it
	runs after the commit, and an error would fail a save that succeeded."""
	state = getattr(frappe.local, PENDING, None)
	setattr(frappe.local, PENDING, None)
	records = list(state[1]) if state else []
	if not records:
		return
	try:
		if len(records) > INLINE_LIMIT:
			enqueue_reconcile(records)
			return
		failed = reconcile_records(records)
		if failed:
			enqueue_reconcile(failed)
	except Exception:
		log_failure("could not reindex records", records)


def reconcile_records(records: list[tuple[str, str]], log: bool = True) -> list[tuple[str, str]]:
	"""Reconcile each record, returning those that failed; with ``log``, the
	first failure is logged with its traceback. Skips them all while there is
	no index: a build will read them from the database."""
	engine = EnvisionSearch()
	if not engine.index_exists():
		return []
	failed = []
	for doctype, name in records:
		try:
			reconcile(doctype, name, engine)
		except Exception:
			if log and not failed:
				log_failure(f"could not reindex {len(records)} record(s), first failure", [(doctype, name)])
			failed.append((doctype, name))
	return failed


def reconcile(doctype: str, name: str, engine: EnvisionSearch | None = None) -> str:
	"""Bring one record's row in step with the database: ``"indexed"`` if it
	exists and may be indexed, ``"removed"`` otherwise (gone, renamed, merged
	away, a template, Cancelled, or outside an Envision project).

	``index_doc`` reads the record again and leaves out one that stopped
	qualifying in between; that change's own reconcile then removes it.
	Raises SQLiteSearchIndexMissingError when there is no index."""
	engine = engine or EnvisionSearch()
	if doctype not in INDEXED_DOCTYPES:
		raise ValueError(f"{doctype} is not in the Envision search index")
	if frappe.db.exists(doctype, name) and engine.is_indexable(frappe.get_doc(doctype, name)):
		engine.index_doc(doctype, name)
		return "indexed"
	engine.remove_doc(doctype, name)
	return "removed"


# Background jobs


def enqueue_reconcile(records: list[tuple[str, str]]) -> None:
	"""Reconcile ``records`` in a background job: too many to do inline, or a
	retry of those that failed."""
	try:
		frappe.enqueue(
			"setu.search_maintenance.reconcile_in_background",
			queue="default",
			timeout=JOB_TIMEOUT,
			records=[list(record) for record in records],
		)
	except Exception:
		log_failure("could not queue reindexing; run reconcile_index for these", records)


def reconcile_in_background(records: list[list[str]]) -> None:
	"""Background job: reconcile ``records``, retrying the ones that fail."""
	remaining = [tuple(record) for record in records]
	for attempt in range(ATTEMPTS):
		if attempt:
			time.sleep(2 * attempt)
		remaining = reconcile_records(remaining, log=attempt == ATTEMPTS - 1)
		if not remaining:
			return
	log_failure(f"gave up after {ATTEMPTS} tries; run reconcile_index for these", remaining)


def queue_project(project: str) -> None:
	"""Reconcile every record of ``project`` in a background job, after commit."""
	try:
		frappe.enqueue(
			"setu.search_maintenance.reconcile_project",
			queue="long",
			timeout=JOB_TIMEOUT,
			enqueue_after_commit=True,
			project=project,
		)
	except Exception:
		log_failure(f"could not queue reindexing project {project}; run reconcile_index with it", [])


def reconcile_project(project: str) -> None:
	"""Background job: reconcile the Tasks, Modules and Links of ``project``."""
	engine = EnvisionSearch()
	if not engine.index_exists():
		return
	failed = []
	for doctype in INDEXED_DOCTYPES:
		names = scope_names(engine, doctype, project=project)
		failed += reconcile_records([(doctype, name) for name in names])
	if failed:
		enqueue_reconcile(failed)


# By hand


def reconcile_index(
	doctype: str,
	names: list[str] | None = None,
	project: str | None = None,
	modified_since: str | None = None,
	limit: int = RECONCILE_LIMIT,
	dry_run: bool = False,
) -> dict:
	"""Repair the index for a bounded set of records; see this module's
	docstring. Not whitelisted: run it with ``bench execute`` (as Administrator).

	- ``names``: these records, whether they still exist or not.
	- ``project``: the doctype's records in this project, and the index's rows
	  for it whose record is gone.
	- ``modified_since``: records changed since then (a date or datetime).
	- ``dry_run``: report what would be reconciled, change nothing.
	"""
	if frappe.session.user != "Administrator":
		frappe.throw("Run reconcile_index with bench execute.", frappe.PermissionError)
	if doctype not in INDEXED_DOCTYPES:
		frappe.throw(f"doctype must be one of {', '.join(INDEXED_DOCTYPES)}")
	if isinstance(names, str):
		names = [names]
	if not (names or project or modified_since):
		frappe.throw("Give names, a project or modified_since.")
	limit = min(cint(limit) or RECONCILE_LIMIT, MAX_RECONCILE_LIMIT)

	engine = EnvisionSearch()
	if not engine.index_exists():
		return {"index": "missing or still being built: nothing to reconcile"}

	targets = scope_names(engine, doctype, names, project, modified_since, limit)
	report = {"doctype": doctype, "records": len(targets), "limit": limit, "dry_run": bool(dry_run)}
	if dry_run:
		return {**report, "names": targets}

	counts = {"indexed": 0, "removed": 0}
	failed = []
	for name in targets:
		try:
			counts[reconcile(doctype, name, engine)] += 1
		except Exception:
			failed.append(name)
			log_failure("reconcile_index could not reconcile a record", [(doctype, name)])
	return {**report, **counts, "failed": failed}


def scope_names(
	engine: EnvisionSearch,
	doctype: str,
	names: list[str] | None = None,
	project: str | None = None,
	modified_since: str | None = None,
	limit: int | None = None,
) -> list[str]:
	"""Names to reconcile: the given ones, then the database's records matching
	``project``/``modified_since`` (newest first), then, with ``project``, the
	index's rows for that project. At most ``limit`` (all with None)."""
	found = dict.fromkeys(names or [])
	if project or modified_since:
		filters = {}
		if project:
			filters["project"] = project
		if modified_since:
			filters["modified"] = [">=", get_datetime(modified_since)]
		found.update(
			dict.fromkeys(
				frappe.get_all(
					doctype, filters=filters, pluck="name", order_by="modified desc", limit=limit or 0
				)
			)
		)
	if project:
		# A record deleted outright leaves no Deleted Document behind; its row
		# is found by the project it was indexed under.
		rows = engine.sql(
			# LIMIT -1 is no limit in SQLite.
			"SELECT name FROM search_fts WHERE doctype = ? AND project = ? LIMIT ?",
			(doctype, project, limit or -1),
			read_only=True,
		)
		found.update(dict.fromkeys(row["name"] for row in rows))
	return list(found)[:limit] if limit else list(found)


def log_failure(summary: str, records: list[tuple[str, str]]) -> None:
	"""An Error Log entry, written later: after a commit, nothing commits a
	direct insert in a web request. Never raises."""
	try:
		listed = "\n".join(f"{doctype}: {name}" for doctype, name in records)
		frappe.log_error(
			title=LOG_TITLE,
			message=f"{summary}\n{listed}\n\n{frappe.get_traceback()}",
			defer_insert=True,
		)
	except Exception:
		frappe.logger("setu.search").exception(f"{LOG_TITLE}: {summary}: {records}")
