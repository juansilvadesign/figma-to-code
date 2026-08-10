# R2.1 decision note — the Astro reuse seam

**Date:** 2026-08-10
**Release:** R2 — Astro page MVP
**Verdict:** decided. No Astro code is vendored yet; this note freezes what R2.2 executes.

Answers the open question *"Astro reuse shape: vendor a minimal template into this
repo, or add a reproducible scaffold script sourced from the cloner baseline?"*

## Baseline inventory

Everything the pinned baseline
`juansilvadesign/ai-website-cloner-template@b7b4dda5ffc9cfa279f9269b567c073f22a25860`
carries as its generic Astro foundation. Read in full before deciding; nothing else
in that tree is Astro foundation (`templates/nextjs/**` is the retained Next.js
target, `scripts/emit-design-system.ts` and `scripts/validate-design-system.ts` were
already vendored in R0).

| Baseline file | Bytes | Lines | Baseline SHA-256 | Disposition |
| --- | ---: | ---: | --- | --- |
| `astro.config.mjs` | 149 | 9 | `cb8fedf6a634e0ab6a25d7ad6ed20297934c6d6bae5a0a198f74f85c0931248c` | vendor verbatim |
| `src/env.d.ts` | 39 | 1 | `9c9283a414423d9223e5ea86941b142443b8af7a007f77612dc2c098de2d2500` | vendor verbatim |
| `tsconfig.json` | 215 | 11 | `0a43a7a6bc5f7e56e61c1126ae96db5d65b9f6bd34b90f0a0917cf030ef9dfc3` | vendor, recorded delta |
| `eslint.config.mjs` | 296 | 15 | `6915721be1d55e7d00af58b40649170c705b234452c3d3ea738d62ae4316c2b1` | vendor, recorded delta |
| `src/styles/global.css` | 603 | 44 | `7f1f803d10dfa359f873612da433f81af8355d3dceb42df46ce0532efac17362` | vendor, recorded delta |
| `src/pages/index.astro` | 512 | 21 | `f327f96da466c481bd3cdd41f0c3fe6506e6bab574f524cc5c0f5304efd4045b` | **not vendored** — author fresh |
| `src/components/ClonePlaceholder.astro` | 2016 | 78 | `4fd5ba2116e77915321704b34a9762da8ce0c1b46c516a9eb65ab26113f903dd` | **not vendored** — brand-specific |

The whole generic foundation is **1302 bytes across five reusable files**. The two
excluded files are 2528 bytes of cloner-branded page code, which R2's checklist
already bars.

## Decision

**Vendor the minimal foundation at the repository root, pinned to `b7b4dda`, with a
machine-checkable provenance manifest.** Four parts:

1. **Shape — minimal vendor at root.** Mirror the baseline's layout exactly rather
   than generating it. Five files land under version control; `src/pages/index.astro`
   is authored here and cites the baseline as a model, not a source.
2. **Brand seam — the committed `psiativa` fixture.** `src/styles/global.css` ships
   importing `../../design-systems/psiativa/tokens.css`, byte-identical to the
   baseline's own first line.
3. **Parity — executable, offline.** `vendor.manifest.json` plus
   `scripts/check-vendor-parity.ts`, exposed as `npm run check:vendor`.
4. **Pin — stays at `b7b4dda`.** The cloner's later multi-clone architecture is
   deliberately deferred; see *Deferred: the moved baseline* below.

## Why vendoring beats a scaffold script

1. **The script would exceed what it produces.** A reproducible scaffold must locate
   a sibling checkout of a *separate* repository, run `git show b7b4dda:<path>` seven
   times, retarget the brand `@import`, strip the `templates` entries, and then still
   be typechecked, tested, and documented — to emit 1302 bytes it could have
   committed. It also introduces a second sibling-path runtime dependency; today only
   `open-design` has one, and `AGENTS.md` already records that relative-sibling paths
   bite when this project moves.
2. **A pinned baseline cannot drift.** Drift-proofing is a scaffold script's only
   structural advantage, and `b7b4dda` is immutable. The drift that can actually
   happen is a local hand-edit to a vendored file — which the parity check catches
   for a fraction of the cost.
3. **The provenance convention already exists and already shipped.** R0 vendored the
   emitter and validator behind a four-line block at lines 3–6 and proved
   byte-identity after stripping it. Every file above accepts that same block —
   `tsconfig.json` included, since TypeScript reads JSONC.

