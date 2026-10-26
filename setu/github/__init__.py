"""Site-owned GitHub App connection and two-way Task ↔ Issue sync (docs/adr/0006-0008).

- client, issues: authenticated, rate-limit-aware GitHub requests
- connection, projects, activation: app, routing, explicit sync enablement
- store, links: durable links, the operation outbox, publishing hooks
- worker, outbound, inbound, reconcile: running operations both ways
- events, recovery: webhook receipts and scheduled recovery
- convert: Issue body Markdown ↔ description HTML
"""
