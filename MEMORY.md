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

### ✅ R2 accepted on Banco Lucrativo (2026-09-26)

- **Result:** the Banco Lucrativo landing page is a static-first Astro page on a private-local
  route. It has 14 sections, zero client JS, and zero hard-coded colours. It renders at the Figma
  frame heights at 1280 and 375, builds green, and consumes the validated package through the
  token seam. The record is `docs/research/r2-banco-lucrativo-page-note.md`.
- **Runtime:** fork R3.3.1 (`01ab491`), which fixed the remote-TEXT-style Symbol crash. It always
  runs from its own worktree and must pass the `get_runtime_info` handshake.
- ⛔ **Never call the fork's `export_image_fill` for page assets.** Large originals exceed the
  relay's 16 MiB message cap and drop the plugin's channel. Use `npm run export:nodes` (PNG
  renders under a ~3 MP budget), run in small batches with a fresh `--out` each.
- ⛔ **The page-copy guard skips nodes whose descendants include page copy.** Check the text
  ledger's `rendered` flag: text that is hidden in the captured state is safe to render.
- ⛔ **The QA instrument lies unless every image is decoded.** Force eager loading, call
  `decode()`, and capture with a viewport as tall as the page.
- **Open:**
  - a live video URL (the design's link is dead);
  - the motion follow-up;
  - the `join_channel` start-up race;
  - the fork's image-fill payload cap.
- All client content stays private-local, and the committed seam stays `psiativa`.

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

The video URL swap once the owner supplies it, then the motion follow-up (see `TASKS.md` § Next session). SYD's parked R2.5 resumes only when SYD's page is built.

## ⛔ Pinned toolchain

- **Node 24.18.0.** Pinned, not incidental.

## 📚 Detailed history

⚠️ **This repository is PUBLIC, so the full internal history is deliberately NOT kept here.** This file carries the sanitized technical state only.

The complete record lives in the private `ai-synthesizer` workspace at `knowledge/projects/_memory/figma-to-code-session-state.md` — session-by-session, including the parts that must not be published (hosting account details, client agreements, internal IDs). Folded there 2026-08-17.
