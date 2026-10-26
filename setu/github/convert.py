"""GitHub Issue body (Markdown) ↔ Envision Task description (editor HTML).

docs/github-description-fidelity.md is the contract. In short:

- ``markdown_to_html`` renders an Issue body the way GitHub shows it in an
  Issue (CommonMark plus tables, strikethrough and task lists; a newline is a
  line break) into the markup Envision's description editor writes
  (frontend/src/components/create-project/description-extensions.ts), then
  through Frappe's sanitizer. Raw HTML is shown as text: only ``<br>`` and
  ``<img>`` are rebuilt, from checked attributes. HTML comments, which GitHub
  hides, are dropped.
- ``html_to_markdown`` has markdownify write the editor's markup as Markdown.
  Before that it reports formatting Markdown cannot hold and takes out
  addresses GitHub readers cannot open; after, it renders the Markdown back
  and compares the two, so anything markdownify escapes or nests differently
  is reported instead of published.
- Both report what they could not carry as ``dropped`` codes. ``lossy`` is set
  when one of them changes what a reader sees; callers then keep both versions
  for review instead of overwriting either side.
- ``issue_body`` adds the integration marker and says whether the body differs
  from GitHub's at all. Callers compare ``html_digest``/``markdown_digest``
  with their stored baselines first, so a title or status change never
  converts or rewrites a body.

Nothing here fetches a URL. Addresses only this site can serve (relative,
``/private/…``, ``/api/method/…``) and ``data:`` images are never copied to
GitHub, and inbound images keep GitHub's address instead of being downloaded.
"""

import hashlib
import re
import secrets
from html import escape
from typing import Literal, TypedDict
from urllib.parse import unquote, urlsplit

from bs4 import BeautifulSoup, NavigableString, Tag
from bs4.element import PageElement, PreformattedString
from frappe.utils import sanitize_html
from markdown_it import MarkdownIt
from markdown_it.token import Token
from markdownify import ASTERISK, ATX, BACKSLASH, markdownify

LossCode = Literal[
	# Envision → GitHub: formatting Markdown has no syntax for.
	"underline",
	"subscript",
	"superscript",
	"highlight",
	"text_color",
	"font",
	"alignment",
	"indent",
	"line_height",
	"text_direction",
	"details",
	"columns",
	"table_header",
	"table_span",
	"table_cell_blocks",
	"table_column_width",
	"image_size",
	"image_transform",
	"task_list",
	"mixed_list",
	"unsupported_element",
	"roundtrip_mismatch",
	"body_too_long",
	# Envision → GitHub: addresses GitHub readers cannot open.
	"private_attachment",
	"local_url",
	# Either direction: addresses neither side can show.
	"unsupported_url",
	"inline_data_image",
	# GitHub → Envision.
	"raw_html",
	"html_comment",
	"footnote",
	"alert",
	"math",
	"heading_level",
	"task_item_blocks",
	"mixed_task_list",
	"table_alignment",
	"linked_image",
	"sanitizer_removed",
]
ListKind = Literal["bullet", "ordered", "task"]


class MarkdownResult(TypedDict):
	markdown: str
	lossy: bool
	dropped: list[LossCode]


class HtmlResult(TypedDict):
	html: str
	lossy: bool
	dropped: list[LossCode]


class IssueBody(TypedDict):
	# The whole body to send, integration marker included.
	body: str
	# False when GitHub already has this content: send no body at all.
	changed: bool
	lossy: bool
	dropped: list[LossCode]


# GitHub's documented Issue body limit, in characters.
MAX_BODY_LENGTH = 65536
# Dropped but invisible on GitHub, so they never make a result lossy.
HIDDEN_LOSSES: frozenset[LossCode] = frozenset({"html_comment"})
# Look, not content. Only for describing a conflict: these are reviewed like
# any other loss (approved policy P5).
PRESENTATION_LOSSES: frozenset[LossCode] = frozenset(
	{
		"underline",
		"highlight",
		"text_color",
		"font",
		"alignment",
		"indent",
		"line_height",
		"text_direction",
		"table_column_width",
		"image_size",
		"image_transform",
	}
)

# GitHub shows a newline inside an Issue paragraph as a line break. Raw HTML is
# parsed only so _neutralize_html can tell it from text; it is never rendered
# as written.
_markdown = MarkdownIt("commonmark", options_update={"html": True, "breaks": True}).enable(
	["table", "strikethrough"]
)

_MARKER = re.compile(r"[ \t]*<!-- envision:([A-Za-z0-9_-]{8,64}) -->[ \t]*")
_MARKER_VALUE = re.compile(r"[A-Za-z0-9_-]{8,64}")
_RAW_SAFE = re.compile(r"<!--[\s\S]*?-->|<br\s*/?>|<img\b[^<>]*>", re.IGNORECASE)
_HTML_TAG = re.compile(r"<[A-Za-z/!?]")
_TASK_MARKER = re.compile(r"\[([ xX])\](?:[ \t]+|$)")
_ALERT = re.compile(r"\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]", re.IGNORECASE)
_FOOTNOTE = re.compile(r"\[\^[^\]\s]+\]")
_FOOTNOTE_DEFINITION = re.compile(r"^ {0,3}\[\^[^\]\s]+\]:", re.MULTILINE)
# GitHub's inline and block math. A lone "$5" or "$5 and $10" is not math.
_MATH = re.compile(r"\$\$|(?<![\\$\w])\$(?=[^\s$])[^$\n]+?(?<=[^\s$\\])\$(?![\w$])")
_WIDTH = re.compile(r"\d{1,5}%?")
_LANGUAGE = re.compile(r"[\w+#.-]{1,40}")
_WHITESPACE = re.compile(r"\s+")
_EDGES = re.compile(r"(\s*)(.*?)(\s*)", re.DOTALL)
_SPACES = re.compile(r" {2,}")
_BREAK_SPACES = re.compile(r" *\n *")
# Line breaks and images in _canonical_inline: atoms, never merged or marked.
_BREAK = frozenset({"\x00br"})
_IMAGE = frozenset({"\x00img"})

_HEADINGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
_BLOCK_TAGS = frozenset(
	{
		"address",
		"article",
		"aside",
		"blockquote",
		"caption",
		"col",
		"colgroup",
		"dd",
		"details",
		"div",
		"dl",
		"dt",
		"figcaption",
		"figure",
		"footer",
		"header",
		"hr",
		"li",
		"ol",
		"p",
		"pre",
		"section",
		"summary",
		"table",
		"tbody",
		"td",
		"tfoot",
		"th",
		"thead",
		"tr",
		"ul",
		*_HEADINGS,
	}
)
_VOID_TAGS = frozenset({"area", "br", "col", "hr", "img", "input", "wbr"})
_PLAIN_LANGUAGES = frozenset({"plaintext", "plain", "text", "txt"})
_DEFAULT_ALIGNMENTS = frozenset({"", "left", "start"})
# What markdownify writes as GitHub Markdown, as the editor uses it. Labels
# and inputs are a task item's checkbox, reported with its list.
_SUPPORTED_TAGS = frozenset(
	{
		"a",
		"b",
		"blockquote",
		"br",
		"code",
		"col",
		"colgroup",
		"del",
		"div",
		"em",
		"hr",
		"i",
		"img",
		"input",
		"label",
		"li",
		"ol",
		"p",
		"pre",
		"s",
		"span",
		"strong",
		"table",
		"tbody",
		"td",
		"tfoot",
		"th",
		"thead",
		"tr",
		"ul",
		*_HEADINGS,
	}
)
# Editor formatting Markdown has no syntax for; markdownify keeps the text.
_TAG_LOSSES: dict[str, LossCode] = {
	"details": "details",
	"summary": "details",
	"mark": "highlight",
	"sub": "subscript",
	"sup": "superscript",
	"u": "underline",
}
_STYLED_BLOCKS = frozenset({"blockquote", "div", "li", "p", "td", "th", *_HEADINGS})
_CLOSED_BY_BREAK = frozenset({"p", "li", "td", "th", *_HEADINGS})


def markdown_to_html(markdown: str | None) -> HtmlResult:
	"""An Issue body as sanitized description HTML, and what it could not carry.

	The HTML is what Frappe's sanitizer keeps. Saving it on a Task sanitizes it
	again (Text Editor fields also link bare addresses), so callers take their
	``html_digest`` baseline from the value the Task holds after saving, not
	from this result.
	"""
	dropped: list[LossCode] = []
	html = _render(markdown or "", dropped)
	if not html:
		return {"html": "", "lossy": _lossy(dropped), "dropped": dropped}
	clean = sanitize_html(html, always_sanitize=True).strip()
	if _canonical_html(clean) != _canonical_html(html):
		_flag(dropped, "sanitizer_removed")
	return {"html": clean, "lossy": _lossy(dropped), "dropped": dropped}


def html_to_markdown(html: str | None, *, site_url: str | None = None) -> MarkdownResult:
	"""A description's HTML as GitHub Markdown, and what it could not carry.

	``site_url`` limits the private-address check to this site's host; without
	it, any ``/private/…`` or ``/api/method/…`` address counts as private.
	"""
	source = (html or "").strip()
	if not source:
		return {"markdown": "", "lossy": False, "dropped": []}
	dropped: list[LossCode] = []
	soup = BeautifulSoup(source, "html.parser")
	_prepare(soup, _hostname(site_url) if site_url else None, dropped)
	prepared = str(soup)
	markdown = markdownify(
		prepared,
		autolinks=True,
		bullets="-",
		code_language_callback=_fence_language,
		escape_asterisks=True,
		escape_misc=True,
		escape_underscores=True,
		heading_style=ATX,
		keep_inline_images_in=["div", "p", "span", "td", "th"],
		newline_style=BACKSLASH,
		strong_em_symbol=ASTERISK,
		table_infer_header=False,
	).strip()
	# Only worth checking when nothing was reported: then any difference is
	# something markdownify escaped or nested in a way that changes the Issue.
	if not dropped and _canonical_html(_render(markdown, [])) != _canonical_html(prepared):
		_flag(dropped, "roundtrip_mismatch")
	return {"markdown": markdown, "lossy": _lossy(dropped), "dropped": dropped}


