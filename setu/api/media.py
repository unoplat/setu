import base64
import binascii
import re
from html import unescape
from urllib.parse import parse_qs, unquote, urlencode, urlsplit

import frappe
from frappe import _
from frappe.core.doctype.file.utils import get_content_hash
from frappe.utils import add_to_date, get_url, now_datetime
from frappe.utils.nestedset import get_descendants_of

from setu.github import bot as github_bot
from setu.github import comments as github_comments
from setu.github import delta as github_delta
from setu.github import links as github_links

# Images added in Envision's rich text editor (frontend
# src/components/editor-image). Nothing is uploaded while the person writes:
# the editor holds each image in the text as a data: address, and the save of
# the record or comment turns it into a Frappe File attached to the record.
# The File is created inside that save, so a save that fails or never happens
# leaves nothing behind.
#
# The data: address carries what the insert dialog chose:
#   data:image/png;filename=diagram.png;private=0;base64,…
# A public image gets an absolute https address, the only kind
# setu.github.convert copies to a GitHub Issue. A private one keeps Frappe's
# access checks (whoever can read the record) and never leaves the site.
#
# Files made here are marked with ``attached_to_field = INLINE_IMAGE_MARK``, so
# Envision can delete them once no text on the record uses them. Attachments
# added any other way (Desk, the Board) are never touched.
#
# That deletion waits (mark and sweep). A save that leaves an image unused only
# stamps its File's ``envision_unused_since``; a later save that uses it again
# (an undo in the editor, then save) clears the stamp. The hourly
# sweep_unused_images deletes the Files still unused after
# UNUSED_IMAGE_GRACE_HOURS, checking the record's text once more first.

MAX_IMAGE_BYTES = 5 * 1024 * 1024
# What the editor's dialog accepts, with each type's first bytes and extension.
# SVG is left out: it can carry script.
IMAGE_TYPES = {
	"image/png": ((b"\x89PNG\r\n\x1a\n",), "png"),
	"image/jpeg": ((b"\xff\xd8\xff",), "jpg"),
	"image/gif": ((b"GIF87a", b"GIF89a"), "gif"),
	"image/webp": ((b"RIFF",), "webp"),
}

# DocTypes whose rich text fields hold editor images, and those fields.
INLINE_IMAGE_FIELDS = {
	"Project": ("notes",),
	"Task": ("description",),
	"Envision Module": ("description",),
	"Envision Link": ("description",),
}

INLINE_IMAGE_MARK = "envision_inline_image"
# How long an unused editor image is kept before the sweep deletes it.
UNUSED_IMAGE_GRACE_HOURS = 12

