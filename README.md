# Figma → Code — design-system-first

Point it at a **Figma file** and get back a portable **[OpenDesign](../../skills/open-design/) design system** — `tokens.css`, derived caches, component fixture, prose, provenance — that passes OpenDesign's own guard checks.

This is the **Figma twin** of [`ai-website-cloner-template`](../ai-website-cloner-template/). Same spine, different source:

```
URL     ──▶ browser MCP extraction ──┐
                                     ├──▶ tokens.source.json ──▶ OpenDesign package ──▶ (later) Astro page
Figma   ──▶ Figma MCP extraction  ───┘        the shared contract
```

The cloner infers tokens from `getComputedStyle()` — lossy, requires clustering. Figma **declares** them as variables and styles. Same destination, better input, different extraction problem.

> **Status: scaffolded 2026-07-24 — not yet built.** Directories, contracts, and stubs exist; no working code. The build plan is [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md); start at Milestone 1.

## Scope (v1)

**In:** Figma file → `design-systems/<slug>/` (OpenDesign v1 rich package), guard-green.

**Out (deliberately):** building an Astro page from it. That is the cloner's Milestone D — a *page builder that reads the design system*, shared by both sources once it exists. Until then, `../../skills/figma-to-astro/` remains the hand-driven path from frame to `.astro`.

## Quick start (once built)

```bash
npx tsx scripts/extract-figma-tokens.ts --file <figma-file-key> --brand <slug>   # → source/tokens.source.json
npx tsx scripts/emit-design-system.ts   --brand <slug> --name "<Name>"           # → design-systems/<slug>/
npx tsx scripts/validate-design-system.ts --brand <slug>                         # acceptance gate
```

Or drive the whole thing conversationally with the `/figma-to-design-system` skill in [`.claude/skills/`](.claude/skills/figma-to-design-system/SKILL.md).

## Prerequisites

- Node 22+ and `npx tsx` (no monorepo install needed — the validator imports OpenDesign's pure-TS contracts directly).
- A Figma MCP available. **Which one is a live design decision** — see [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) § Risk 1 (the official `figma-mcp` is rate-limited; the `talk-to-figma` fork is free but write-first).
- `knowledge/skills/open-design/` present — it supplies the 56-slot `TOKEN_SCHEMA` and the derived-file renderers, read at build time. **Never hardcode the slot list.**

## Project structure

```
docs/
  BUILD-PLAN.md        # milestones, locked decisions, risks  ← read first
  EXTRACTION-GUIDE.md  # what to capture from Figma + the slot mapping table
  research/            # extraction artifacts land here
scripts/
  extract-figma-tokens.ts    # Figma → tokens.source.json   (NEW — the real work)
  emit-design-system.ts      # tokens.source.json → package  (vendored from the cloner)
  validate-design-system.ts  # acceptance gate               (vendored from the cloner)
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