def issue_body(
	html: str | None, *, marker: str, remote_body: str | None = None, site_url: str | None = None
) -> IssueBody:
	"""The Issue body for a description, ready to create or update an Issue.

	- ``remote_body`` is GitHub's current body; leave it out when creating.
	  Its marker, if any, is kept, so a body only ever carries one.
	- ``changed`` is False when GitHub already shows this content (markers,
	  line endings and trailing spaces aside): send no ``body`` field then.
	- A ``body_too_long`` result must not be sent; GitHub would refuse it.
	"""
	result = html_to_markdown(html, site_url=site_url)
	body = add_marker(result["markdown"], find_marker(remote_body) or marker)
	dropped = list(result["dropped"])
	if len(body) > MAX_BODY_LENGTH:
		_flag(dropped, "body_too_long")
	changed = remote_body is None or normalize_markdown(body) != normalize_markdown(remote_body)
	return {"body": body, "changed": changed, "lossy": _lossy(dropped), "dropped": dropped}


def body_reproducible(markdown: str | None) -> bool:
	"""Whether a description can show everything a reader sees in this body.

	When it cannot (raw HTML, footnotes, math...), replacing the body with the
	description's Markdown would lose that content on GitHub, so callers keep
	both versions for review instead.
	"""
	return not markdown_to_html(markdown)["lossy"]


def normalize_markdown(markdown: str | None) -> str:
	"""An Issue body for comparison: no marker, LF endings, no trailing spaces."""
	lines = strip_marker(_unify_newlines(markdown or "")).split("\n")
	return "\n".join(line.rstrip() for line in lines).strip("\n")


def normalize_html(html: str | None) -> str:
	"""Description HTML for comparison.

	Attributes sorted, comments dropped, whitespace collapsed outside ``pre``,
	whitespace between blocks and trailing empty paragraphs removed.
	"""
	markup = _normal_children(BeautifulSoup((html or "").strip(), "html.parser"))
	while markup.endswith("<p></p>"):
		markup = markup.removesuffix("<p></p>")
	return markup


def digest(text: str) -> str:
	return hashlib.sha256(text.encode()).hexdigest()


def html_digest(html: str | None) -> str:
	"""The baseline value for a Task description."""
	return digest(normalize_html(html))


def markdown_digest(markdown: str | None) -> str:
	"""The baseline value for an Issue body."""
	return digest(normalize_markdown(markdown))


def description_changed(html: str | None, baseline: str | None) -> bool:
	"""Whether the description differs from the last one synchronized."""
	return html_digest(html) != baseline


def body_changed(markdown: str | None, baseline: str | None) -> bool:
	"""Whether the Issue body differs from the last one synchronized."""
	return markdown_digest(markdown) != baseline


def new_marker() -> str:
	"""An opaque marker for one Issue create, used to find it after a timeout."""
	return secrets.token_urlsafe(18)


def find_marker(markdown: str | None) -> str | None:
	match = _MARKER.search(markdown or "")
	return match.group(1) if match else None


def strip_marker(markdown: str | None) -> str:
	return _MARKER.sub("", markdown or "").rstrip()


def add_marker(markdown: str | None, marker: str) -> str:
	"""The body with one marker at its end: an HTML comment GitHub hides."""
	if not _MARKER_VALUE.fullmatch(marker):
		raise ValueError("Invalid GitHub integration marker.")
	body = strip_marker(markdown)
	comment = f"<!-- envision:{marker} -->"
	return f"{body}\n\n{comment}" if body else comment


# Inbound: Markdown → editor HTML.


def _render(markdown: str, dropped: list[LossCode]) -> str:
	# The unsanitized editor HTML for a body; html_to_markdown's check uses it
	# too, so both directions agree on what Markdown means.
	source = strip_marker(_unify_newlines(markdown))
	if not source.strip():
		return ""
	tokens = _markdown.parse(source)
	if _FOOTNOTE_DEFINITION.search(source):
		_flag(dropped, "footnote")
	_note_extensions(tokens, dropped)
	_neutralize_html(tokens, dropped)
	_mark_task_items(tokens)
	soup = BeautifulSoup(_markdown.renderer.render(tokens, _markdown.options, {}), "html.parser")
	_to_editor_markup(soup, dropped)
	_drop_layout_whitespace(soup)
	return str(soup).strip()


def _note_extensions(tokens: list[Token], dropped: list[LossCode]) -> None:
	# GitHub features CommonMark reads as plain text: the text survives, but
	# GitHub shows something else, and escaping it on the way back would
	# break it there.
	for index, token in enumerate(tokens):
		if token.type == "fence" and (token.info.split() or [""])[0].lower() == "math":
			_flag(dropped, "math")
		elif (
			token.type == "blockquote_open"
			and index + 2 < len(tokens)
			and tokens[index + 2].type == "inline"
			and _ALERT.match(tokens[index + 2].content)
		):
			_flag(dropped, "alert")
		elif token.type == "inline" and token.children:
			text = "".join(child.content if child.type == "text" else "\x00" for child in token.children)
			if _FOOTNOTE.search(text):
				_flag(dropped, "footnote")
			if _MATH.search(text):
				_flag(dropped, "math")


def _neutralize_html(tokens: list[Token], dropped: list[LossCode]) -> None:
	for token in tokens:
		if token.type == "html_block":
			token.content = _raw_html(token.content, dropped, block=True)
		elif token.type == "inline" and token.children:
			for child in token.children:
				if child.type == "html_inline":
					child.content = _raw_html(child.content, dropped, block=False)


