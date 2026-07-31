# Figma → Code — design-system-first

Point it at a **Figma file** and get back a portable **[OpenDesign](../../skills/open-design/) design system** — `tokens.css`, derived caches, component fixture, prose, provenance — that passes OpenDesign's own guard checks.

This is the **Figma twin** of [`ai-website-cloner-template`](../ai-website-cloner-template/). Same spine, different source:

```
URL     ──▶ browser MCP extraction ──┐
                                     ├──▶ tokens.source.json ──▶ OpenDesign package ──▶ (later) Astro page
Figma   ──▶ Figma MCP extraction  ───┘        the shared contract
```

The cloner infers tokens from `getComputedStyle()` — lossy, requires clustering. Figma **declares** them as variables and styles. Same destination, better input, different extraction problem.

> **Status: R0 + R1.1 shipped 2026-07-31.** Emit/validate and the immutable
> capture-contract loader work from clean offline fixtures. No live Figma capture
> or extractor exists yet, so the Importer MVP is not shipped. Follow
> [`TASKS.md`](TASKS.md) for current work; use
> [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) for the original rationale.

## Scope (v1)

**In:** Figma file → `design-systems/<slug>/` (OpenDesign v1 rich package), guard-green.

**Out (deliberately):** building an Astro page from it. That is the cloner's Milestone D — a *page builder that reads the design system*, shared by both sources once it exists. Until then, `../../skills/figma-to-astro/` remains the hand-driven path from frame to `.astro`.

## Quick start

```bash
nvm use
npm ci
npm run check:r0
npm run check:r1:contract
```

`scripts/extract-figma-tokens.ts` still throws intentionally. Its capture contract
and implementation are tracked under R1 in [`TASKS.md`](TASKS.md).

## Prerequisites

- Node 24.18.0 (`.nvmrc`) and npm 11.16.0 (`packageManager`).
- For future R1 capture, the pinned local `talk-to-figma-fork` runtime and DEV
  plugin—not the published npm package. See [`TASKS.md`](TASKS.md).
- `knowledge/skills/open-design/` present — it supplies the 56-slot `TOKEN_SCHEMA` and the derived-file renderers, read at build time. **Never hardcode the slot list.**

## Project structure

```
docs/
  CAPTURE-CONTRACT.md   # immutable evidence, runtime pin, privacy, R1.2 handoff
  BUILD-PLAN.md        # milestones, locked decisions, risks  ← read first
  EXTRACTION-GUIDE.md  # what to capture from Figma + the slot mapping table
  research/            # extraction artifacts land here
scripts/
  extract-figma-tokens.ts    # Figma → tokens.source.json   (NEW — the real work)
  emit-design-system.ts      # tokens.source.json → package  (vendored from the cloner)
  validate-design-system.ts  # acceptance gate               (vendored from the cloner)
  lib/
    capture-contract.ts      # manifest + cross-file integrity loader
    fork-payload-contracts.ts # external reply-shape boundary
schemas/               # versioned manifest + override JSON Schemas
tests/fixtures/        # authorized sanitized offline fixtures only
design-systems/        # emitted OpenDesign packages
.claude/skills/figma-to-design-system/SKILL.md
```

## Not intended for

Same boundary the cloner draws: a design system extracted from someone else's Figma file is **aesthetic inspiration, not an official asset**. Fine for files you own, migrations, client work you're authorized on, and learning. Not for passing off a brand's identity as your own.

## Related

- [`../ai-website-cloner-template/`](../ai-website-cloner-template/) — the URL twin; source of the emitter and the `tokens.source.json` contract.
- [`../../skills/open-design/`](../../skills/open-design/) — the design-system contract this emits against.
- [`../../skills/CONTEXT.md`](../../skills/CONTEXT.md) — which Figma skill for which job.
- [`../../ideas/figma-to-code-local-generator.md`](../../ideas/figma-to-code-local-generator.md) — the origin idea.
