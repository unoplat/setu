# CLAUDE.md

## Stack
- Frappe: `{{FRAPPE_VERSION}}` | ERPNext: `{{ERPNEXT_VERSION}}` | Other apps: `{{HRMS / INDIA_COMPLIANCE / ...}}`
- App: `{{APP_NAME}}` | Bench: `{{BENCH_PATH}}` | Dev site: `{{SITE}}` | Test site: `{{TEST_SITE}}` | Prod: `{{PROD_SITE}}`
- Python `{{PY_VERSION}}`, Node `{{NODE_VERSION}}`
- Use only APIs that exist in the version above. Unsure? Read `apps/frappe` / `apps/erpnext`. Don't guess.

## Commands
```bash
bench --site {{SITE}} migrate                 # always pass --site
bench build --app {{APP_NAME}}
bench --site {{TEST_SITE}} run-tests --app {{APP_NAME}}
bench --site {{TEST_SITE}} run-tests --doctype "<DocType>"
bench --site {{TEST_SITE}} run-tests --module <dotted.path.test_x> --test <test_name>
bench --site {{SITE}} export-fixtures --app {{APP_NAME}}
pre-commit run --files <changed files>
```
- Tests only on `{{TEST_SITE}}` (needs `set-config allow_tests true` once). Never on the dev site.
- Ask before `reinstall`, `drop-site`, `restore` or any `--force`. Never run anything on `{{PROD_SITE}}`.
- `bench start` only in the background, and only if not already running.