_DATA_IMAGE = re.compile(r"""(<img\b[^>]*?\bsrc\s*=\s*)(["'])(data:[^"']*)\2""", re.IGNORECASE)
_IMAGE_TAG_SRC = re.compile(r"""(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2""", re.IGNORECASE)
_IMAGE_SRC = re.compile(r"""<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
# Base64 is a third larger than the bytes it holds.
_MAX_PAYLOAD = (MAX_IMAGE_BYTES + 2) // 3 * 4


# Save: data: images become Files ---------------------------------------------


def store_record_images(doc, method=None) -> None:
	"""before_validate: store new data: images and clone any site images
	pasted from another record so this record owns its own File rows.

	Runs before Frappe's own Text Editor extraction, which would make every
	image private, and before the HTML is sanitised, which drops data: images.
	On GitHub-tracked Tasks and their Subtasks, private images are refused so
	every image stays in 2-way sync with GitHub.
	"""
	require_public_data, require_public_site = _public_image_requirements(doc)
	for fieldname in INLINE_IMAGE_FIELDS.get(doc.doctype, ()):
		html = doc.get(fieldname)
		if _has_image(html):
			doc.set(
				fieldname,
				store_images(
					html,
					doc.doctype,
					doc.name,
					require_public_data=require_public_data,
					require_public_site=require_public_site,
				),
			)


def store_comment_images(doc, method=None) -> None:
	"""before_validate of a Comment: its images belong to the record it is on,
	where Desk lists attachments and permissions are checked. Restricted to
	Envision records so Desk comments on unrelated ERPNext DocTypes or
	non-Envision Projects/Tasks are left untouched."""
	if (
		doc.comment_type == "Comment"
		and _has_image(doc.content)
		and _is_envision_record(doc.reference_doctype, doc.reference_name)
	):
		require_public = (
			not github_bot.inbound()
			and doc.reference_doctype == "Task"
			and github_links.requires_public_images(doc.reference_name)
		)
		doc.content = store_images(
			doc.content,
			doc.reference_doctype,
			doc.reference_name,
			require_public_data=require_public,
			require_public_site=require_public,
		)


def _is_envision_record(doctype: str | None, name: str | None) -> bool:
	"""Whether ``doctype`` ``name`` belongs to Envision: an Envision-owned
	DocType, an Envision-enabled Project, or a Task in one."""
	if not doctype or not name or doctype not in INLINE_IMAGE_FIELDS:
		return False
	if doctype in ("Envision Module", "Envision Link"):
		return True
	if not frappe.get_meta("Project").has_field("envision_enabled"):
		return False
	if doctype == "Project":
		return bool(frappe.db.get_value("Project", name, "envision_enabled"))
	if doctype == "Task":
		project = frappe.db.get_value("Task", name, "project")
		return bool(project and frappe.db.get_value("Project", project, "envision_enabled"))
	return False


def _public_image_requirements(doc) -> tuple[bool, bool]:
	"""Return ``(require_public_data, require_public_site)`` for a record save.

	A Task already in GitHub scope (itself or any ancestor tagged ``github``
	or actively linked) refuses both new private ``data:`` uploads and private
	site URLs. A Task *entering* GitHub scope on this save (moving under a
	GitHub parent or adding the ``github`` tag in the same request) refuses
	new private ``data:`` uploads, while letting its existing private site
	images pass through to be converted to public right after save.
	"""
	if doc.doctype != "Task" or github_bot.inbound():
		return False, False

	parent_now = doc.parent_task or ""
	is_new = bool(doc.is_new())
	is_github = bool(doc.flags.get("envision_require_public_images")) or github_links.requires_public_images(
		None if is_new else doc.name,
		parent_task=parent_now,
		user_tags=doc.get("_user_tags"),
	)
	if not is_github:
		return False, False
	if is_new:
		return True, True

	before = doc.get_doc_before_save()
	before_parent = (before.parent_task or "") if before is not None else None
	was_github = github_links.requires_public_images(doc.name, parent_task=before_parent)
	return True, was_github


def _throw_public_image_required() -> None:
	frappe.throw(
		_("Images on GitHub tasks and subtasks must be public to ensure 2-way sync with GitHub."),
		frappe.ValidationError,
	)


def store_images(
	html: str,
	doctype: str,
	name: str,
	*,
	require_public_data: bool = False,
	require_public_site: bool = False,
) -> str:
	"""Replace each data: image in ``html`` with the address of a File attached
	to ``doctype`` ``name``, and clone any local site image owned by another
	record onto this one. A bad data: image fails the save with a message."""
	if "data:" in html:

		def replace(match: re.Match) -> str:
			prefix, quote, uri = match.groups()
			return f"{prefix}{quote}{store_image(unescape(uri), doctype, name, require_public=require_public_data)}{quote}"

		html = _DATA_IMAGE.sub(replace, html)

	if "/files/" in html and doctype and name:
		html = _adopt_site_images(html, doctype, name, require_public=require_public_site)

	return html


def store_image(uri: str, doctype: str, name: str, *, require_public: bool = False) -> str:
	header, comma, payload = uri.removeprefix("data:").partition(",")
	parts = [part.strip() for part in header.split(";")]
	mimetype = parts[0].lower()
	params = dict(part.split("=", 1) for part in parts[1:] if "=" in part)
	if not comma or "base64" not in parts[1:]:
		frappe.throw(_("An image in the text could not be read. Remove it and add it again."))
	payload = re.sub(r"\s", "", payload)
	if len(payload) > _MAX_PAYLOAD:
		frappe.throw(_("Images can be up to 5 MB."))
	try:
		content = base64.b64decode(payload, validate=True)
	except binascii.Error, ValueError:
		frappe.throw(_("An image in the text could not be read. Remove it and add it again."))
	if len(content) > MAX_IMAGE_BYTES:
		frappe.throw(_("Images can be up to 5 MB."))
	if not _is_supported_image(mimetype, content):
		frappe.throw(_("Only PNG, JPG, GIF or WebP images can be added."))

	is_private = params.get("private") != "0"
	if require_public and is_private:
		_throw_public_image_required()
	# The same image saved again on this record (an autosave that went out
	# before the editor took the stored address) reuses its File.
	file = frappe.db.get_value(
		"File",
		{
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"attached_to_field": INLINE_IMAGE_MARK,
			"content_hash": get_content_hash(content),
			"is_private": int(is_private),
		},
		["name", "file_url", "is_private", "envision_unused_since"],
		as_dict=True,
	)
	if file and file.envision_unused_since:
		# In use again: the sweep must not delete it.
		frappe.db.set_value("File", file.name, "envision_unused_since", None, update_modified=False)
	if not file:
		file = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": _file_name(params.get("filename"), mimetype),
				"attached_to_doctype": doctype,
				"attached_to_name": name,
				"attached_to_field": INLINE_IMAGE_MARK,
				"is_private": int(is_private),
				"content": content,
			}
		)
		# The save that brings the image is already allowed on the record (or,
		# for a comment, on reading it), as for Frappe's own extraction.
		file.insert(ignore_permissions=True)
	return _image_address(file)


def _is_supported_image(mimetype: str, content: bytes) -> bool:
	# The declared type must match the file's own first bytes.
	known = IMAGE_TYPES.get(mimetype)
	if not known or not content.startswith(known[0]):
		return False
	return mimetype != "image/webp" or content[8:12] == b"WEBP"


def _file_name(requested: str | None, mimetype: str) -> str:
	# Only the name's stem is kept; the extension always follows the content.
	stem = re.sub(r"[^A-Za-z0-9_-]+", "-", unquote(requested or "").rsplit(".", 1)[0]).strip("-")
	return f"{stem[:80] or 'image'}.{IMAGE_TYPES[mimetype][1]}"


def _image_address(file) -> str:
	if file.is_private:
		# The File's id lets Frappe check access against this record.
		return f"{file.file_url}?{urlencode({'fid': file.name})}"
	# Absolute so it survives being copied outside the site (GitHub, email):
	# the site's configured https address when there is one, as the GitHub
	# connection uses, rather than whichever host this request came through.
	from setu.github.connection import public_url

	try:
		return public_url() + file.file_url
	except Exception:
		return get_url(file.file_url)


def _adopt_site_images(html: str, doctype: str, name: str, *, require_public: bool = False) -> str:
	"""Give ``doctype`` ``name`` its own File row for any local site image in
	``html`` that currently belongs only to another record (for example, pasted
	from another Task or copied when duplicating a record).

	Uses Frappe's ``create_attachment_copy`` so the new File row points to the
	same physical file on disk without duplicating bytes, and rewrites private
	``?fid=`` links to the cloned File so permissions follow this record."""
	site_hosts = _site_hosts()
	owned_loaded = False
	owned_by_name: dict[str, object] = {}
	owned_by_url: dict[str, object] = {}

	def load_owned() -> None:
		nonlocal owned_loaded
		if owned_loaded:
			return
		owned_loaded = True
		for row in frappe.get_all(
			"File",
			filters={
				"attached_to_doctype": doctype,
				"attached_to_name": name,
				"is_folder": 0,
			},
			fields=["name", "file_url", "is_private", "envision_unused_since"],
		):
			owned_by_name[row.name] = row
			owned_by_url.setdefault(row.file_url, row)

	def replace(match: re.Match) -> str:
		prefix, quote, raw_src = match.groups()
		parsed = _parse_site_image_src(raw_src, site_hosts)
		if not parsed:
			return match.group(0)
		path, fid = parsed

		if require_public and path.startswith("/private/files/"):
			_throw_public_image_required()

		load_owned()

		by_fid = owned_by_name.get(fid) if fid else None
		existing = (by_fid if by_fid and by_fid.file_url == path else None) or owned_by_url.get(path)
		if existing:
			if existing.envision_unused_since:
				frappe.db.set_value(
					"File", existing.name, "envision_unused_since", None, update_modified=False
				)
				existing.envision_unused_since = None
			if (existing.is_private and fid != existing.name) or (
				require_public and not existing.is_private and not urlsplit(unescape(raw_src)).scheme
			):
				return f"{prefix}{quote}{_image_address(existing)}{quote}"
			return match.group(0)

		source = _find_source_file(path, fid)
		if not source:
			return match.group(0)

		clone = source.create_attachment_copy(
			attached_to_doctype=doctype,
			attached_to_name=name,
			attached_to_field=INLINE_IMAGE_MARK,
			ignore_permissions=True,
		)
		owned_by_name[clone.name] = clone
		owned_by_url[clone.file_url] = clone
		if clone.is_private or (require_public and not urlsplit(unescape(raw_src)).scheme):
			return f"{prefix}{quote}{_image_address(clone)}{quote}"
		return match.group(0)

	return _IMAGE_TAG_SRC.sub(replace, html)


def _site_hosts() -> set[str]:
	hosts = set()
	candidates = [get_url()]
	from setu.github.connection import public_url

	try:
		candidates.append(public_url())
	except Exception:
		pass
	for url in candidates:
		netloc = urlsplit(url).netloc.lower()
		if netloc:
			hosts.add(netloc)
	return hosts


def _parse_site_image_src(raw_src: str, site_hosts: set[str]) -> tuple[str, str | None] | None:
	try:
		parsed = urlsplit(unescape(raw_src))
	except ValueError:
		return None
	if parsed.scheme and parsed.scheme.lower() not in ("http", "https"):
		return None
	if parsed.netloc and parsed.netloc.lower() not in site_hosts:
		return None
	path = unquote(parsed.path)
	if not path.startswith(("/files/", "/private/files/")):
		return None
	fid = parse_qs(parsed.query).get("fid", [None])[0]
	return path, fid


def _find_source_file(path: str, fid: str | None):
	if path.startswith("/private/files/"):
		if fid:
			if not frappe.db.exists("File", fid):
				return None
			doc = frappe.get_doc("File", fid)
			if (
				doc.file_url == path
				and doc.is_private
				and not doc.is_folder
				and doc.is_downloadable()
				and doc.exists_on_disk()
			):
				return doc
			return None
		for file_name in frappe.get_all(
			"File",
			filters={"file_url": path, "is_private": 1, "is_folder": 0},
			pluck="name",
			order_by="creation desc",
			limit=20,
		):
			doc = frappe.get_doc("File", file_name)
			if doc.is_downloadable() and doc.exists_on_disk():
				return doc
		return None

	file_name = frappe.db.get_value(
		"File",
		{"file_url": path, "is_private": 0, "is_folder": 0},
		"name",
		order_by="creation desc",
	)
	if not file_name:
		return None
	doc = frappe.get_doc("File", file_name)
	return doc if doc.exists_on_disk() else None


# GitHub sync: convert existing private images to public ----------------------


def publish_images_on_github_tag(doc, method=None) -> None:
	"""Tag Link after_insert (before setu.github.links.on_tag_link_insert):
	make existing private inline images on the Task and its Subtasks public so
	they stay in 2-way sync with GitHub."""
	if (
		doc.document_type != "Task"
		or (doc.tag or "").strip().casefold() != github_links.GITHUB_TAG
		or github_bot.inbound()
	):
		return
	publish_task_tree_private_images(doc.document_name)


def publish_images_on_task_move(doc, method=None) -> None:
	"""Task on_update (before setu.github.links.on_task_update): when a Task
	moves under a GitHub-tagged or GitHub-linked parent, make existing private
	inline images on the Task and its Subtasks public before sync pushes."""
	if (
		github_bot.inbound()
		or doc.flags.in_insert
		or not doc.parent_task
		or not doc.has_value_changed("parent_task")
	):
		return
	if not github_links.requires_public_images(None, parent_task=doc.parent_task):
		return
	publish_task_tree_private_images(doc.name, current_doc=doc)


def publish_task_tree_private_images(task_name: str, *, current_doc=None) -> None:
	"""Convert every private inline image on ``task_name`` and all of its
	descendant Subtasks (descriptions, comments and reply quotes) into a public
	File on that Task, leaving any other record's private File rows untouched."""
	if not task_name or not frappe.db.exists("Task", task_name):
		return
	site_hosts = _site_hosts()
	descendants = get_descendants_of("Task", task_name, ignore_permissions=True)
	for name in [task_name, *descendants]:
		_make_task_images_public(name, site_hosts, current_doc=current_doc if name == task_name else None)


def _make_task_images_public(task_name: str, site_hosts: set[str], *, current_doc=None) -> None:
	description = (
		current_doc.description
		if current_doc is not None
		else frappe.db.get_value("Task", task_name, "description")
	)
	has_quote = frappe.get_meta("Comment").has_field("envision_quote_content")
	comment_fields = ["name", "content", *(["envision_quote_content"] if has_quote else [])]
	comments = frappe.get_all(
		"Comment",
		filters={"reference_doctype": "Task", "reference_name": task_name, "comment_type": "Comment"},
		fields=comment_fields,
	)

	all_texts = [description, *(row.content for row in comments)]
	if has_quote:
		all_texts.extend(row.get("envision_quote_content") for row in comments)
	if not any(text and "/private/files/" in text for text in all_texts):
		return

	converted: dict[tuple[str, str | None], str] = {}

	def convert_html(html: str | None) -> str | None:
		if not html or "/private/files/" not in html:
			return html

		def replace(match: re.Match) -> str:
			prefix, quote, raw_src = match.groups()
			parsed = _parse_site_image_src(raw_src, site_hosts)
			if not parsed or not parsed[0].startswith("/private/files/"):
				return match.group(0)
			key = parsed
			public_address = converted.get(key)
			if not public_address:
				public_address = _publish_private_image(task_name, parsed[0], parsed[1])
				if not public_address:
					return match.group(0)
				converted[key] = public_address
			return f"{prefix}{quote}{public_address}{quote}"

		return _IMAGE_TAG_SRC.sub(replace, html)

	changed_any = False
	link = github_links.link_for_task(task_name)
	is_publishing = github_links.publishing(link)

	new_description = convert_html(description)
	if new_description != description:
		frappe.db.set_value("Task", task_name, "description", new_description, update_modified=False)
		if current_doc is not None:
			current_doc.description = new_description
		changed_any = True
		if is_publishing:
			github_links.record_keys(link.name, task_name, link.project, ["description"])

	for row in comments:
		updates: dict[str, str] = {}
		new_content = convert_html(row.content)
		if new_content != row.content:
			updates["content"] = new_content or ""
		if has_quote:
			old_quote = row.get("envision_quote_content")
			new_quote = convert_html(old_quote)
			if new_quote != old_quote:
				updates["envision_quote_content"] = new_quote or ""
		if updates:
			frappe.db.set_value("Comment", row.name, updates, update_modified=False)
			changed_any = True
			if is_publishing and github_comments.mapping_for_comment(row.name):
				github_comments.record_comment(task_name, row.name, github_delta.PUSH)

	if changed_any:
		# Mark the now-unused private File rows on this Task so the hourly
		# sweep cleans them up without affecting any other record.
		prune_images("Task", task_name)


def _publish_private_image(task_name: str, path: str, fid: str | None) -> str | None:
	source = _find_private_file_for_publish(task_name, path, fid)
	if not source:
		return None
	content = source.get_content()
	if isinstance(content, str):
		content = content.encode()
	existing = frappe.db.get_value(
		"File",
		{
			"attached_to_doctype": "Task",
			"attached_to_name": task_name,
			"attached_to_field": INLINE_IMAGE_MARK,
			"content_hash": get_content_hash(content),
			"is_private": 0,
		},
		["name", "file_url", "is_private", "envision_unused_since"],
		as_dict=True,
	)
	if existing:
		if existing.envision_unused_since:
			frappe.db.set_value("File", existing.name, "envision_unused_since", None, update_modified=False)
		return _image_address(existing)

	public_file = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": source.file_name,
			"attached_to_doctype": "Task",
			"attached_to_name": task_name,
			"attached_to_field": INLINE_IMAGE_MARK,
			"is_private": 0,
			"content": content,
		}
	)
	public_file.insert(ignore_permissions=True)
	return _image_address(public_file)