def _raw_html(raw: str, dropped: list[LossCode], *, block: bool) -> str:
	# Raw HTML from an Issue body, made safe: comments go, <br> and <img> are
	# rebuilt from checked attributes, and everything else is shown as the
	# text it is rather than interpreted.
	parts: list[str] = []
	position = 0
	unsafe = False
	for match in _RAW_SAFE.finditer(raw):
		text = raw[position : match.start()]
		unsafe = unsafe or bool(_HTML_TAG.search(text))
		parts.append(escape(text, quote=False))
		parts.append(_safe_tag(match.group(0), dropped))
		position = match.end()
	tail = raw[position:]
	unsafe = unsafe or bool(_HTML_TAG.search(tail))
	parts.append(escape(tail, quote=False))
	if unsafe:
		_flag(dropped, "raw_html")
	html = "".join(parts)
	if not block:
		return html
	html = html.strip()
	if not html:
		return ""
	if unsafe:
		html = html.replace("\n", "<br>")
	return f"<p>{html}</p>\n"


def _safe_tag(raw: str, dropped: list[LossCode]) -> str:
	if raw.startswith("<!--"):
		_flag(dropped, "html_comment")
		return ""
	if raw[:3].lower() == "<br":
		return "<br>"
	image = BeautifulSoup(raw, "html.parser").find("img")
	if not isinstance(image, Tag):
		_flag(dropped, "raw_html")
		return escape(raw, quote=False)
	source = _attr(image, "src").strip()
	scheme = _scheme(source)
	if scheme not in ("http", "https"):
		_flag(dropped, "inline_data_image" if scheme == "data" else "unsupported_url")
		return escape(_attr(image, "alt"), quote=False)
	attributes = {"src": source, "alt": _attr(image, "alt")}
	width = _attr(image, "width").strip()
	if _WIDTH.fullmatch(width):
		attributes["width"] = width
	align = _attr(image, "align").strip().lower()
	if align in ("left", "right"):
		attributes["align"] = align
	title = _attr(image, "title")
	if title:
		attributes["title"] = title
	return _image_tag(attributes)


def _mark_task_items(tokens: list[Token]) -> None:
	# GitHub task list items: "[ ] " or "[x] " opening a list item's first
	# paragraph. The marker leaves the text; _to_editor_list reads the mark.
	for index in range(2, len(tokens)):
		token = tokens[index]
		if (
			token.type != "inline"
			or tokens[index - 1].type != "paragraph_open"
			or tokens[index - 2].type != "list_item_open"
		):
			continue
		first = token.children[0] if token.children else None
		if first is None or first.type != "text":
			continue
		match = _TASK_MARKER.match(first.content)
		if match is None:
			continue
		first.content = first.content[match.end() :]
		tokens[index - 2].attrSet("data-task", "false" if match.group(1) == " " else "true")


def _to_editor_markup(soup: BeautifulSoup, dropped: list[LossCode]) -> None:
	# The editor keeps three heading levels and has no table cell alignment.
	for heading in soup.find_all(["h4", "h5", "h6"]):
		if isinstance(heading, Tag):
			heading.name = "h3"
			_flag(dropped, "heading_level")
	for cell in soup.find_all(["th", "td"]):
		if isinstance(cell, Tag) and cell.has_attr("style"):
			del cell["style"]
			_flag(dropped, "table_alignment")
	for link in soup.find_all("a"):
		if isinstance(link, Tag):
			_to_editor_link(link, dropped)
	for code in soup.find_all("code"):
		if isinstance(code, Tag) and isinstance(code.parent, Tag) and code.parent.name == "pre":
			_strip_final_newline(code)
	for image in soup.find_all("img"):
		if isinstance(image, Tag):
			_to_editor_image(soup, image, dropped)
	for listing in soup.find_all(["ul", "ol"]):
		if isinstance(listing, Tag):
			_to_editor_list(soup, listing, dropped)


def _to_editor_link(link: Tag, dropped: list[LossCode]) -> None:
	# Addresses relative to the repository mean nothing on this site.
	address = _attr(link, "href").strip()
	if _scheme(address) not in ("http", "https", "mailto"):
		_flag(dropped, "unsupported_url")
		link.unwrap()
		return
	attributes = {"href": address, "rel": "noopener noreferrer"}
	title = _attr(link, "title")
	if title:
		attributes["title"] = title
	link.attrs = attributes


def _strip_final_newline(code: Tag) -> None:
	# Markdown ends every code block with a newline the editor would keep as
	# an empty last line.
	strings = [text for text in code.find_all(string=True) if isinstance(text, NavigableString)]
	if strings and str(strings[-1]).endswith("\n"):
		strings[-1].replace_with(NavigableString(str(strings[-1])[:-1]))