## Vendor manifest

Each vendored file carries the R0 provenance block. `package.json` cannot hold
comments, so its added rows are covered by the manifest alone — that gap is the
reason the manifest exists rather than another prose table.

| Local path | Delta from baseline |
| --- | --- |
| `astro.config.mjs` | none (provenance comment only) |
| `src/env.d.ts` | none (provenance comment only) |
| `tsconfig.json` | drop the `"templates"` exclude — no such directory here |
| `eslint.config.mjs` | drop the `"templates/**"` ignore — same reason |
| `src/styles/global.css` | none at `b7b4dda`'s default brand; line 1 is the brand seam |
| `package.json` scripts | add `dev`, `build`, `preview`, `lint`, `typecheck`, `check:astro` |
| `package.json` deps | add `astro@^7.1.3`; dev-add `@astrojs/check`, `eslint`, `eslint-plugin-astro`, `@typescript-eslint/parser` |

Both dropped entries are dead paths, not behavior: this repository has no
`templates/`. The `scripts` and `design-systems` exclusions are kept verbatim and
are load-bearing — `AGENTS.md` records that the cloner had to add exactly those to
keep CI green once an app-level TypeScript/ESLint program existed.

Dependency versions are taken at the baseline's own ranges so the vendored configs
run against the versions they were written for. `check:r0`, `check:r1:contract`, and
`check:r1:extract` are unaffected: they run `tsc --ignoreConfig`, so a root
`tsconfig.json` cannot reach them, and no `scripts/**` module imports Astro.

## The brand seam and the privacy constraint

This is the one constraint the cloner never faced. In this repository
`design-systems/psiativa/` is committed (the R0 fixture, 14 tracked files) while
`design-systems/syd/` is gitignored as private-local (0 tracked files). A committed
`global.css` importing `syd` would make `npm run build` fail on every clean clone of
this public repository, and could never become a CI gate.

So the committed default imports `psiativa`, which:

- keeps line 1 byte-identical to the baseline,
- lets step 4 of the R2.1 plan — *prove the foundation first* — run on a public,
  already-validated package before any SYD page work exists,
- and keeps the private capture private.

Retargeting that line to `syd` belongs to `--build astro --brand <slug>`, which R2
already specifies must fail closed unless `design-systems/<slug>/` has just passed
validation. The brand seam is therefore one generated line with an existing owner,
not new machinery.

## Parity enforcement

`vendor.manifest.json` records per file: baseline path, baseline commit, baseline
SHA-256, local SHA-256 with the provenance block stripped, and the delta note.
`scripts/check-vendor-parity.ts` recomputes the local side and compares — fully
offline, no sibling checkout required, consistent with how the capture contract and
extractor tests already run.

This closes a real gap rather than adding ceremony: the cross-cutting checklist
already claims *"every vendored file or workflow cites the source commit and has a
parity check,"* but R0's parity check was a SHA-256 table typed into a note. Nothing
currently detects a hand-edit to `scripts/emit-design-system.ts`. The manifest should
therefore cover the two R0-vendored scripts as well as the new Astro files.

## Deferred: the moved baseline

The cloner's `HEAD` is far past `b7b4dda`: `src/` has grown from 4 files to 50, with
a `src/clones/<slug>/` architecture carrying per-clone `clone.config.ts`,
`layouts/BaseLayout.astro`, and `styles/clone.css`.

Not adopted, deliberately. It solves multi-clone routing, which this project does not
have — R2 builds one page from one file. Adopting it would mean a fresh
pin-compatibility pass and a larger surface before R2 has proven anything, and the
project's own scheduling rule moves a pin only for a required read fix or a
deliberately accepted compatible release. Revisit at R3, when a second unrelated
file makes multi-package routing real; the migration is then a move, not a rewrite.

## What this note does not decide

- SYD page topology, section specs, and the desktop/mobile frame family (R2.3).
- The `--build none|astro` flag's implementation (R2.2), beyond assigning it
  ownership of the brand `@import` line.
- Whether Astro 7.1.3 installs and builds clean on Node 24.18.0 — untested here. It
  is the first empirical gate of R2.2, and `npm run check:astro` against the
  committed `psiativa` package is the whole test.