def _find_private_file_for_publish(task_name: str, path: str, fid: str | None):
	candidates: list[str] = []
	if fid and frappe.db.exists("File", fid):
		candidates.append(fid)
	candidates.extend(
		frappe.get_all(
			"File",
			filters={
				"attached_to_doctype": "Task",
				"attached_to_name": task_name,
				"file_url": path,
				"is_private": 1,
				"is_folder": 0,
			},
			pluck="name",
			order_by="creation desc",
			limit=10,
		)
	)
	seen: set[str] = set()
	for file_name in candidates:
		if file_name in seen:
			continue
		seen.add(file_name)
		doc = frappe.get_doc("File", file_name)
		if (
			doc.file_url == path
			and doc.is_private
			and not doc.is_folder
			and doc.is_downloadable()
			and doc.exists_on_disk()
		):
			return doc
	return None


# Later edits and deletes: images no text uses are marked, then swept ----------


def prune_record_images(doc, method=None) -> None:
	"""on_update: mark the editor images the record's text no longer uses, and
	unmark those it uses again."""
	fields = INLINE_IMAGE_FIELDS.get(doc.doctype, ())
	if any(doc.has_value_changed(fieldname) for fieldname in fields):
		prune_images(doc.doctype, doc.name)


def prune_comment_images_on_update(doc, method=None) -> None:
	"""on_update of a Comment (which runs on insert too): an edited comment
	may have dropped an image, and a new one may use a marked image again."""
	if doc.flags.in_insert:
		if not _has_image(doc.content) and not _has_image(doc.get("envision_quote_content")):
			return
	elif not doc.has_value_changed("content"):
		return
	_prune_comment(doc)


