"""The Link Types Envision ships with (docs/adr/0005).

Created on install and on every migrate when missing, so a deleted one comes
back. One that exists is left as it is, whatever its icon.
"""

import frappe

# (type name, icon), in the order the type picker lists them; people's own
# types follow, by name.
BUILT_IN_LINK_TYPES = [
	("Docs", "book-open"),
	("Video", "video"),
	("Observability", "activity"),
	("Chat", "message-square"),
	("Design", "pen-tool"),
	("Code", "code"),
	("Link", "link"),
]


def create_envision_link_types() -> None:
	# Whatever the case, as the DocType compares names: someone's own "docs"
	# stands in for the built-in Docs.
	existing = {name.casefold() for name in frappe.get_all("Envision Link Type", pluck="type_name")}
	for type_name, icon in BUILT_IN_LINK_TYPES:
		if type_name.casefold() in existing:
			continue
		frappe.get_doc(
			{
				"doctype": "Envision Link Type",
				"type_name": type_name,
				"icon": icon,
				"is_standard": 1,
			}
		).insert(ignore_permissions=True)
