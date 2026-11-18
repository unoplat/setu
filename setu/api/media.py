import base64
import binascii
import re
from html import unescape
from urllib.parse import unquote, urlencode, urlsplit

import frappe
from frappe import _
from frappe.core.doctype.file.utils import get_content_hash
from frappe.utils import get_url

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

_DATA_IMAGE = re.compile(r"""(<img\b[^>]*?\bsrc\s*=\s*)(["'])(data:[^"']*)\2""", re.IGNORECASE)
_IMAGE_SRC = re.compile(r"""<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
# Base64 is a third larger than the bytes it holds.
_MAX_PAYLOAD = (MAX_IMAGE_BYTES + 2) // 3 * 4


# Save: data: images become Files ---------------------------------------------


def store_record_images(doc, method=None) -> None:
	"""before_validate: store the new images in a record's text.

	Runs before Frappe's own Text Editor extraction, which would make every
	image private, and before the HTML is sanitised, which drops data: images.
	"""
	for fieldname in INLINE_IMAGE_FIELDS.get(doc.doctype, ()):
		html = doc.get(fieldname)
		if html and "data:" in html:
			doc.set(fieldname, store_images(html, doc.doctype, doc.name))


def store_comment_images(doc, method=None) -> None:
	"""before_validate of a Comment: its images belong to the record it is on,
	where Desk lists attachments and permissions are checked."""
	if (
		doc.comment_type == "Comment"
		and doc.reference_doctype
		and doc.reference_name
		and doc.content
		and "data:" in doc.content
	):
		doc.content = store_images(doc.content, doc.reference_doctype, doc.reference_name)


def store_images(html: str, doctype: str, name: str) -> str:
	"""Replace each data: image in ``html`` with the address of a File attached
	to ``doctype`` ``name``. A bad image fails the save with a message."""

	def replace(match: re.Match) -> str:
		prefix, quote, uri = match.groups()
		return f"{prefix}{quote}{store_image(unescape(uri), doctype, name)}{quote}"

	return _DATA_IMAGE.sub(replace, html)


def store_image(uri: str, doctype: str, name: str) -> str:
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
		["name", "file_url", "is_private"],
		as_dict=True,
	)
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


# Later edits and deletes: images no text uses are deleted ---------------------


def prune_record_images(doc, method=None) -> None:
	"""on_update: delete the editor images the record's text no longer uses."""
	fields = INLINE_IMAGE_FIELDS.get(doc.doctype, ())
	if any(doc.has_value_changed(fieldname) for fieldname in fields):
		prune_images(doc.doctype, doc.name)


def prune_comment_images_on_update(doc, method=None) -> None:
	"""on_update of a Comment (which runs on insert too): an edited comment
	may have dropped an image."""
	if doc.flags.in_insert or not doc.has_value_changed("content"):
		return
	_prune_comment(doc)


def prune_comment_images_on_delete(doc, method=None) -> None:
	"""after_delete of a Comment: its images may now be unused."""
	_prune_comment(doc)


def _prune_comment(doc) -> None:
	if doc.comment_type == "Comment" and doc.reference_doctype and doc.reference_name:
		prune_images(doc.reference_doctype, doc.reference_name)


def prune_images(doctype: str, name: str) -> None:
	"""Delete the editor images attached to a record that neither its text nor
	any comment on it uses. Frappe keeps the image on disk while another File
	shares its content."""
	files = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"attached_to_field": INLINE_IMAGE_MARK,
		},
		fields=["name", "file_url"],
	)
	# A record being deleted takes its Files with it (frappe.model.delete_doc).
	if not files or not frappe.db.exists(doctype, name):
		return
	used = _used_paths(doctype, name)
	for file in files:
		if file.file_url not in used:
			frappe.delete_doc("File", file.name, ignore_permissions=True)


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