def prune_comment_images_on_delete(doc, method=None) -> None:
	"""after_delete of a Comment: its images may now be unused (marked)."""
	_prune_comment(doc)


def _prune_comment(doc) -> None:
	if doc.comment_type == "Comment" and doc.reference_doctype in INLINE_IMAGE_FIELDS and doc.reference_name:
		prune_images(doc.reference_doctype, doc.reference_name)


def _has_image(html: str | None) -> bool:
	return bool(html) and "<img" in html.lower()


def prune_images(doctype: str, name: str) -> None:
	"""Mark the editor images attached to a record that neither its text nor
	any comment on it uses, and unmark those used again. sweep_unused_images
	deletes what stays marked past the grace period."""
	files = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"attached_to_field": INLINE_IMAGE_MARK,
		},
		fields=["name", "file_url", "envision_unused_since"],
	)
	# A record being deleted takes its Files with it (frappe.model.delete_doc).
	if not files or not frappe.db.exists(doctype, name):
		return
	used = _used_paths(doctype, name)
	now = now_datetime()
	for file in files:
		if file.file_url not in used:
			# An earlier mark stands, so later saves don't restart the clock.
			if not file.envision_unused_since:
				frappe.db.set_value("File", file.name, "envision_unused_since", now, update_modified=False)
		elif file.envision_unused_since:
			frappe.db.set_value("File", file.name, "envision_unused_since", None, update_modified=False)


