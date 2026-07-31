# PsiAtiva — Design System

A warm, serif-forward identity for a psychology-practice consultancy. The system
reads like an editorial page, not a SaaS dashboard: deep teal and sage green on a
near-white canvas, every headline set in a serif, generous section rhythm, and
restrained motion. Extracted from the PsiAtiva landing page; see
[`source/evidence.md`](source/evidence.md) for provenance and confidence per token.

## Personality

Calm clinical authority. The brand sells trust and predictability to healthcare
professionals, so the surface is quiet and unhurried — no neon, no hype, at most
one exclamation per screen. The serif type does the emotional work; color is used
sparingly so the single teal accent always reads as intentional. Think "a letter
from a trusted colleague," not "a growth product landing page."

## Color roles

- **Canvas.** `--bg` is a near-white with a faint cyan cast (`#FAFFFF`), never pure
  white. `--surface` (sage-tinted `#F0F7F4`) lifts cards a half-step; `--surface-warm`
  (`#E4E6E3`) is the warmest tier for nested fills.
- **Ink.** `--fg` is a near-black teal-black (`#071113`). `--fg-2` is the deep brand
  teal (`#1A4B51`), used for headings and emphasis; `--muted` and `--meta` step down
  to secondary and metadata text.
- **Accent.** `--accent` is the deep teal (`#1A4B51`) — the primary action color for
  buttons and highest-signal moments. Keep it to roughly two visible uses per screen.
  Sage green (`#7EAE89`) is the brand's secondary accent for smaller flourishes and
  is expressed through `--accent`-adjacent choices rather than a competing slot.
- **Semantic.** `--warn` is the brand amber (`#F7C800`) — the house rule is *amber,
  never red*, so `--danger` is a restrained warm red reserved strictly for genuine
  error states. `--success` echoes the WhatsApp green the brand already uses.
- **Borders.** Hairline, teal-tinted, and low-contrast (`--border` at 12% alpha).
  Depth comes from these 1px edges and a single whisper shadow, not heavy elevation.

## Typography

An all-serif system — the identity's defining choice.

- **Display** (`--font-display`) is *New York*, used for every heading (`h1`–`h6`).
- **Body** (`--font-body`) is *Lora*, for reading copy at `--leading-body` (1.6),
  a book-like measure rather than a dashboard's tightness.
- The scale runs `--text-xs` (12px) → `--text-4xl` (68px hero). Headings use
  `--leading-tight` (1.2) and a slight negative `--tracking-display` (-0.02em) so the
  large serif display settles optically.
- Small uppercase eyebrows/labels (the section overline) sit at `--text-sm` with
  wide tracking; the landing page draws these in *Source Serif 4*, kept in the
  serif family so UI chrome never breaks the editorial voice.

## Spacing & layout

- Content is capped at `--container-max` (1216px) with responsive gutters
  (`--container-gutter-desktop/tablet/phone`).
- Vertical rhythm is deliberately generous: `--section-y-desktop` is 140px, stepping
  down to 100px tablet / 72px phone. Sections breathe like a magazine spread.
- The spacing scale is an 8px base (`--space-1` = 4px … `--space-12` = 48px). Card
  interiors sit around `--space-6` (24px).

## Components & states

- **Buttons** are pill-shaped (`--radius-pill`), often with a trailing circular icon
  slot. Primary buttons fill with `--accent` and text in `--accent-on`; hover moves to
  `--accent-hover`, active to `--accent-active`. Secondary buttons are surface-filled
  with a hairline border.
- **Cards** ("glass cards") use `--surface`, a hairline `--border`, `--radius-lg`
  (16px), and lift on hover with `--elev-raised` (a teal-tinted whisper shadow).
- **Badges / eyebrows** are pill or tag shaped, low-chroma, set in metadata color.
- **Inputs** use `--radius-sm`, a hairline border, and the `--focus-ring` teal halo
  for keyboard focus.
- Every interactive element transitions on `--motion-base` with `--ease-standard`.

## Motion

Motion is present but understated: `--motion-fast` (150ms) for micro-states,
`--motion-base` (300ms) for larger changes, all on `--ease-standard`
(`cubic-bezier(0.16, 1, 0.3, 1)`) — a soft, decelerating curve. Entrances are gentle
fade-and-rise; nothing bounces or snaps. The editorial calm extends to how things move.

## Accessibility

- Body ink on canvas clears AA comfortably; secondary tiers stay legible on the warm
  surfaces. Never place `--meta` text on `--accent` fills.
- `--focus-ring` is a visible 3px teal halo — keep it on every focusable control; do
  not remove outlines without replacing them.
- Color is never the only signal: pair the amber `--warn` and the semantic colors with
  text or icons, since the palette is intentionally low-contrast between hues.

## Dark theme

A `[data-theme="dark"]` ramp is included (deep teal surfaces, light-blue ink). On dark,
the action color flips to light-blue (`--accent` → `#CDEAED`) with teal text
(`--accent-on`), because the deep-teal primary loses contrast on dark backgrounds.

## Anti-patterns

- Do not use pure white (`#FFFFFF`) as a background — the warm near-white *is* the brand.
- Do not introduce red as a highlight or accent; amber is the house emphasis color.
- Do not switch headings to a sans-serif; the all-serif type is the identity.
- Do not stack multiple saturated accents on one screen; the single teal must stay rare.
- Do not tighten the generous body leading or section rhythm into a dense "app" layout.