def _to_editor_image(soup: BeautifulSoup, image: Tag, dropped: list[LossCode]) -> None:
	# The editor's two image nodes (Image-DK6hTABa.js in reactjs-tiptap-editor):
	# a block image is <div class="image"><img></div>, an inline one
	# <span class="image"><img inline="true"></span>. Its own attributes are
	# stored under data-rte- names (description-html.ts).
	source = _attr(image, "src").strip()
	scheme = _scheme(source)
	if scheme not in ("http", "https"):
		_flag(dropped, "inline_data_image" if scheme == "data" else "unsupported_url")
		image.replace_with(NavigableString(_attr(image, "alt")))
		return
	attributes = {"src": source, "alt": _attr(image, "alt")}
	width = _attr(image, "width")
	if _WIDTH.fullmatch(width):
		attributes["width"] = width
	align = _attr(image, "align").lower()
	if align in ("left", "right"):
		attributes["align"] = align
	caption = _attr(image, "title")
	if caption:
		attributes["data-rte-caption"] = caption
	image.attrs = attributes
	if image.find_parent("a") is not None:
		_flag(dropped, "linked_image")
	parent = image.parent
	if isinstance(parent, Tag) and parent.name == "p" and _sole_child(parent, image):
		wrapper = soup.new_tag("div", attrs={"class": "image"})
		parent.replace_with(wrapper)
		wrapper.append(image)
		return
	image["data-rte-inline"] = "true"
	image.wrap(soup.new_tag("span", attrs={"class": "image"}))


def _to_editor_list(soup: BeautifulSoup, listing: Tag, dropped: list[LossCode]) -> None:
	# The editor's task lists hold only task items, and only bullets.
	items = [child for child in listing.children if isinstance(child, Tag) and child.name == "li"]
	tasks = [item for item in items if item.has_attr("data-task")]
	if not tasks:
		return
	if listing.name == "ol" or len(tasks) < len(items):
		_flag(dropped, "mixed_task_list")
		for item in tasks:
			_restore_task_text(item)
		return
	listing.attrs = {"class": "task-list", "data-type": "taskList"}
	for item in items:
		_to_editor_task_item(soup, item, dropped)


def _restore_task_text(item: Tag) -> None:
	prefix = "[ ] " if _attr(item, "data-task") == "false" else "[x] "
	del item["data-task"]
	first = next((child for child in item.children if not _blank(child)), None)
	target = first if isinstance(first, Tag) and first.name == "p" else item
	target.insert(0, NavigableString(prefix))


def _to_editor_task_item(soup: BeautifulSoup, item: Tag, dropped: list[LossCode]) -> None:
	# TipTap's TaskItem: <li data-type="taskItem" data-checked> holding a
	# checkbox label and a <div> of paragraphs. This editor does not nest
	# task items (content "paragraph+"), so other blocks are reported.
	checked = _attr(item, "data-task") == "true"
	content = soup.new_tag("div")
	paragraph: Tag | None = None
	for child in list(item.children):
		child.extract()
		if isinstance(child, Tag) and child.name in _BLOCK_TAGS:
			paragraph = None
			if child.name != "p":
				_flag(dropped, "task_item_blocks")
			content.append(child)
		elif paragraph is not None:
			paragraph.append(child)
		elif not _blank(child):
			paragraph = soup.new_tag("p")
			paragraph.append(child)
			content.append(paragraph)
	first = next((child for child in content.children if isinstance(child, Tag)), None)
	if first is None or first.name != "p":
		content.insert(0, soup.new_tag("p"))
	item.attrs = {
		"class": "task-list-item",
		"data-checked": "true" if checked else "false",
		"data-type": "taskItem",
	}
	label = soup.new_tag("label")
	checkbox = soup.new_tag("input", attrs={"type": "checkbox"})
	if checked:
		checkbox["checked"] = "checked"
	label.append(checkbox)
	label.append(soup.new_tag("span"))
	item.append(label)
	item.append(content)


def _drop_layout_whitespace(soup: BeautifulSoup) -> None:
	# The renderer's newlines between blocks; the editor ignores them.
	for text in list(soup.find_all(string=True)):
		if (
			not isinstance(text, NavigableString)
			or isinstance(text, PreformattedString)
			or str(text).strip()
			or "\n" not in str(text)
			or text.find_parent("pre") is not None
		):
			continue
		if _block_or_none(text.previous_sibling) and _block_or_none(text.next_sibling):
			text.extract()


# Outbound: editor HTML → Markdown, written by markdownify.
#
# _prepare only reads the editor's markup, except for four changes
# markdownify needs: addresses GitHub readers cannot open are taken out (their
# text stays), Desk's Quill bullet lists become <ul>, an image caption becomes
# its title, and a line break that ends a block (which Markdown cannot write)
# goes.


def _prepare(soup: BeautifulSoup, site_host: str | None, dropped: list[LossCode]) -> None:
	_drop_closing_breaks(soup)
	for tag in list(soup.find_all(True)):
		if not isinstance(tag, Tag):
			continue
		name = tag.name
		loss = _TAG_LOSSES.get(name)
		if loss:
			_flag(dropped, loss)
		elif name not in _SUPPORTED_TAGS:
			_flag(dropped, "unsupported_element")
		# An image's wrapper is centred by default; its size and float are
		# checked on the image.
		if name in _STYLED_BLOCKS and "image" not in _classes(tag):
			_check_block_style(tag, dropped)
		if name == "span":
			_check_inline_style(tag, dropped)
		elif name == "div":
			_check_div(tag, dropped)
		elif name in ("ul", "ol"):
			_prepare_list(tag, dropped)
		elif name == "table":
			_check_table(tag, dropped)
		elif name == "a":
			_prepare_link(tag, site_host, dropped)
		elif name == "img":
			_prepare_image(tag, site_host, dropped)
	_check_math(soup, dropped)