def sweep_unused_images() -> None:
	"""Hourly: delete the editor images unused for UNUSED_IMAGE_GRACE_HOURS.
	Frappe keeps the image on disk while another File shares its content.

	The record's text is checked again first, in case it uses the image once
	more without a save that unmarked it. Each File is committed on its own so
	a failure rolls back both its DB changes and any queued after_commit disk
	delete, logs the error, and leaves the rest of the sweep unaffected."""
	cutoff = add_to_date(now_datetime(), hours=-UNUSED_IMAGE_GRACE_HOURS)
	groups: dict[tuple[str, str], list] = {}
	for file in frappe.get_all(
		"File",
		filters=[
			["attached_to_field", "=", INLINE_IMAGE_MARK],
			["envision_unused_since", "is", "set"],
			["envision_unused_since", "<=", cutoff],
		],
		fields=["name", "attached_to_doctype", "attached_to_name", "file_url"],
	):
		groups.setdefault((file.attached_to_doctype, file.attached_to_name), []).append(file)

	for (doctype, name), group in groups.items():
		try:
			# A deleted record (or one never saved) uses nothing.
			used = (
				_used_paths(doctype, name) if doctype and name and frappe.db.exists(doctype, name) else set()
			)
		except Exception:
			frappe.db.rollback()
			_log_sweep_error(doctype, name)
			continue
		for file in group:
			try:
				if file.file_url in used:
					frappe.db.set_value(
						"File", file.name, "envision_unused_since", None, update_modified=False
					)
				else:
					frappe.delete_doc("File", file.name, ignore_permissions=True)
				frappe.db.commit()  # nosemgrep: frappe-manual-commit
			except Exception:
				frappe.db.rollback()
				_log_sweep_error("File", file.name)


