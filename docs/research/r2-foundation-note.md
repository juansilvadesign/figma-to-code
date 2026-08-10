# R2.2 build note — the vendored Astro foundation

**Date:** 2026-08-10
**Release:** R2 — Astro page MVP
**Verdict:** passed

Executes the seam frozen in
[`r2-astro-seam-note.md`](r2-astro-seam-note.md) without deviation: minimal vendor at
repository root pinned to `b7b4dda`, committed brand default `psiativa`, executable
parity manifest, cloner pin not advanced.

No Figma page work is included. This note proves only that the foundation compiles
and consumes a validated OpenDesign package, which is the precondition R2 set before
any section may be written.

## Runtime

Node `v24.18.0` from `.nvmrc`, npm `11.16.0` from `packageManager` — the same
runtime R0 and R1 were accepted on.

The first `npm install` was run on the shell's default Node `v22.22.3` and warned
`EBADENGINE`. Everything reported below was re-run after `nvm use`, from a clean
`npm ci`, so no result here depends on the off-pin install.

Installed: 274 top-level entries in `node_modules`, 451 resolved packages in the
lockfile, 0 vulnerabilities. `esbuild@0.28.1` reports an unapproved postinstall
script under npm's allow-scripts policy; it is a pre-existing `tsx` transitive, not
new to this change, and every check below passes without approving it.

## What was vendored

Five files from the baseline, each carrying the R0 provenance block:

| Local path | Provenance lines | Delta |
| --- | --- | --- |
| `astro.config.mjs` | 1–6 | none |
| `src/env.d.ts` | 1–6 | none |
| `src/styles/global.css` | 1–7 | none at the default brand |
| `tsconfig.json` | 1–6 | dropped the `templates` exclude |
| `eslint.config.mjs` | 1–7 | dropped the `templates/**` ignore |

`src/pages/index.astro` was authored here and cites the baseline as a model, not a
source. `ClonePlaceholder.astro` was not copied. `package.json` gained six baseline
script rows and the five-package Astro dependency set at the baseline's own version
ranges; `.gitignore` gained `.astro/` and `dist/`.

The baseline's `check` is named `check:astro` here, to fit this repository's existing
`check:<release>` convention. Its body is unchanged.

## Parity is now executable

`vendor.manifest.json` + `scripts/check-vendor-parity.ts` + `npm run check:vendor`.
The manifest records, per file, the provenance line range, the local SHA-256, the
SHA-256 after removing exactly those lines, and whether the result should equal the
baseline. **26 checks pass.**

The same mechanical rule was applied retroactively to the two scripts R0 vendored,
and it reproduces the hashes R0 recorded by hand:

| File | Stripped SHA-256 | R0 note |
| --- | --- | --- |
| `scripts/emit-design-system.ts` | `9c41f08a52245246ca884b32470e62bc694ab01d449fb86e9305c3d71eb1bd6d` | identical |
| `scripts/validate-design-system.ts` | `8397bf3cf238f9bf7f3fcb1e91acbc19a8b1c0ed13ca58719808e9380494d36f` | identical |

**Five of the seven vendored files are byte-identical to the baseline** once the
provenance block is removed — including `src/styles/global.css`, which is identical
only because this repository and the cloner both default to the committed `psiativa`
package. That makes the seam note's "delta: none at the default brand" a measured
result rather than a claim.

### The gate was proven to fail

A check that has never failed is not evidence. Both negative cases were run against
`astro.config.mjs` and the file was restored byte-identically afterwards
(`b8d37a1f0b4f5edb…`):

| Injected drift | Result |
| --- | --- |
| Silent body edit (`port: 4321` → `4322`), provenance block untouched | 3 checks fail: local hash, stripped hash, baseline parity |
| Provenance block deleted | 5 checks fail, including the marker and cited-commit checks |

The first case is the one that matters: a one-character edit that leaves every
human-readable provenance signal intact is still caught.

## Acceptance

From a clean `npm ci` on the pinned runtime:

```bash
nvm use
npm ci
npm run check:vendor
npm run check:astro
npm run check:r0
npm run check:r1:contract
npm run check:r1:extract
```

| Gate | Result |
| --- | --- |
| `check:vendor` | 26 checks passed |
| `lint` | clean |
| `typecheck` (`astro check`) | 4 files — 0 errors, 0 warnings, 0 hints |
| `typecheck:scripts` | passed |
| `build` | 1 page in 826 ms, `output: "static"` |
| `check:r0` | package quality 100 (15 checks, 0 failing); both negative checks still reject |
| `check:r1:contract` | 31 checks passed |
| `check:r1:extract` | 17 checks passed |

The importer loop is unaffected by adding an app-level TypeScript and ESLint program
at the root — the risk `AGENTS.md` flagged in advance. `check:r0` and both R1 suites
run `tsc --ignoreConfig`, so the new `tsconfig.json` cannot reach them, and no
`scripts/**` module imports Astro.

## The built artifact, not just the exit code

`npm run build` exiting 0 proves the pipeline ran, not that tokens reached the page.
`dist/index.html` is 4513 bytes with the stylesheet inlined, and contains:

- **56 token declarations** — the full slot count the pinned OpenDesign schema
  currently resolves, e.g. `--accent:#1a4b51`.
- **both scopes** — `:root` and `[data-theme=dark]`, the latter carrying its own
  `--accent:#cdeaed`.
- **35 distinct `var(--…)` references** from the vendored reset and the authored
  shell.
- **0 undeclared references** — every token the page uses is declared by the
  imported package. This is the same invariant OpenDesign's guard enforces for
  `components.html`, now holding for the Astro output.

No brand value is written anywhere in `src/`. Removing the package's import is
therefore the only way to change the page's appearance, which is what the
"one token source in code" cross-cutting item asks for.

## Not proven here

- Nothing about Figma. `design-systems/syd/` was not read, built, or imported; the
  private capture was not touched.
- `--build none|astro` does not exist yet, so the brand seam still has no programmatic
  owner — `src/styles/global.css` line 7 is currently edited by hand.
- No visual evidence. The 1440px/390px comparison contract belongs to page assembly,
  and there is no page yet.