def _check_block_style(tag: Tag, dropped: list[LossCode]) -> None:
	style = _style(tag)
	classes = _classes(tag)
	if style.get("text-align", "") not in _DEFAULT_ALIGNMENTS or any(
		name.startswith("ql-align-") for name in classes
	):
		_flag(dropped, "alignment")
	if "line-height" in style:
		_flag(dropped, "line_height")
	if (
		_attr(tag, "data-indent") not in ("", "0")
		or any(name in style for name in ("margin-left", "padding-left", "text-indent"))
		or any(name.startswith("ql-indent-") for name in classes)
	):
		_flag(dropped, "indent")
	if _attr(tag, "dir").lower() in ("rtl", "ltr"):
		_flag(dropped, "text_direction")


def _check_inline_style(span: Tag, dropped: list[LossCode]) -> None:
	style = _style(span)
	if any(name in style for name in ("color", "background-color", "background")):
		_flag(dropped, "text_color")
	if any(name in style for name in ("font-family", "font-size")):
		_flag(dropped, "font")
	if "line-height" in style:
		_flag(dropped, "line_height")


def _check_div(div: Tag, dropped: list[LossCode]) -> None:
	classes = _classes(div)
	if "columns" in classes or "column" in classes:
		_flag(dropped, "columns")
	elif any(name.startswith("ql-code-block") for name in classes):
		# Desk's Quill code blocks are lines of <div>, not <pre>.
		_flag(dropped, "unsupported_element")


def _prepare_list(listing: Tag, dropped: list[LossCode]) -> None:
	# markdownify writes no task list checkboxes. Desk's Quill writes every
	# list as <ol>, marking each item; one holding only bullets becomes <ul>.
	kind = _list_kind(listing)
	if kind == "task":
		_flag(dropped, "task_list")
		return
	items = [child for child in listing.children if isinstance(child, Tag) and child.name == "li"]
	marks = {_attr(item, "data-list") for item in items} - {""}
	if {"checked", "unchecked"} & marks:
		_flag(dropped, "task_list")
	if len(marks) > 1:
		_flag(dropped, "mixed_list")
	elif kind == "bullet" and listing.name == "ol":
		listing.name = "ul"


def _check_table(table: Tag, dropped: list[LossCode]) -> None:
	# GitHub tables: one header row first, no spans, one line per cell.
	found = [row for row in table.find_all("tr") if isinstance(row, Tag)]
	# Rows of a nested table are that table's.
	rows = [row for row in found if row.find_parent("table") is table]
	for index, row in enumerate(rows):
		cells = [cell for cell in row.children if isinstance(cell, Tag) and cell.name in ("th", "td")]
		if any((cell.name == "th") != (index == 0) for cell in cells):
			_flag(dropped, "table_header")
		for cell in cells:
			_check_cell(cell, dropped)


def _check_cell(cell: Tag, dropped: list[LossCode]) -> None:
	if _attr(cell, "colspan") not in ("", "1") or _attr(cell, "rowspan") not in ("", "1"):
		_flag(dropped, "table_span")
	if _attr(cell, "data-rte-colwidth") or _attr(cell, "colwidth"):
		_flag(dropped, "table_column_width")
	# markdownify writes a cell on one line, line breaks as spaces.
	blocks = [child for child in cell.children if isinstance(child, Tag) and child.name in _BLOCK_TAGS]
	paragraph = len(blocks) <= 1 and all(block.name in ("p", "div") for block in blocks)
	if not paragraph or cell.find("br") is not None:
		_flag(dropped, "table_cell_blocks")


def _prepare_link(link: Tag, site_host: str | None, dropped: list[LossCode]) -> None:
	address = _attr(link, "href").strip()
	if address and not _publishable(address, site_host, dropped, image=False):
		link.unwrap()


def _prepare_image(image: Tag, site_host: str | None, dropped: list[LossCode]) -> None:
	if "true" in (_attr(image, "data-rte-flipx"), _attr(image, "data-rte-flipy")):
		_flag(dropped, "image_transform")
	# Markdown images have no size or float.
	width = _attr(image, "width").strip()
	align = _attr(image, "align").strip().lower()
	if _WIDTH.fullmatch(width) or align in ("left", "right"):
		_flag(dropped, "image_size")
	address = _attr(image, "src").strip()
	if not address or not _publishable(address, site_host, dropped, image=True):
		image.replace_with(NavigableString(_attr(image, "alt")))
		return
	# The editor stores its caption apart; markdownify writes the title.
	caption = _attr(image, "data-rte-caption")
	if caption and not _attr(image, "title"):
		image["title"] = caption


def _publishable(address: str, site_host: str | None, dropped: list[LossCode], *, image: bool) -> bool:
	# Only addresses a GitHub reader can open. Nothing is fetched.
	try:
		parts = urlsplit(address)
	except ValueError:
		_flag(dropped, "unsupported_url")
		return False
	scheme = parts.scheme.lower()
	if scheme == "mailto" and not image:
		return True
	if scheme == "data":
		_flag(dropped, "inline_data_image" if image else "unsupported_url")
		return False
	if not scheme:
		_flag(dropped, "private_attachment" if _private_path(parts.path) else "local_url")
		return False
	if scheme not in ("http", "https") or not parts.netloc:
		_flag(dropped, "unsupported_url")
		return False
	if _private_path(parts.path) and (site_host is None or parts.hostname == site_host):
		_flag(dropped, "private_attachment")
		return False
	return True


