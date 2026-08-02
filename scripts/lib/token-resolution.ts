/**
 * Name → slot resolution, in explicit stages.
 *
 *   0. override      — `slot-overrides.json` pre-empts everything. The stage that
 *                      *would* have won is still recorded, so an override that has
 *                      stopped being necessary is visible rather than invisible.
 *   1. exact         — the candidate's normalized name equals the slot name, with
 *                      or without the leading `--`.
 *   2. group/variant — path-style names (`text/secondary`, `bg/subtle`) matched as
 *                      a group segment plus a variant segment.
 *   3. role map      — a whole-name synonym from the bilingual role table.
 *   4. heuristic     — measured from real nodes. Callers own this stage; it is
 *                      never a name match, and it always lands as `derived`.
 *
 * ── Why the role table is bilingual ──────────────────────────────────────────
 * The first real file this importer runs against names its palette `primaria`,
 * `secundaria`, `texto`, `bg`, `card`, `apoio`, `erro`, `atencao`. An
 * English-only table resolves none of them, which would push every pt-BR file
 * through hand-written overrides forever. Synonyms are matched on a
 * diacritic-stripped key, so `atenção` and `atencao` are one entry.
 *
 * ── One deliberate omission ──────────────────────────────────────────────────
 * `secundaria` / `secundario` are NOT mapped to `--muted`, even though English
 * `text/secondary` is. In a pt-BR brand palette "secundária" is the *second
 * brand color*, not muted body copy — SYD's `secundaria` is a saturated indigo.
 * Bare `secondary` is likewise left unclaimed; only `text/secondary` and its
 * siblings resolve, via stage 2.
 */

import { normalizeName } from "./figma-normalize.js";

export type ResolutionStage =
  | "override"
  | "exact"
  | "group-variant"
  | "role-map"
  | "heuristic";

export type RoleRule = {
  /** Whole-name synonyms, highest priority first. */
  names: readonly string[];
  /** Path-style matches: any `groups` segment paired with any `variants` segment. */
  groups?: readonly string[];
  variants?: readonly string[];
};

/**
 * Keyed by OpenDesign slot name. Slots absent from this table can still be
 * filled by a heuristic producer or an override — the table only covers what a
 * *name* is allowed to claim.
 */
export const ROLE_MAP: Readonly<Record<string, RoleRule>> = {
  "--bg": {
    names: ["bg", "background", "fundo", "canvas", "page", "pagina", "base"],
    groups: ["bg", "background", "fundo", "surface", "superficie"],
    variants: ["default", "base", "page", "pagina", "canvas", "primary", "primaria"],
  },
  "--surface": {
    names: ["surface", "card", "cartao", "painel", "panel", "superficie", "sheet"],
    groups: ["bg", "background", "fundo", "surface", "superficie"],
    variants: ["subtle", "elevated", "card", "cartao", "raised", "alt", "secondary", "1", "2"],
  },
  "--fg": {
    names: ["fg", "text", "texto", "ink", "tinta", "content", "foreground", "conteudo"],
    groups: ["text", "texto", "content", "conteudo", "fg", "ink", "tinta"],
    variants: ["primary", "primaria", "primario", "default", "base", "strong", "body", "corpo", "900"],
  },
  "--muted": {
    names: ["muted", "placeholder", "apoio", "subtle", "caption", "legenda", "hint"],
    groups: ["text", "texto", "content", "conteudo", "fg", "ink", "tinta"],
    variants: ["secondary", "secundario", "secundaria", "muted", "subtle", "weak", "caption", "legenda", "placeholder"],
  },
  "--border": {
    names: ["border", "borda", "stroke", "traco", "divider", "divisor", "outline", "contorno", "hairline"],
    groups: ["border", "borda", "stroke", "divider", "outline"],
    variants: ["default", "base", "primary", "subtle", "1"],
  },
  "--accent": {
    names: ["accent", "brand", "marca", "primary", "primaria", "primario", "destaque"],
    groups: ["brand", "marca", "accent", "primary", "primaria"],
    variants: ["default", "base", "primary", "primaria", "500", "600"],
  },
  "--danger": {
    names: ["danger", "error", "erro", "negative", "negativo", "perigo", "destructive"],
    groups: ["semantic", "feedback", "status", "estado"],
    variants: ["danger", "error", "erro", "negative", "negativo"],
  },
  "--warn": {
    names: ["warn", "warning", "atencao", "alerta", "caution", "aviso"],
    groups: ["semantic", "feedback", "status", "estado"],
    variants: ["warn", "warning", "atencao", "alerta", "aviso"],
  },
  "--success": {
    names: ["success", "sucesso", "positive", "positivo"],
    groups: ["semantic", "feedback", "status", "estado"],
    variants: ["success", "sucesso", "positive", "positivo"],
  },
  "--accent-on": {
    names: ["accent-on", "on-accent", "on-primary", "text-on-accent", "sobre-primaria"],
    groups: ["text", "texto", "content", "fg"],
    variants: ["on-accent", "on-primary", "inverse", "invertido", "white", "branco"],
  },
  "--font-display": {
    names: ["display", "heading", "headings", "titulo", "titulos", "title", "font-display", "cabecalho"],
    groups: ["font", "fonte", "typography", "tipografia", "typograph"],
    variants: ["display", "heading", "titulo", "title", "cabecalho"],
  },
  "--font-body": {
    names: ["body", "corpo", "text", "texto", "paragraph", "paragrafo", "font-body"],
    groups: ["font", "fonte", "typography", "tipografia", "typograph"],
    variants: ["body", "corpo", "text", "texto", "paragraph", "paragrafo", "default", "base"],
  },
  "--font-mono": {
    names: ["mono", "monospace", "code", "codigo", "font-mono"],
    groups: ["font", "fonte", "typography", "tipografia", "typograph"],
    variants: ["mono", "monospace", "code", "codigo"],
  },
};

