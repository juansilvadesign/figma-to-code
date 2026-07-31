# PsiAtiva — Extraction Evidence

## Source

- **Target:** the PsiAtiva landing page (owned by the operator — no third-party ToS
  concern; this is a self-extraction, not a clone of someone else's brand).
- **Local source:** `workspace/psiativa/projects/landing-page-v2` (Astro 5 + Tailwind 4).
- **Primary evidence:** the authored design tokens in `src/styles/global.css` (`:root`
  and `[data-theme="dark"]`), plus the base type scale from the `h1`–`h4` / `p` /
  `.section-label` rules.

## Method

This package was emitted by the clone-website design-system emitter
(`scripts/emit-design-system.ts`) from [`tokens.source.json`](tokens.source.json), which
maps the landing page's authored CSS variables onto OpenDesign's `TOKEN_SCHEMA` slots.

Because the target is an owned, static-first site with a first-class token system, the
values were read from the authored `:root` (high fidelity) rather than reconstructed
from `getComputedStyle()` sweeps. The emitter is extraction-mechanism-agnostic: the same
`tokens.source.json` shape is what a browser-driven extraction pass would produce, so a
computed-style run would flow through the identical mapping.

## Confidence

Per-token confidence is recorded in [`tokens.source.json`](tokens.source.json) and carried
into [`../design-tokens.json`](../design-tokens.json):

- **high (33)** — read directly from an authored token (e.g. `--bg` ← `--background`,
  `--accent` ← `--primary`, the type scale ← `h1`–`h4`).
- **derived (8)** — mapped or interpolated from adjacent authored values (e.g.
  `--border-soft` as a half-strength `--color-border`; `--section-y-phone` below the
  100px tablet tier; `--focus-ring` as a teal halo at the standard focus proportion).
- **fallback (15)** — no brand value existed, so OpenDesign's A2 schema default was used
  (e.g. `--font-mono`, the base spacing scale, `--radius-sm/md`, `--motion-fast`).

## Notable mapping decisions

- **Accent = deep teal, not sage.** The landing page names its palette "Teal + Sage",
  but the primary *action* color (buttons, `--gradient-brand` origin, heading ink) is the
  deep teal `#1A4B51`. OpenDesign has a single `--accent` slot, so teal takes it; sage
  (`#7EAE89`) is documented in `DESIGN.md` as the secondary flourish.
- **Amber warn, restrained danger.** The brand rule is "amber, never red", so `--warn`
  is the brand amber `#F7C800` and `--danger` is a muted warm red reserved for real errors.
- **All-serif fonts.** `--font-display` = New York, `--font-body` = Lora. The page's
  third face (Source Serif 4, used for uppercase UI labels) has no OpenDesign slot; it is
  noted in `DESIGN.md` rather than forced into `--font-mono`.
- **Dark theme.** The landing page ships a preserved `[data-theme="dark"]` ramp; those
  overrides are carried into `tokens.css` verbatim, including the accent flip to light-blue.

## Regeneration

```
npx tsx scripts/emit-design-system.ts --brand psiativa \
  --name "PsiAtiva" --category "Health & Wellness"
```

The emitter rewrites `tokens.css`, `design-tokens.json`, `tailwind-v4.css`,
`manifest.json`, `components.manifest.json`, and `source/token-contract.report.json` from
`tokens.source.json` + the authored `components.html`. Do not hand-edit the derived files.
