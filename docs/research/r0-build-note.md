# R0 build note — proven local emission loop

Date: 2026-07-31

## Pinned inputs

- Emitter and validator source:
  `juansilvadesign/ai-website-cloner-template@b7b4dda5ffc9cfa279f9269b567c073f22a25860`.
- Vendored copy date: 2026-07-31.
- Offline compatibility fixture:
  `design-systems/psiativa/` from the same cloner commit. This is an R0 fixture,
  not Figma evidence and not the future SYD R1 fixture.
- OpenDesign contract:
  `knowledge/skills/open-design@3447f60a3484c59c3bece4a437f53dd6e8df08a8`.
- Runtime: Node `24.18.0` from `.nvmrc`; npm `11.16.0` from `packageManager`.
- Installed from `package-lock.json`:
  `@types/node@24.13.3`, `tsx@4.23.1`, and `typescript@6.0.3`.

## Vendored-script parity

The only delta in each vendored script is the four-line provenance block at
lines 3–6. Removing that block produces byte-identical content:

| Script | Baseline SHA-256 | Local SHA-256 without provenance |
| --- | --- | --- |
| `emit-design-system.ts` | `9c41f08a52245246ca884b32470e62bc694ab01d449fb86e9305c3d71eb1bd6d` | `9c41f08a52245246ca884b32470e62bc694ab01d449fb86e9305c3d71eb1bd6d` |
| `validate-design-system.ts` | `8397bf3cf238f9bf7f3fcb1e91acbc19a8b1c0ed13ca58719808e9380494d36f` | `8397bf3cf238f9bf7f3fcb1e91acbc19a8b1c0ed13ca58719808e9380494d36f` |

The fixture's authored inputs (`DESIGN.md`, `USAGE.md`, `components.html`,
`source/evidence.md`, and `source/tokens.source.json`) also remain byte-identical
to `b7b4dda`. Derived files were deliberately re-emitted in this repository.

## Clean-install acceptance

Exact commands:

```bash
nvm use
npm ci
npm run check:r0
```

Observed results:

- `npm ci`: 6 packages added, 7 audited, 0 vulnerabilities.
- Strict script typecheck: passed.
- Emitter: wrote all 56 current schema slots with
  `high=33`, `derived=8`, and `fallback=15`.
- Re-emitted `tokens.css`, `design-tokens.json`, `tailwind-v4.css`,
  `components.manifest.json`, `manifest.json`, and
  `source/token-contract.report.json`.
- Default OpenDesign lookup: validation passed with package quality
  `100` (`15` checks, `0` failing).
- Explicit `--od-root ../../../skills/open-design`: validation passed with the
  same package-quality result.
- Missing-A1 negative check: removing the first authored A1 token failed and
  named `--bg`.
- Component-token negative check: adding
  `var(--r0-undeclared-token)` to a temporary `components.html` copy failed
  validation and named the undeclared token.

`npm run check:r0` owns the positive and negative R0 checks. The negative cases
run only in a `mkdtemp` directory and remove that directory before exit, so they
do not mutate the tracked fixture.