def _drop_closing_breaks(soup: BeautifulSoup) -> None:
	# Markdown cannot end a paragraph with a line break; a reader sees none.
	for line_break in reversed(soup.find_all("br")):
		if not isinstance(line_break, Tag):
			continue
		parent = line_break.parent
		if (
			isinstance(parent, Tag)
			and parent.name in _CLOSED_BY_BREAK
			and all(_blank(sibling) for sibling in line_break.next_siblings)
		):
			line_break.decompose()


def _check_math(soup: BeautifulSoup, dropped: list[LossCode]) -> None:
	# markdownify does not escape "$", and GitHub would show $…$ as math.
	for text in soup.find_all(string=True):
		if (
			isinstance(text, NavigableString)
			and not isinstance(text, PreformattedString)
			and text.find_parent(["code", "pre"]) is None
			and _MATH.search(str(text))
		):
			_flag(dropped, "math")
			return


def _fence_language(pre: Tag) -> str:
	# markdownify's code_language_callback: the fence's info string.
	code = pre.find("code")
	return _code_language(code if isinstance(code, Tag) else pre)


def _private_path(path: str) -> bool:
	# Frappe's private files and method calls need this site's session.
	path = unquote(path).lower()
	return path.startswith(("/private/", "/api/method/")) or "/private/files/" in path


def _list_kind(listing: Tag) -> ListKind:
	# The editor marks task lists; Desk's Quill editor marks list items.
	if _attr(listing, "data-type") == "taskList":
		return "task"
	marks = {
		_attr(item, "data-list") for item in listing.children if isinstance(item, Tag) and item.name == "li"
	}
	if marks and marks <= {"checked", "unchecked"}:
		return "task"
	if listing.name == "ul" or marks == {"bullet"}:
		return "bullet"
	return "ordered"


def _task_checked(item: Tag) -> bool:
	return _attr(item, "data-checked") == "true" or _attr(item, "data-list") == "checked"


def _list_start(listing: Tag) -> int:
	try:
		return min(max(int(_attr(listing, "start") or 1), 0), 999999999)
	except ValueError:
		return 1


def _code_language(code: Tag) -> str:
	for name in _classes(code):
		language = name.removeprefix("language-")
		if language != name:
			if language.lower() in _PLAIN_LANGUAGES or not _LANGUAGE.fullmatch(language):
				return ""
			return language
	return ""


def _image_tag(attributes: dict[str, str]) -> str:
	values = "".join(f' {name}="{escape(value)}"' for name, value in attributes.items())
	return f"<img{values}>"


# Comparison: one form for both sides, so a round trip can be checked.


def _canonical_html(html: str) -> list[str]:
	# What a reader sees, in supported structure: the editor's wrappers
	# (task item labels, list item paragraphs, image wrappers) and
	# whitespace are not part of it.
	return _canonical_blocks(BeautifulSoup(html, "html.parser"))


def _canonical_blocks(parent: Tag) -> list[str]:
	blocks: list[str] = []
	run: list[PageElement] = []
	for child in list(parent.children):
		if isinstance(child, Tag) and child.name in _BLOCK_TAGS:
			_canonical_paragraph(run, blocks)
			run = []
			blocks.extend(_canonical_block(child))
		else:
			run.append(child)
	_canonical_paragraph(run, blocks)
	return blocks


def _canonical_paragraph(nodes: list[PageElement], blocks: list[str]) -> None:
	text = _canonical_inline(nodes)
	if text:
		blocks.append("p:" + text)


def _canonical_block(tag: Tag) -> list[str]:
	name = tag.name
	if name in ("p", "summary") or (name == "div" and "image" in _classes(tag)):
		text = _canonical_inline(list(tag.children))
		return ["p:" + text] if text else []
	if name in _HEADINGS:
		text = _canonical_inline(list(tag.children))
		return [f"h{_HEADINGS[name]}:{text}"] if text else []
	if name in ("ul", "ol"):
		kind = _list_kind(tag)
		items: list[str] = []
		for item in tag.children:
			if not (isinstance(item, Tag) and item.name == "li"):
				continue
			container = item.find("div", recursive=False) if kind == "task" else None
			check = ("[x]" if _task_checked(item) else "[ ]") if kind == "task" else ""
			inner = _canonical_blocks(container if isinstance(container, Tag) else item)
			items.append(f"{check}({';'.join(inner)})")
		label = f"ordered{_list_start(tag)}" if kind == "ordered" else kind
		return [f"{label}({','.join(items)})"]
	if name == "blockquote":
		return [f"quote({';'.join(_canonical_blocks(tag))})"]
	if name == "pre":
		code = tag.find("code")
		source = code if isinstance(code, Tag) else tag
		text = source.get_text().removesuffix("\n")
		return [f"code:{_code_language(source)}:{text}"]
	if name == "hr":
		return ["hr"]
	if name == "table":
		rows: list[str] = []
		for row in tag.find_all("tr"):
			if not (isinstance(row, Tag) and row.find_parent("table") is tag):
				continue
			cells = [
				f"{cell.name}:" + "\n".join(block.removeprefix("p:") for block in _canonical_blocks(cell))
				for cell in row.children
				if isinstance(cell, Tag) and cell.name in ("th", "td")
			]
			rows.append(f"row({','.join(cells)})")
		return [f"table({';'.join(rows)})"]
	if name in ("colgroup", "col"):
		return []
	return _canonical_blocks(tag)