def release_inline_image_blob(doc, method=None) -> None:
	"""on_trash of a File: free an editor image's blob that Frappe keeps on disk.

	Frappe's File.on_trash queues ``_delete_file_on_disk`` after commit, and
	that keeps the blob while any other File shares its ``content_hash``,
	whatever its ``is_private`` or ``file_url``. A private image made public for
	GitHub (_publish_private_image) has a twin with the same hash in the other
	folder, so deleting either one (the sweep, or deleting the record) would
	leave its blob behind: a private one no File points to, or a public one
	nginx still serves.

	This hook runs after Frappe's on_trash, so its callback runs after Frappe's
	in the same after_commit pass, and not at all on a rollback. It deletes the
	blob only when Frappe kept it (another File shares the hash) and no File
	still points to this exact ``file_url``."""
	if doc.is_folder or doc.attached_to_field != INLINE_IMAGE_MARK:
		return
	file_url = doc.file_url or ""
	if not file_url.startswith(("/files/", "/private/files/")) or ".." in file_url.split("/"):
		return
	name, content_hash = doc.name, doc.content_hash
	frappe.db.after_commit.add(lambda: _delete_orphaned_blob(name, file_url, content_hash))


def _delete_orphaned_blob(name: str, file_url: str, content_hash: str | None) -> None:
	from frappe.utils.file_manager import delete_file

	try:
		# Another storage backend owns deletes; there is no local blob to free.
		if frappe.get_hooks("delete_file_data_content"):
			return
		# Still in use, e.g. a clone of this image on another record.
		if frappe.db.exists("File", {"file_url": file_url}):
			return
		# Nothing shares the hash: Frappe's callback already deleted the blob.
		if content_hash and not frappe.db.exists(
			"File", {"content_hash": content_hash, "name": ["!=", name]}
		):
			return
		# The blob only: Frappe already deleted the thumbnail.
		delete_file(file_url)
	except Exception:
		frappe.logger("envision.media").exception(
			"Could not delete the unused editor image %s (%s)", file_url, name
		)


