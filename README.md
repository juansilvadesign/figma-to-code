# Figma → Code — design-system-first

Point it at a **Figma file** and get back a portable **[OpenDesign](../../skills/open-design/) design system** — `tokens.css`, derived caches, component fixture, prose, provenance — that passes OpenDesign's own guard checks.

This is the **Figma twin** of [`ai-website-cloner-template`](../ai-website-cloner-template/). Same spine, different source:

```
URL     ──▶ browser MCP extraction ──┐
                                     ├──▶ tokens.source.json ──▶ OpenDesign package ──▶ optional Astro page
Figma   ──▶ Figma MCP extraction  ───┘        the shared contract
```

The cloner infers tokens from `getComputedStyle()` — lossy, requires clustering. Figma **declares** them as variables and styles. Same destination, better input, different extraction problem.

> **Status: Importer MVP shipped; Astro foundation + validated brand seam shipped
> 2026-08-10; cached SYD topology frozen in R2.4.** A real Figma capture replays
> offline into a quality-100 OpenDesign package. `--build astro` revalidates that
> package in-process, selects its token import, and runs the static Astro build. The
> 12 desktop/mobile section contracts now exist; targeted asset readiness, section
> implementation, and visual fidelity remain R2 work. Follow [`TASKS.md`](TASKS.md) for current work; use
> [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) for the original rationale.

## Scope (v1)

**In:** Figma file → `design-systems/<slug>/` (OpenDesign v1 rich package),
guard-green, with an optional validated Astro target.

**Still manual in R2:** translating selected desktop/mobile frames into semantic
Astro sections. The project owns the target and guard; it does not yet claim generic
one-command frame codegen.

## Quick start

```bash
nvm use
npm ci
npm run check:r0
npm run check:r1:contract
npm run check:r1:extract
npm run check:r2:build
```

Emit a package only (the default), or validate and build Astro:

```bash
npm run emit -- --brand <slug> --build none
npm run emit -- --brand <slug> --build astro
```

The Astro path fails before touching `src/styles/global.css` unless the just-emitted
`design-systems/<slug>/` passes OpenDesign validation.

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
  validate-design-system.ts  # standalone + in-process acceptance gate
  lib/
    build-target.ts          # validated package → brand seam → Astro build
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