export type Candidate = {
  /** Whatever the evidence is called in the file — style name, variable name. */
  name: string;
  /** `style:<name>` / `variable:<collection>/<name>` — quoted into evidence. */
  source: string;
};

export type NameMatch<T extends Candidate> = {
  candidate: T;
  stage: Extract<ResolutionStage, "exact" | "group-variant" | "role-map">;
  /** Lower is better. Used only to break ties inside one stage. */
  priority: number;
  reason: string;
};

const STAGE_ORDER: Record<NameMatch<Candidate>["stage"], number> = {
  exact: 0,
  "group-variant": 1,
  "role-map": 2,
};

function segmentsOf(name: string): string[] {
  return normalizeName(name).split("/").filter((segment) => segment.length > 0);
}

/**
 * Rank every candidate that a *name* lets claim `slot`, best first. Returns an
 * empty array when nothing claims it — the caller then decides whether to run a
 * heuristic or to fail.
 */
export function matchByName<T extends Candidate>(
  slot: string,
  candidates: readonly T[],
): NameMatch<T>[] {
  const rule = ROLE_MAP[slot];
  const bare = slot.replace(/^--/, "");
  const matches: NameMatch<T>[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeName(candidate.name);
    const segments = segmentsOf(candidate.name);
    const last = segments.at(-1) ?? "";

    if (normalized === bare || normalized === slot) {
      matches.push({
        candidate,
        stage: "exact",
        priority: 0,
        reason: `name "${candidate.name}" is the slot name`,
      });
      continue;
    }
    if (rule === undefined) continue;

    if (
      rule.groups !== undefined &&
      rule.variants !== undefined &&
      segments.length >= 2
    ) {
      const group = segments[0];
      const groupIndex = rule.groups.indexOf(group);
      const variantIndex = rule.variants.indexOf(last);
      if (groupIndex !== -1 && variantIndex !== -1) {
        matches.push({
          candidate,
          stage: "group-variant",
          priority: variantIndex * 100 + groupIndex,
          reason: `name "${candidate.name}" is group "${group}" + variant "${last}"`,
        });
        continue;
      }
    }

    const nameIndex = rule.names.indexOf(normalized);
    if (nameIndex !== -1) {
      matches.push({
        candidate,
        stage: "role-map",
        priority: nameIndex,
        reason: `name "${candidate.name}" is a role-map synonym for ${slot}`,
      });
    }
  }

  matches.sort((left, right) => {
    const byStage = STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage];
    if (byStage !== 0) return byStage;
    if (left.priority !== right.priority) return left.priority - right.priority;
    // Deterministic final tie-break; never leave ordering to input order.
    return left.candidate.name.localeCompare(right.candidate.name);
  });
  return matches;
}

/**
 * Slots this table can claim, so the extractor can assert that every mandatory
 * slot is owned by *some* producer instead of silently skipping one.
 */
export function roleMapSlots(): readonly string[] {
  return Object.keys(ROLE_MAP);
}