def _log_sweep_error(doctype: str | None, name: str | None) -> None:
	try:
		frappe.log_error(
			title="Unused editor image sweep failed",
			reference_doctype=doctype,
			reference_name=name,
		)
		frappe.db.commit()  # nosemgrep: frappe-manual-commit
	except Exception:
		frappe.logger("envision.media").error(
			"Could not log the image sweep failure for %s %s", doctype, name
		)


def _used_paths(doctype: str, name: str) -> set[str]:
	texts = []
	fields = INLINE_IMAGE_FIELDS.get(doctype, ())
	if fields:
		texts.extend(frappe.db.get_value(doctype, name, list(fields), as_dict=True).values())
	# A reply keeps a copy of the comment it quotes, images included.
	quote = (
		["envision_quote_content"] if frappe.get_meta("Comment").has_field("envision_quote_content") else []
	)
	for comment in frappe.get_all(
		"Comment",
		filters={"reference_doctype": doctype, "reference_name": name, "comment_type": "Comment"},
		fields=["content", *quote],
	):
		texts.extend(comment.values())
	return {path for text in texts for path in _image_paths(text)}


def _image_paths(html: str | None) -> set[str]:
	# A File records the path only; a public image is stored with whatever
	# host the site had when it was saved, and a private one with its ?fid=.
	paths = set()
	for src in _IMAGE_SRC.findall(html or ""):
		try:
			paths.add(unquote(urlsplit(unescape(src)).path))
		except ValueError:
			continue
	return paths