## Skills
- Install from [frappe/skills](https://github.com/frappe/skills) and commit them to the repo:
  `npx skills add frappe/skills --skill frappe-app-dev --skill frappe-code-review --skill fix-issue --skill ship-it`
- `frappe-app-dev` for how-to. `frappe-code-review` before every PR. `/fix-issue` for bug tickets. `/ship-it` to get a branch to a merge-ready PR.
- Skills target recent Frappe. If one conflicts with this file or `{{FRAPPE_VERSION}}`, this file wins.

## How to work
- Read how the app already does it first. Match existing patterns and style.
- Over ~3 files: plan first and confirm.
- Unsure about business logic or the client's process? Ask. Don't invent it.
- Bug: reproduce first, fix the cause not the symptom, smallest diff.
- Done = migrate clean + tests pass + pre-commit pass. Run them, don't assume.

## Golden rules
- Never edit, monkey-patch or copy core files. Use `doc_events`, `override_doctype_class` (sparingly), Custom Fields, Property Setters, fixtures.
- New doctype: write the JSON and let migrate create it. Don't `mkdir` doctype folders.
- Hand-edited doctype JSON: bump `modified`, or migrate skips it.
- Fixtures: always filtered by module or name. Never export all Custom Fields / Property Setters.
- Field and doctype changes sync through migrate. Existing data that must change needs a patch in `patches.txt`: new defaults on Single doctypes, field type changes, new mandatory or unique fields, renamed or moved data.
- Patches: idempotent, ordered after what they read, tested on a site with real data (empty tables always "pass").
- Small, focused diffs. Unrelated changes go in separate PRs.

## Queries: always Query Builder
- Every query beyond a simple ORM call goes through `frappe.qb`: selects, joins, aggregates, updates, deletes, subqueries.
- Use `frappe.qb.get_query(...)` where `{{FRAPPE_VERSION}}` has it; otherwise `frappe.qb.DocType(...)`.
- qb skips permissions, and so do `get_all`, `get_value`, `exists` and `count`. In user-facing APIs, check permission first and read lists with `get_list` (or `get_query(..., ignore_permissions=False)` where supported).
- Simple ORM calls are fine: `get_doc`, `get_value`, `exists`, `count`, and `get_list` (`get_all` only in server-side logic).
- No new `frappe.db.sql`. Only when qb truly can't express it (e.g. a CTE), with `%s` params and a comment saying why.
- Raw SQL in lines you're already changing? Convert it to qb. Don't rewrite untouched code in the same PR.
- Functions from `frappe.query_builder.functions` (`Sum`, `Count`, `IfNull`, `Coalesce`) and `Case` from `frappe.query_builder`, not SQL strings. No raw strings in `.where()` and never user input in `Field()` / `DocType()`.

```python
from frappe.query_builder.functions import Sum
si = frappe.qb.DocType("Sales Invoice")
rows = (
    frappe.qb.from_(si)
    .select(si.customer, Sum(si.grand_total).as_("total"))
    .where((si.docstatus == 1) & (si.company == company))
    .groupby(si.customer)
).run(as_dict=True)
```

## Security (critical)
- No SQL built with `.format()`, f-strings or `+`. Ever.
- Every `@frappe.whitelist()`:
  - checks permission (`frappe.has_permission(..., throw=True)` / `doc.check_permission()`), ideally inside the controller method
  - has type hints on every arg (v15+ validates them; blocks filter-list injection like `{"key": ["!=", ""]}`). On older versions, also check with `isinstance`.
  - declares `methods=["GET"]` for reads or `["POST"]` for writes (GET doesn't commit)
  - reads lists with `get_list`, not `get_all` or plain qb (see Queries for what skips permissions)
- `allow_guest=True`: think 10 times. Return only fields a guest needs, validate input, rate-limit.
- `ignore_permissions=True`: never to bypass checks on data the caller asked for. Only for system-side records (logs, internal docs, jobs), with a comment why.
- No mass assignment: never `doc.update(frappe.form_dict)` or `**kwargs` from the client. Set only the fields you allow.
- `set_value` / `db.delete` with a name or filter that could be `None` or empty changes every row; `get_value` returns an arbitrary one. Guard it.
- No `eval` / `exec`. Never run a client-supplied method path. Secrets in Password fields, never in logs.
- JS calls must point to a real whitelisted method. No `frappe.client.*` from server code.
- XSS: escape user input right before putting it in HTML, Jinja or JS. Don't "fix" by stripping characters.
- User file paths: no traversal outside the site folder. Prefer the File doctype.

## Transactions & framework fit
- Don't call `frappe.db.commit()` or a full `frappe.db.rollback()`. Requests (POST/PUT), jobs and patches auto-commit at the end; uncaught errors auto-rollback.
- Why: a mid-way commit makes the work before it permanent. If a later step fails, you're left with half-saved data (e.g. a voucher without its GL entries).
- Never commit in: controllers, `doc_events`, `validate` / `on_submit` hooks, whitelisted methods, tests (it breaks test rollback).
- Writes in a GET request are lost. Fix with `methods=["POST"]`, not a commit.
- Job needs data written in this request? `enqueue(..., enqueue_after_commit=True)`, not a commit.
- Need to undo part of the work? `frappe.db.savepoint()` + `rollback(save_point=...)`, not a full rollback.
- Explicit commit or full rollback is allowed only in background jobs, patches and the entry-point handlers below, with a comment saying why:
  - Big batch work: commit every N records so one failure doesn't lose everything and locks stay short.
  - Before calling an external API that moves money or can't be undone (bank payments, e-invoice, GST): commit the "initiated" state first, and check it before sending, so a retry can't send it twice. So these calls run in a job, not in the request.
  - Wrap each batch in try/except: on failure `rollback()`, then `frappe.log_error()`, then continue or stop on purpose.
- Entry points are the only place for a broad `except Exception`:
  - Scheduler and enqueued jobs: `frappe.db.rollback()` first (a caught error is not auto-rolled back, so partial work would be committed), then `frappe.log_error()`.
  - `after_install` / `after_migrate`: catch, add context to the message, and re-raise so install or migrate fails loudly.
- Hooks: validation in `validate`, side effects in `on_submit` / `on_update`. In `validate` / `before_*` just set `self.field`. In `on_*` / `after_*` use `self.db_set()`. Never `doc.save()` inside its own hooks.
- `frappe.db.set_value` / `db_set` skip validation and hooks. Outside the doc's own post-save hooks, never use them for status or state changes; load the doc and save it.
- Errors: `frappe.throw(_("..."))` with a specific message naming the field, row and old → new value.
- Don't put `frappe.throw` inside `try/except Exception`; the except swallows it.
- `override_doctype_class`: inherit the original and call `super()`. Never replace a whole core controller.
- JS: call doc methods with `frm.call("method")`. Use `frappe.call` with a dotted path only for module-level functions.
- Long work: `frappe.enqueue(..., queue="long")` or `enqueue_doc`.
- Check-then-insert is a race. Use a unique constraint.
- Don't wrap a whitelisted doc method in a separate `api.py` function. Call it directly.

## ERPNext specifics
- Never insert GL Entry / Stock Ledger Entry / Payment Ledger Entry directly. Go through the standard vouchers.
- Use `flt(x, precision)`, `cint`, `getdate`, `nowdate`, `now_datetime`. Round currency with the field's precision; never compare raw floats. No `datetime.now()` (ignores the site time zone).
- Never hardcode company, accounts, warehouses, naming series. Respect company, currency, fiscal year.
- Silent ledger or stock corruption is the worst bug. Fail loudly over posting wrong entries.

## Performance
- Common reads < 100ms, writes < 5s, never > 10s in a request.
- No DB calls in loops in request code (`get_doc`, `get_value`, `set_value`, `sql`). Batch with `["in", names]` or one query. Background jobs may loop, in batches.
- One field? `frappe.db.get_value` (or `get_cached_value` for rarely changing masters), not `get_doc`.
- Delete one doc with `frappe.delete_doc`. Bulk delete with qb or `frappe.db.delete` only when the doctype has no `on_trash` / `after_delete` hooks, child tables or links to clean up (it skips all of them).
- Aggregate in the query (qb `Sum`, `Count`), not in Python. Bound scans on big tables.
- Use the `doc` passed into hooks; don't reload it.
- `doc_events` on busy core doctypes (Sales Invoice, Stock Entry, GL/Stock Ledger Entry, `"*"`) run on every save. Keep them light, no queries in loops; move heavy work to `enqueue`.
- Keep `validate` light: no queries in loops there either.
- Indexes on filtered fields, declared in code (`search_index` / patch), never added by hand.
- Cache with `@redis_cache` / `@request_cache` / `@site_cache` (check which exist in `{{FRAPPE_VERSION}}`). Never hand-roll caches in `frappe.local` / `frappe.flags`.
- JS: no `frappe.call` / `frappe.db.get_value` in a loop.

## Code quality
- No commented-out code, unused imports/functions/classes, unreachable code.
- No `print()`; use `frappe.logger()` or `frappe.log_error()`.
- No copy-pasted logic blocks; extract a shared function.
- Don't shadow builtins (`list`, `filter`, `type`, `id`...).
- Never assume a DB read returned something. Handle `None` / empty before indexing.
- Naming: DocType names in Title Case, fieldnames in snake_case.
- No `global` or mutable class-level state. No `except: pass`. Catch specific errors and log (entry points: see Transactions).
- Max ~5 params; new params go last as keyword args with `None` defaults.
- Boring, readable code over clever one-liners. Type hints over describing types in docstrings.
- Strings: `"".join()` or lists, not `+=` in loops. User-facing strings in `_()` / `__()`.

## Tests
- Every new doctype gets real tests, not the empty stub: validation, permissions, submit/cancel.
- Base class per version: `IntegrationTestCase` / `UnitTestCase` (v16+), `FrappeTestCase` (v14, v15), `unittest.TestCase` (v13). Check `{{FRAPPE_VERSION}}`.
- The test framework rolls back data on v14+; on v13 clean up in `tearDown`. Create data in `setUp`; don't depend on site data or other tests.
- Deterministic: no `random`, use `freeze_time` for dates.
- Non-trivial bug fix = regression test that fails without the fix (overrides `/fix-issue`, which asks for one on every fix).
- Had to change an existing test's assertion? That's a red flag. Explain why in the PR.

## Before PR
Run `frappe-code-review`. Quick check: qb not raw SQL | whitelist perms + type hints | get_all / qb in API | mass assignment | commit/rollback | ignore_permissions | None filters | loops / N+1 | patches | `modified` bumped | fixtures filtered | tests run | no dead code

## Git
- Branch `feat/<desc>` or `fix/<desc>`. Conventional commits: `fix: ...`, `feat: ...`.
- Never commit `site_config.json`, keys or `.env`.
