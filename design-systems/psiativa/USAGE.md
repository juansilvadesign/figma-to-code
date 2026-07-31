# PsiAtiva — Usage

How an agent should consume this design system when generating an artifact.

## Read Order

1. [`DESIGN.md`](DESIGN.md) — the brand's personality, color roles, type, and
   anti-patterns. Read this first; it governs every decision below.
2. [`tokens.css`](tokens.css) — the token contract. Paste the `:root` block into your
   artifact's `<style>` and reference tokens with `var(--…)`. Never hardcode a value
   that a token already names.
3. [`components.html`](components.html) — worked fixtures (buttons, cards, badges,
   inputs, links, typography, layout) wired entirely to tokens. Copy these patterns
   rather than inventing new component styling.
4. [`preview/`](preview/) — the colors, typography, and spacing reference pages for
   human review.
5. Derived caches — [`design-tokens.json`](design-tokens.json) and
   [`tailwind-v4.css`](tailwind-v4.css) are generated from `tokens.css`; consume them,
   do not hand-edit them.

## Design Highlights

- **All-serif identity.** New York for every heading, Lora for body. This is the
  single most recognisable trait — keep it.
- **One rare accent.** Deep teal `--accent` for primary actions only, roughly twice
  per screen. Sage green is a secondary flourish, not a co-equal accent.
- **Warm near-white canvas.** `--bg` (`#FAFFFF`), never pure white; sage-tinted
  surfaces lift cards.
- **Amber, never red.** `--warn` (`#F7C800`) is the emphasis color; red is error-only.
- **Editorial rhythm.** Generous `--section-y-*` spacing and 1.6 body leading; hairline
  borders and one whisper shadow instead of heavy elevation.

## Do

- Reference every color, size, radius, and duration through its token.
- Set primary buttons with `--accent` + `--accent-on`; give focusable controls
  `--focus-ring`.
- Use `--radius-pill` for buttons and `--radius-lg` for cards.
- Keep headings in `--font-display` and reading copy in `--font-body` at
  `--leading-body`.
- Honor the `[data-theme="dark"]` overrides if you build a dark surface.

## Avoid

- Pure white backgrounds, red accents, or a sans-serif heading — all break the identity.
- More than ~two saturated accent uses on one screen.
- Hand-editing `design-tokens.json`, `tailwind-v4.css`, or `components.manifest.json`;
  they are regenerated from `tokens.css` + `components.html`.
- Tightening the section rhythm or body leading into a dense dashboard layout.
