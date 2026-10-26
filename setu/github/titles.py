"""Issue titles longer than a Task subject continue in the Task's description.

ERPNext holds a Task subject to ``reconcile.subject_limit()`` characters as
Frappe stores it, and GitHub an Issue title to 256. A longer Issue title is
neither a conflict nor shortened on GitHub (approved 2026-10-25): the subject
takes the title's first characters, and a generated note at the top of the
description holds all the rest, exactly:

    <p data-github-title-continuation="1"><strong>GitHub title continuation:</strong> …the rest</p>

The Task's title is its subject followed by the note's text after "…"
(``title``), and that whole title is what syncs:

- an edit to the subject or to the note, or deleting the note, is a title
  edit, pushed whole. Nothing shortens a title to fit GitHub: one longer than
  GitHub allows is an error that keeps both sides as they are;
- the description syncs without the note (``content``), so it never reaches
  the Issue body and never counts as a description edit;
- a title from GitHub rewrites or removes the note, and a description from
  GitHub keeps it (``compose``).

Only a marked first paragraph is a note. Frappe and Envision's paragraph
extension preserve the marker. Literal label paragraphs are always ordinary
description. An editor that strips the marker produces a visible conflict
before either field is changed, never a guess that can delete user content.

Frappe sanitizes Data and Small Text values that look like HTML, which can
make them longer. A subject is fitted as it will be stored (``split``), and
titles compare as stored, whitespace collapsed (``same``).
"""

import re
from html import escape

from bs4 import BeautifulSoup, NavigableString, Tag
from frappe.utils import sanitize_html

LABEL = "GitHub title continuation:"
# Marks the note Envision wrote. Frappe keeps data-* attributes.
MARKER = "data-github-title-continuation"
# The label, then the rest after "…": a space right after "…" is the title's.
_NOTE = re.compile(r"\s*GitHub\s+title\s+continuation:\s*…?(.*)", re.DOTALL)


def stored(value: str) -> str:
	"""A Data or Small Text value as Frappe saves it: one holding ``<`` or ``>``
	is sanitized (Document._sanitize_content), which can lengthen it."""
	if "<" not in value and ">" not in value:
		return value
	return sanitize_html(value)


def split(title: str, limit: int) -> tuple[str, str]:
	"""A title as the longest subject Frappe stores in at most ``limit``
	characters, and the rest, exactly. Spaces at the cut go with the rest."""
	end = min(len(title), limit)
	while end and len(stored(title[:end].rstrip())) > limit:
		end -= 1
	subject = title[:end].rstrip()
	return subject, title[len(subject) :]


def note(rest: str) -> str:
	"""The note for a title's rest, as safe HTML; "" when nothing continues."""
	if not rest.strip():
		return ""
	return f'<p {MARKER}="1"><strong>{LABEL}</strong> …{escape(rest, quote=False)}</p>'


def continues(limit: int, *baselines: str | None) -> bool:
	"""Whether a last synced title was longer than a subject holds. Only then
	is an unmarked first paragraph starting with the label the note."""
	return any(bool(split(value or "", limit)[1].strip()) for value in baselines)


def title(subject: str | None, html: str | None, continued: bool) -> str:
	"""The Task's whole title: its subject, then its note's text after "…"."""
	found = _find(_soup(html), continued)
	rest = _rest(found) if found is not None else ""
	return ((subject or "").strip() + rest).rstrip()


def same(value: str, baseline: str | None) -> bool:
	"""Whether a title equals one Frappe stored, whitespace aside."""
	return _words(stored(value)) == _words(stored(baseline or ""))


def content(html: str | None, continued: bool) -> str:
	"""The description without its note: what syncs as the description."""
	soup = _soup(html)
	found = _find(soup, continued)
	if found is None:
		return html or ""
	found.decompose()
	return str(soup).strip()


def compose(html: str | None, content_html: str | None, note_html: str | None, continued: bool) -> str:
	"""The description to save, from the current one (``html``).

	- ``content_html`` replaces the description without its note; None keeps it.
	- ``note_html`` replaces the note (``note``), "" removes it; None keeps it.

	A note whose text is already right keeps its markup, and the description
	is then returned unchanged. The note always goes first.
	"""
	soup = _soup(html)
	found = _find(soup, continued)
	if found is None and note_html is not None:
		# A chosen title repairs ambiguous/split notes without deleting their
		# text: old fragments become ordinary description paragraphs.
		for paragraph in soup.find_all("p", attrs={MARKER: True}):
			del paragraph[MARKER]
		html = str(soup)
	if note_html is not None and _text(found) == _text(_soup(note_html)):
		note_html = None
	if note_html is None and content_html is None:
		return html or ""
	if note_html is None:
		note_html = str(found) if found is not None else ""
	if content_html is None:
		if found is None:
			content_html = html or ""
		else:
			found.decompose()
			content_html = str(soup)
	return note_html + content_html.strip()


def _soup(html: str | None) -> BeautifulSoup:
	return BeautifulSoup((html or "").strip(), "html.parser")


def unmarked(html: str | None) -> bool:
	"""Whether a leading label paragraph lost its provenance marker.

	Callers only treat this as ambiguous when a synced title continued.
	Never strip the paragraph or guess whether it was written by a person.
	"""
	soup = _soup(html)
	marked = soup.find_all("p", attrs={MARKER: True})
	if len(marked) > 1:
		return True
	for child in soup.children:
		if isinstance(child, NavigableString) and not child.strip():
			continue
		if marked:
			return _find(soup, False) is None
		return bool(
			isinstance(child, Tag) and child.name == "p" and _NOTE.match(child.get_text()) is not None
		)
	return bool(marked)


def _find(soup: BeautifulSoup, _continued: bool) -> Tag | None:
	# A split can copy the attribute to both halves despite keepOnSplit.
	# Never guess which fragment contains the real continuation.
	if len(soup.find_all("p", attrs={MARKER: True})) != 1:
		return None
	for child in soup.children:
		if isinstance(child, NavigableString) and not child.strip():
			continue
		if (
			isinstance(child, Tag)
			and child.name == "p"
			and child.get(MARKER) == "1"
			and _NOTE.match(child.get_text()) is not None
		):
			return child
		return None
	return None


def _rest(found: Tag) -> str:
	# The editor may write spaces as &nbsp;.
	text = found.get_text().replace("\xa0", " ")
	match = _NOTE.match(text)
	return match.group(1) if match else ""


def _text(markup: Tag | None) -> str:
	# What a reader sees.
	return _words(markup.get_text()) if markup is not None else ""


def _words(text: str) -> str:
	return " ".join(text.split())
