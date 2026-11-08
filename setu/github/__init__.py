"""Site-owned GitHub App connection and two-way Task ↔ Issue sync (docs/adr/0006-0008).

- client, issues: authenticated, rate-limit-aware GitHub requests
- connection, projects, activation: app, routing, explicit sync enablement
- store, links, delta, link_state: durable links, publishing hooks and their rules
- outbound, inbound: applying changes both ways
- retry, events, redelivery, recovery: Retry Job rows, webhooks and the scheduled crons
- convert: Issue body Markdown ↔ description HTML
"""
