# R2.3 — validated Astro brand seam

**Date:** 2026-08-10  
**Outcome:** `--build none|astro` now has an executable owner on the emitter. The
Astro path emits the selected package, validates that exact output in-process,
retargets the root stylesheet's brand import only after validation passes, and then
runs Astro's programmatic build API.

## Decision: re-run validation, do not read a receipt

R2.3 calls the existing OpenDesign-backed validator in the same process. A receipt
was rejected because it would need to prove freshness across `manifest.json`, every
declared authored file, every derived cache, the validator implementation, and the
OpenDesign checkout. A timestamp alone would be false confidence; a complete digest
protocol would add more machinery than the validation it avoids.

The validator now exposes `validateDesignSystem()` and returns a structured result.
Its standalone CLI uses the same function and preserves its pass/fail exit behavior.
There is one validation implementation and no persisted state to become stale.

## Why the flag belongs to the emitter

The offline extractor only owns capture evidence → `tokens.source.json`. Attaching
Astro there would validate stale derived files, because emission happens later. The
emitter is the first point that can enforce the whole order against one coherent
package:

```text
emit current package
  → validate exact design-systems/<slug>/ in-process
    → retarget src/styles/global.css
      → Astro build
```

`--build` therefore extends `scripts/emit-design-system.ts`:

```bash
# Existing importer-only behavior; `none` is the default.
npm run emit -- --brand <slug> --build none

# Validated package → selected brand seam → static Astro build.
npm run emit -- --brand <slug> --build astro
```

The Astro path requires the canonical output directory
`design-systems/<slug>/`. A custom `--out` cannot be selected by the fixed root
stylesheet and is rejected rather than producing a misleading build.

## Fail-closed invariants

- Only `none` and `astro` are accepted; an explicit flag without a value fails.
- `none`, including the default, does not validate, mutate the stylesheet, or run
  Astro.
- The selected slug must be lowercase kebab case.
- The first CSS `@import` must match the declared
  `../../design-systems/<slug>/tokens.css` seam exactly.
- A missing or invalid package returns before the stylesheet is read or written.
- Astro starts only after the validator returns `ok: true` and the seam points at
  the validated slug.
- A local private brand may change the tracked seam during page work, but the
  committed default remains `psiativa` so clean clones stay buildable.

## Acceptance evidence

Run under the pinned Node 24.18.0 toolchain:

| Check | Result |
| --- | --- |
| `npm run typecheck:scripts` | pass |
| `npm run test:r2:build` | 7/7 checks; includes a fully isolated emitter CLI → real Astro build |
| `npm run validate -- --brand psiativa` | OpenDesign package quality 100; pass |
| `npm run test:r0:failures` | both historical failure contracts still reject |
| `npm run check:vendor` | 24/24 parity/provenance checks after recording the two intentional R2.3 deltas |
| Programmatic Astro build against `psiativa` | one static page built; selected seam unchanged |

The negative coverage is load-bearing: a synthetic validation failure leaves the
original CSS byte-for-byte unchanged and never calls the Astro builder. The
isolated CLI check copies the committed fixture to a temporary project, runs
`emit --build astro`, and asserts that the built HTML contains the selected token
contract; repository-derived timestamps are never touched.

## What remains

The mechanism selects and proves a package; it does not invent page structure. The
next R2 slice freezes SYD's desktop/mobile topology, copy, assets, responsive
relationships, and known behavior gaps from the cached capture before any section
components are authored.
