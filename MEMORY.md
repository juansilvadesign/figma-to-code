---
name: figma-to-code — project memory
description: Live state for the Figma → code extraction pipeline — the frozen R2.4 topology, what may not be recaptured, and the pinned toolchain
type: project
---
# figma-to-code — Project Memory

> **Migrated out of the global memory router 2026-08-16.** The router keeps a one-line stub pointing here; ⛔ new detail lands in this file, not in the router.
>
> ⚠️ **This repository is PUBLIC.** No credentials, host names, API tokens, or commercial terms in this file.

## ▶ Live resume state

### ✅ R2.4 — the SYD topology is FROZEN (2026-08-10)

Captured and locked:

| | count |
|---|---|
| desktop/mobile pairs | 12 |
| text nodes | **275/275** |
| image fills | 61 |
| reactions | 13 |
| source conflicts | 4 |

- **No `.astro` sections exist yet** — the topology is data, not components. Don't go looking for generated sections.
- ⛔ **Do NOT recapture the topology.** It is frozen deliberately. A recapture re-rolls node IDs and invalidates every mapping built on top of it, including the 4 recorded source conflicts.
- ⛔ **The committed seam stays `psiativa`.** Don't re-point it while working on another surface.

### Next

**R2.5 — targeted, read-only child exports. Start with the CTA background.** "Targeted" and "read-only" are both load-bearing: this phase reads specific children, it does not mutate and it does not re-walk the tree.

## ⛔ Pinned toolchain

- **Node 24.18.0.** Pinned, not incidental.

## 📚 Detailed history

⚠️ **This repository is PUBLIC, so the full internal history is deliberately NOT kept here.** This file carries the sanitized technical state only.

The complete record lives in the private `ai-synthesizer` workspace at `knowledge/projects/_memory/figma-to-code-session-state.md` — session-by-session, including the parts that must not be published (hosting account details, client agreements, internal IDs). Folded there 2026-08-17.