def _canonical_inline(nodes: list[PageElement]) -> str:
	runs: list[tuple[frozenset[str], str]] = []
	for node in nodes:
		_canonical_runs(node, frozenset(), runs)
	merged: list[tuple[frozenset[str], str]] = []
	for marks, text in runs:
		if marks in (_BREAK, _IMAGE):
			merged.append((marks, text))
			continue
		text = _WHITESPACE.sub(" ", text)
		if merged and merged[-1][0] == marks:
			merged[-1] = (marks, merged[-1][1] + text)
		else:
			merged.append((marks, text))
	parts: list[str] = []
	for marks, text in merged:
		if marks == _BREAK:
			parts.append("\n")
		elif marks == _IMAGE:
			parts.append(f"\x00{text}\x00")
		elif not marks:
			parts.append(text)
		else:
			# Spaces at a mark's edge read the same outside it.
			match = _EDGES.fullmatch(text)
			lead, core, trail = match.groups() if match else ("", text, "")
			parts.append(" " if lead else "")
			if core:
				parts.append(f"\x01{','.join(sorted(marks))}\x02{core}\x03")
			parts.append(" " if trail else "")
	text = _BREAK_SPACES.sub("\n", _SPACES.sub(" ", "".join(parts)))
	return text.strip(" \n")


def _canonical_runs(node: PageElement, marks: frozenset[str], runs: list[tuple[frozenset[str], str]]) -> None:
	if isinstance(node, PreformattedString):
		return
	if isinstance(node, NavigableString):
		runs.append((marks, str(node)))
		return
	if not isinstance(node, Tag):
		return
	name = node.name
	if name == "br":
		runs.append((_BREAK, "\n"))
		return
	if name == "img":
		align = _attr(node, "align").lower()
		runs.append(
			(
				_IMAGE,
				"|".join(
					(
						unquote(_attr(node, "src").strip()),
						_WHITESPACE.sub(" ", _attr(node, "alt")).strip(),
						_attr(node, "width") if _WIDTH.fullmatch(_attr(node, "width")) else "",
						align if align in ("left", "right") else "",
					)
				),
			)
		)
		return
	if name == "input":
		return
	if name == "code":
		runs.append((marks | {"code"}, node.get_text()))
		return
	if name in ("strong", "b"):
		marks = marks | {"b"}
	elif name in ("em", "i"):
		marks = marks | {"i"}
	elif name in ("s", "del", "strike"):
		marks = marks | {"s"}
	elif name == "a":
		address = _attr(node, "href").strip()
		# A link showing its own address reads as that address, which
		# GitHub and Frappe both link anyway.
		if address and node.get_text().strip() != address:
			marks = marks | {"a=" + unquote(address)}
	for child in node.children:
		_canonical_runs(child, marks, runs)


def _normal_children(parent: Tag) -> str:
	children = list(parent.children)
	layout = any(isinstance(child, Tag) and child.name in _BLOCK_TAGS for child in children)
	return "".join(_normal_markup(child) for child in children if not (layout and _blank(child)))


def _normal_markup(node: PageElement) -> str:
	if isinstance(node, PreformattedString):
		return ""
	if isinstance(node, NavigableString):
		text = str(node) if node.find_parent("pre") is not None else _WHITESPACE.sub(" ", str(node))
		return escape(text, quote=False)
	if not isinstance(node, Tag):
		return ""
	attributes = "".join(f' {name}="{escape(_attr(node, name))}"' for name in sorted(node.attrs))
	if node.name in _VOID_TAGS:
		return f"<{node.name}{attributes}>"
	return f"<{node.name}{attributes}>{_normal_children(node)}</{node.name}>"


# Shared helpers.


def _flag(dropped: list[LossCode], code: LossCode) -> None:
	if code not in dropped:
		dropped.append(code)


def _lossy(dropped: list[LossCode]) -> bool:
	return any(code not in HIDDEN_LOSSES for code in dropped)


def _attr(tag: Tag, name: str) -> str:
	value = tag.get(name)
	if value is None:
		return ""
	if isinstance(value, str):
		return value
	return " ".join(value)


def _classes(tag: Tag) -> list[str]:
	return _attr(tag, "class").split()


def _style(tag: Tag) -> dict[str, str]:
	styles: dict[str, str] = {}
	for declaration in _attr(tag, "style").split(";"):
		name, _, value = declaration.partition(":")
		if name.strip() and value.strip():
			styles[name.strip().lower()] = value.strip().lower()
	return styles


def _scheme(address: str) -> str:
	try:
		return urlsplit(address).scheme.lower()
	except ValueError:
		return ""


def _hostname(url: str) -> str | None:
	try:
		return urlsplit(url).hostname
	except ValueError:
		return None


def _blank(node: PageElement) -> bool:
	return (
		isinstance(node, NavigableString)
		and not isinstance(node, PreformattedString)
		and not str(node).strip()
	)


def _sole_child(parent: Tag, node: PageElement) -> bool:
	return all(child is node or _blank(child) for child in parent.children)


def _block_or_none(node: PageElement | None) -> bool:
	return node is None or (isinstance(node, Tag) and node.name in _BLOCK_TAGS)


def _unify_newlines(text: str) -> str:
	return text.replace("\r\n", "\n").replace("\r", "\n")
