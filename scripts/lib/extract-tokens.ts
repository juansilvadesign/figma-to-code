/**
 * The pure transform: normalized capture + overrides + TOKEN_SCHEMA →
 * `tokens.source.json` + a resolution report.
 *
 * No I/O, no clock, no MCP. Same inputs → byte-identical output, which is what
 * makes the importer reviewable: a diff in the artifact means a diff in the
 * evidence, never a diff in when it ran.
 *
 * ── The rule that shapes everything here ─────────────────────────────────────
 * OpenDesign's A1 slots are mandatory and have no schema fallback; A2 and B
 * slots fill themselves. So this file **fails loudly on a missing A1 slot** and
 * **omits any A2/B slot it cannot evidence**, rather than inventing a value the
 * emitter would have supplied better. The slot lists are read from TOKEN_SCHEMA
 * at runtime — a schema change surfaces as an "unowned mandatory slot" error,
 * not as silent drift.
 */

import type { SlotOverrides } from "./capture-contract.js";
import type {
  BreakpointRole,
  NormalizedCapture,
  NormalizedColor,
  NormalizedFrame,
  NormalizedNode,
  NormalizedText,
} from "./figma-normalize.js";
import { normalizeName } from "./figma-normalize.js";
import {
  type Candidate,
  type ResolutionStage,
  matchByName,
} from "./token-resolution.js";

export type TokenLayer = "A1-identity" | "A1-structure" | "A2" | "B-slot";
export type TokenSpec = {
  readonly name: string;
  readonly layer: TokenLayer;
  readonly description: string;
  readonly fallback?: string;
  readonly aliasTo?: string;
};

export type Confidence = "high" | "derived";

export type SlotBinding = {
  value: string;
  confidence: Confidence;
  reason: string;
  source: string;
};

export type ResolutionRecord = {
  slot: string;
  stage: ResolutionStage;
  /** Set when an override pre-empted a stage that would otherwise have won. */
  preemptedStage?: ResolutionStage;
  confidence: Confidence;
  value: string;
  source: string;
  /** Rival candidates the name resolution rejected, best first. */
  runnersUp?: string[];
};

export type ExtractionReport = {
  brand: string;
  captureId: string;
  capturedAt: string;
  /** Inherited from the capture — this artifact is as private as its evidence. */
  commitPolicy: string;
  /** Counts per stage — the R3 generalization pass reads this. */
  resolvedByStage: Record<ResolutionStage, number>;
  resolutions: ResolutionRecord[];
  /** Declared evidence no slot claimed. */
  unmappedEvidence: string[];
  omittedOptionalSlots: string[];
  limitations: string[];
};

export type TokensSourceDoc = {
  $schema: string;
  brand: string;
  name: string;
  extraction: Record<string, unknown>;
  themes: {
    light: Record<string, SlotBinding>;
    dark?: Record<string, SlotBinding>;
  };
  components?: { inventory: string[]; notes: string };
};

export class ExtractionError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(
      `Extraction failed with ${issues.length} issue(s):\n` +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
    this.name = "ExtractionError";
    this.issues = [...issues];
  }
}

// ── formatting ──────────────────────────────────────────────────────────────

function px(value: number): string {
  return `${round(value)}px`;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function fontStack(family: string): string {
  const generic = /mono|code/i.test(family) ? "monospace" : "sans-serif";
  return `"${family}", ${generic}`;
}

function modeOf(values: number[]): { value: number; count: number } | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  );
  return { value: ranked[0][0], count: ranked[0][1] };
}

// ── schema-derived slot groups ──────────────────────────────────────────────

type SchemaView = {
  byName: Map<string, TokenSpec>;
  mandatory: string[];
  optional: string[];
  rampSlots: string[];
  baseSlotIndex: number;
  sectionSlots: Map<BreakpointRole, string>;
  gutterSlots: Map<BreakpointRole, string>;
  /** Responsive slots whose suffix this extractor does not know how to measure. */
  unknownBreakpointSlots: string[];
  containerMax?: string;
  leadingBody?: string;
  leadingTight?: string;
  trackingDisplay?: string;
};

function viewOf(schema: readonly TokenSpec[]): SchemaView {
  const byName = new Map(schema.map((spec) => [spec.name, spec]));
  const isMandatory = (spec: TokenSpec): boolean =>
    spec.layer === "A1-identity" || spec.layer === "A1-structure";
  const rampSlots = schema
    .filter((spec) => /^--text-/.test(spec.name) && isMandatory(spec))
    .map((spec) => spec.name);
  const sectionSlots = new Map<BreakpointRole, string>();
  const gutterSlots = new Map<BreakpointRole, string>();
  const unknownBreakpointSlots: string[] = [];
  // The breakpoint set is read off the schema's own slot names. A suffix this
  // extractor cannot measure becomes a loud error rather than a silent skip —
  // that is the whole point of loading TOKEN_SCHEMA at runtime.
  const isBreakpoint = (value: string): value is BreakpointRole =>
    value === "desktop" || value === "tablet" || value === "phone";
  for (const spec of schema) {
    for (const [pattern, sink] of [
      [/^--section-y-(.+)$/, sectionSlots],
      [/^--container-gutter-(.+)$/, gutterSlots],
    ] as const) {
      const match = pattern.exec(spec.name);
      if (match === null) continue;
      if (isBreakpoint(match[1])) sink.set(match[1], spec.name);
      else unknownBreakpointSlots.push(spec.name);
    }
  }
  return {
    unknownBreakpointSlots,
    byName,
    mandatory: schema.filter(isMandatory).map((spec) => spec.name),
    optional: schema.filter((spec) => !isMandatory(spec)).map((spec) => spec.name),
    rampSlots,
    baseSlotIndex: rampSlots.indexOf("--text-base"),
    sectionSlots,
    gutterSlots,
    containerMax: byName.has("--container-max") ? "--container-max" : undefined,
    leadingBody: byName.has("--leading-body") ? "--leading-body" : undefined,
    leadingTight: byName.has("--leading-tight") ? "--leading-tight" : undefined,
    trackingDisplay: byName.has("--tracking-display")
      ? "--tracking-display"
      : undefined,
  };
}

// ── node walking ────────────────────────────────────────────────────────────

function walk(node: NormalizedNode, visit: (node: NormalizedNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function textNodes(frame: NormalizedFrame): { node: NormalizedNode; text: NormalizedText }[] {
  const found: { node: NormalizedNode; text: NormalizedText }[] = [];
  walk(frame.root, (node) => {
    if (node.text !== undefined) found.push({ node, text: node.text });
  });
  return found;
}

// ── color resolution ────────────────────────────────────────────────────────

type ColorCandidate = Candidate & {
  color: NormalizedColor;
  tier: 0 | 1;
  usage: number;
  usageDetail: string;
};

function colorCandidates(capture: NormalizedCapture): ColorCandidate[] {
  const candidates: ColorCandidate[] = [];
  for (const collection of capture.collections) {
    if (collection.axis === "brand" || collection.axis === "ambiguous") continue;
    for (const mode of collection.modes) {
      if (mode.themeRole === "dark") continue;
      for (const variable of mode.variables) {
        if (!variable.resolved || variable.resolvedType !== "COLOR") continue;
        const color =
          typeof variable.value === "string"
            ? parseHexish(variable.value)
            : undefined;
        if (color === undefined) continue;
        candidates.push({
          name: variable.name,
          source: `variable ${collection.name}/${variable.name}${
            collection.modes.length > 1 ? ` @ ${mode.name}` : ""
          }`,
          color,
          tier: 0,
          usage: 0,
          usageDetail: "declared variable",
        });
      }
    }
  }
  for (const style of capture.paintStyles) {
    if (style.color === undefined) continue;
    const usage = capture.styleUsage.get(style.name);
    const total =
      (usage?.fill ?? 0) + (usage?.stroke ?? 0) + (usage?.other ?? 0);
    candidates.push({
      name: style.name,
      source: `paint style "${style.name}"`,
      color: style.color,
      tier: 1,
      usage: total,
      usageDetail:
        usage === undefined
          ? "0 recorded uses in the captured subtrees"
          : `${usage.fill} fill / ${usage.stroke} stroke uses in the captured subtrees`,
    });
  }
  return candidates;
}

function parseHexish(value: string): NormalizedColor | undefined {
  const match = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(value.trim());
  if (match === null) return undefined;
  const hex = `#${match[1].toLowerCase()}`;
  const opacity =
    match[2] === undefined ? 1 : Number.parseInt(match[2], 16) / 255;
  return {
    hex,
    opacity,
    css:
      opacity >= 1
        ? hex
        : `rgba(${Number.parseInt(hex.slice(1, 3), 16)}, ${Number.parseInt(
            hex.slice(3, 5),
            16,
          )}, ${Number.parseInt(hex.slice(5, 7), 16)}, ${Number(opacity.toFixed(4))})`,
  };
}

/** Frequency of a measured color across the captured frames, by paint role. */
function measuredColors(
  capture: NormalizedCapture,
  role: "fill" | "stroke" | "text-fill",
): { color: NormalizedColor; count: number }[] {
  const counts = new Map<string, { color: NormalizedColor; count: number }>();
  for (const frame of capture.frames) {
    walk(frame.root, (node) => {
      const paints =
        role === "stroke"
          ? node.strokes
          : role === "text-fill"
            ? node.text !== undefined
              ? node.fills
              : []
            : node.text === undefined
              ? node.fills
              : [];
      for (const paint of paints) {
        const entry = counts.get(paint.css) ?? { color: paint, count: 0 };
        entry.count += 1;
        counts.set(paint.css, entry);
      }
    });
  }
  return [...counts.values()].sort(
    (left, right) => right.count - left.count || left.color.css.localeCompare(right.color.css),
  );
}

// ── the transform ───────────────────────────────────────────────────────────

export type ExtractInput = {
  capture: NormalizedCapture;
  overrides: SlotOverrides;
  schema: readonly TokenSpec[];
  /** Human-facing display name; defaults to the captured document name. */
  name?: string;
  /** The single explicitly-isolated run-time field. Omitted when absent. */
  stamp?: string;
};

export function extractTokens(input: ExtractInput): {
  document: TokensSourceDoc;
  report: ExtractionReport;
} {
  const { capture, overrides, schema } = input;
  const view = viewOf(schema);
  const issues: string[] = [];
  const limitations = [...capture.limitations];
  const light = new Map<string, SlotBinding>();
  const dark = new Map<string, SlotBinding>();
  const resolutions: ResolutionRecord[] = [];
  const claimedEvidence = new Set<string>();

  if (capture.source.fileKey === capture.source.documentName) {
    limitations.push(
      "the capture carries no distinct Figma file key — the fork's socket interface does not expose one, " +
        "so this package cannot be traced back to a Figma URL automatically; record the URL by hand in R1.5's evidence.md",
    );
  }
  if (view.unknownBreakpointSlots.length > 0) {
    issues.push(
      `TOKEN_SCHEMA declares responsive slot(s) this extractor cannot measure: ` +
        `${view.unknownBreakpointSlots.join(", ")}. Teach measureFrame the new breakpoint before emitting.`,
    );
  }
  assertModeAxes(capture, overrides, issues);
  if (issues.length > 0) throw new ExtractionError(issues);

  resolveColors(capture, view, light, dark, resolutions, claimedEvidence, limitations);
  const fonts = resolveFonts(capture, view, light, resolutions, claimedEvidence);
  resolveTypeRamp(capture, view, light, resolutions, limitations, fonts);
  resolveStructure(capture, view, light, resolutions, limitations, issues);

  applyOverrides(overrides, view, light, resolutions, issues);

  // ── mandatory-slot gate ────────────────────────────────────────────────
  const missing = view.mandatory.filter((slot) => !light.has(slot));
  if (missing.length > 0) {
    issues.push(
      `no evidence resolved ${missing.length} mandatory slot(s): ${missing.join(", ")}. ` +
        `Add them to slot-overrides.json or capture the frames that would evidence them.`,
    );
  }
  if (issues.length > 0) throw new ExtractionError(issues);

  const resolvedByStage: Record<ResolutionStage, number> = {
    override: 0,
    exact: 0,
    "group-variant": 0,
    "role-map": 0,
    heuristic: 0,
  };
  for (const record of resolutions) resolvedByStage[record.stage] += 1;

  // Sorted by usage, descending: the first line is the strongest rival to
  // whatever the name-first resolution chose.
  const unmapped = [
    ...capture.paintStyles
      .filter((style) => !claimedEvidence.has(`paint style "${style.name}"`))
      .map((style) => {
        const usage = capture.styleUsage.get(style.name);
        const total = (usage?.fill ?? 0) + (usage?.stroke ?? 0);
        return {
          total,
          line: `paint style "${style.name}"${
            style.color === undefined ? " (non-solid)" : ` ${style.color.css}`
          } — ${usage?.fill ?? 0} fill / ${usage?.stroke ?? 0} stroke uses`,
        };
      })
      .sort((left, right) => right.total - left.total || left.line.localeCompare(right.line))
      .map((entry) => entry.line),
    ...capture.effectStyles
      .map(
        (style) =>
          `effect style "${style.name}" — the fork reports effect names but not values, so --elev-* stays omitted`,
      )
      .sort(),
  ];

  const omitted = view.optional.filter((slot) => !light.has(slot)).sort();

  const document: TokensSourceDoc = {
    $schema:
      "clone-website extraction artifact — consumed by scripts/emit-design-system.ts",
    brand: capture.brand,
    name: input.name ?? capture.source.documentName,
    extraction: {
      target: `${capture.source.documentName} (Figma)`,
      sourcePath: `docs/research/${capture.captureId}`,
      method: methodOf(resolutions),
      evidence:
        "talk-to-figma fork capture bundle — get_variables, get_styles, get_node_info, get_node_variables",
      note:
        "Only slots with real or derived evidence are listed. The emitter fills unspecified A2 slots from the OpenDesign schema fallback and B-slots from their aliasTo sibling.",
      figmaDocument: capture.source.documentName,
      // Only when the capture really carries a key. The fork's socket interface
      // does not expose one, so `fileKey` is usually just the document name
      // again — emitting that as a key would publish an identifier that cannot
      // be resolved back to a Figma URL.
      ...(capture.source.fileKey === capture.source.documentName
        ? {}
        : { figmaFileKey: capture.source.fileKey }),
      capturedAt: capture.capturedAt,
      ...(input.stamp === undefined ? {} : { generatedAt: input.stamp }),
    },
    themes: {
      light: sortedRecord(light),
      ...(dark.size > 0 ? { dark: sortedRecord(dark) } : {}),
    },
    ...(capture.componentFamilies.length > 0
      ? {
          components: {
            inventory: capture.componentFamilies
              .slice()
              .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
              .slice(0, 24)
              .map((family) => `${family.name} (${family.count})`),
            notes:
              "Component families as reported by get_local_components summary mode. R1.5 authors components.html from these families plus targeted node reads — not from this list alone.",
          },
        }
      : {}),
  };

  return {
    document,
    report: {
      brand: capture.brand,
      captureId: capture.captureId,
      capturedAt: capture.capturedAt,
      commitPolicy: capture.authorization.commitPolicy,
      resolvedByStage,
      resolutions: resolutions.slice().sort((left, right) => left.slot.localeCompare(right.slot)),
      unmappedEvidence: unmapped,
      omittedOptionalSlots: omitted,
      limitations: [...new Set(limitations)].sort(),
    },
  };
}

function methodOf(resolutions: readonly ResolutionRecord[]): string {
  const stages = new Set(resolutions.map((record) => record.stage));
  if (stages.has("heuristic") && stages.size > 1) return "figma-mixed";
  if (stages.has("heuristic")) return "figma-computed";
  return "figma-styles";
}

function sortedRecord(map: Map<string, SlotBinding>): Record<string, SlotBinding> {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function assertModeAxes(
  capture: NormalizedCapture,
  overrides: SlotOverrides,
  issues: string[],
): void {
  for (const collection of capture.collections) {
    if (collection.axis === "ambiguous") {
      issues.push(
        `collection "${collection.name}" has an ambiguous mode axis — ${collection.axisReason}. ` +
          `Resolve it in slot-overrides.json under modeMap: {"${collection.name}": "<mode name>"}.`,
      );
      continue;
    }
    if (collection.axis === "brand") {
      const chosen = overrides.modeMap[collection.name];
      if (typeof chosen !== "string") {
        issues.push(
          `collection "${collection.name}" is a brand axis with ${collection.modes.length} modes ` +
            `(${collection.modes.map((mode) => mode.name).join(", ")}) — ${collection.axisReason}. ` +
            `One design system per brand mode: pick one in slot-overrides.json under ` +
            `modeMap: {"${collection.name}": "<mode name>"} and re-run per mode.`,
        );
        continue;
      }
      if (!collection.modes.some((mode) => mode.name === chosen)) {
        issues.push(
          `slot-overrides.modeMap["${collection.name}"] names mode "${chosen}", which the collection does not declare.`,
        );
      }
    }
  }
}

// ── producer: colors ────────────────────────────────────────────────────────

function resolveColors(
  capture: NormalizedCapture,
  view: SchemaView,
  light: Map<string, SlotBinding>,
  dark: Map<string, SlotBinding>,
  resolutions: ResolutionRecord[],
  claimed: Set<string>,
  limitations: string[],
): void {
  const candidates = colorCandidates(capture);
  const colorSlots = [
    ...view.mandatory,
    ...view.optional,
  ].filter((slot) => /^--(bg|surface|fg|muted|meta|border|accent|success|warn|danger)/.test(slot));

  for (const slot of colorSlots) {
    if (light.has(slot)) continue;
    const matches = matchByName(slot, candidates);
    if (matches.length === 0) continue;

    // Prefer an unclaimed candidate; reuse only when nothing else matched.
    const best =
      matches.find((match) => !claimed.has(match.candidate.source)) ?? matches[0];
    const reused = claimed.has(best.candidate.source);
    claimed.add(best.candidate.source);

    const runnersUp = matches
      .filter((match) => match !== best)
      .slice(0, 3)
      .map(
        (match) =>
          `${match.candidate.source} ${match.candidate.color.css} (${match.candidate.usageDetail})`,
      );

    light.set(slot, {
      value: best.candidate.color.css,
      confidence: "high",
      reason:
        `${best.reason}; ${best.candidate.usageDetail}.` +
        (reused ? " Shared with another slot — the file declares no distinct value." : ""),
      source: best.candidate.source,
    });
    resolutions.push({
      slot,
      stage: best.stage,
      confidence: "high",
      value: best.candidate.color.css,
      source: best.candidate.source,
      ...(runnersUp.length > 0 ? { runnersUp } : {}),
    });
  }

  // Decision (2026-08-02): the name wins, and the usage disagreement is
  // recorded rather than silently resolved the other way. Computed in a second
  // pass so "unclaimed" means unclaimed by *any* slot, not by the slots that
  // happened to resolve earlier.
  for (const [slot, binding] of light.entries()) {
    const chosen = candidates.find((entry) => entry.source === binding.source);
    if (chosen === undefined) continue;
    const rival = candidates
      .filter((entry) => !claimed.has(entry.source))
      .sort((left, right) => right.usage - left.usage || left.name.localeCompare(right.name))[0];
    if (rival === undefined || rival.usage <= Math.max(4, chosen.usage * 2)) continue;
    binding.reason += ` Usage disagrees with the name: ${rival.source} ${rival.color.css} carries ${rival.usage} uses and no slot claims it, against ${chosen.usage} here.`;
    const record = resolutions.find((entry) => entry.slot === slot);
    if (record !== undefined) {
      record.runnersUp = [
        ...(record.runnersUp ?? []),
        `unclaimed by name, ${rival.usage} uses: ${rival.source} ${rival.color.css}`,
      ];
    }
  }

  // Stage 4 — conservative heuristics for mandatory color slots no name claimed.
  const heuristics: Record<string, { role: "fill" | "stroke" | "text-fill"; rank: number; what: string }> = {
    "--bg": { role: "fill", rank: 0, what: "most frequent non-text fill" },
    "--surface": { role: "fill", rank: 1, what: "second most frequent non-text fill" },
    "--fg": { role: "text-fill", rank: 0, what: "most frequent text fill" },
    "--muted": { role: "text-fill", rank: 1, what: "second most frequent text fill" },
    "--border": { role: "stroke", rank: 0, what: "most frequent stroke" },
  };
  for (const slot of view.mandatory) {
    if (light.has(slot)) continue;
    const rule = heuristics[slot];
    if (rule === undefined) continue;
    const measured = measuredColors(capture, rule.role);
    const hit = measured[rule.rank];
    if (hit === undefined) {
      limitations.push(
        `no ${rule.role} evidence in the captured frames for ${slot}`,
      );
      continue;
    }
    // A measured value that duplicates an already-resolved slot is a real
    // finding, not a failure: a border the same color as the page background is
    // what the file actually says. Record it so R1.5 can compare deliberately
    // and so an override is an informed choice rather than a taste call.
    const collision = [...light.entries()].find(
      ([, binding]) => binding.value === hit.color.css,
    );
    if (collision !== undefined) {
      limitations.push(
        `${slot} was measured as ${hit.color.css}, the same value already resolved for ${collision[0]} — ` +
          `the ${rule.what} in this file is not visually distinct. Override in slot-overrides.json if that is wrong.`,
      );
    }
    light.set(slot, {
      value: hit.color.css,
      confidence: "derived",
      reason:
        `${rule.what} across the captured frames (${hit.count} nodes); no declared style or variable claims ${slot}` +
        (collision === undefined ? "" : `. Identical to ${collision[0]}`),
      source: `measured:${rule.role}`,
    });
    resolutions.push({
      slot,
      stage: "heuristic",
      confidence: "derived",
      value: hit.color.css,
      source: `measured:${rule.role} (${hit.count} nodes)`,
      runnersUp: measured
        .slice(0, 4)
        .filter((entry) => entry !== hit)
        .map((entry) => `${entry.color.css} (${entry.count} nodes)`),
    });
  }

  // Dark theme, only where a theme-axis collection genuinely differs.
  for (const collection of capture.collections) {
    if (collection.axis !== "theme") continue;
    const darkMode = collection.modes.find((mode) => mode.themeRole === "dark");
    if (darkMode === undefined) continue;
    for (const variable of darkMode.variables) {
      if (!variable.resolved || variable.resolvedType !== "COLOR") continue;
      const color =
        typeof variable.value === "string" ? parseHexish(variable.value) : undefined;
      if (color === undefined) continue;
      for (const [slot, binding] of light.entries()) {
        if (
          binding.source === `variable ${collection.name}/${variable.name}` ||
          binding.source.startsWith(`variable ${collection.name}/${variable.name} @`)
        ) {
          if (binding.value !== color.css) {
            dark.set(slot, {
              value: color.css,
              confidence: "high",
              reason: `${collection.name}/${variable.name} @ ${darkMode.name} overrides the light value`,
              source: `variable ${collection.name}/${variable.name} @ ${darkMode.name}`,
            });
          }
        }
      }
    }
  }
}

// ── producer: fonts ─────────────────────────────────────────────────────────

function resolveFonts(
  capture: NormalizedCapture,
  view: SchemaView,
  light: Map<string, SlotBinding>,
  resolutions: ResolutionRecord[],
  claimed: Set<string>,
): { declaredFamilies: Set<string>; reason: string } {
  const candidates: (Candidate & { family: string })[] = [];
  for (const collection of capture.collections) {
    if (collection.axis === "brand" || collection.axis === "ambiguous") continue;
    for (const mode of collection.modes) {
      if (mode.themeRole === "dark") continue;
      for (const variable of mode.variables) {
        if (!variable.resolved || typeof variable.value !== "string") continue;
        if (variable.resolvedType !== "STRING") continue;
        // A STRING variable is a font only when a font slot's role table claims
        // its name — this avoids treating `breakpoint: "laptop"` as a family.
        candidates.push({
          name: variable.name,
          source: `variable ${collection.name}/${variable.name}`,
          family: variable.value,
        });
      }
    }
  }

  const declaredFamilies = new Set<string>();
  for (const slot of ["--font-display", "--font-body", "--font-mono"]) {
    if (!view.byName.has(slot)) continue;
    const matches = matchByName(slot, candidates);
    if (matches.length === 0) continue;
    const best =
      matches.find((match) => !claimed.has(match.candidate.source)) ?? matches[0];
    claimed.add(best.candidate.source);
    declaredFamilies.add(best.candidate.family);
    light.set(slot, {
      value: fontStack(best.candidate.family),
      confidence: "high",
      reason: `${best.reason}; the file declares the family "${best.candidate.family}" and no fallback chain, so one generic fallback is appended`,
      source: best.candidate.source,
    });
    resolutions.push({
      slot,
      stage: best.stage,
      confidence: "high",
      value: fontStack(best.candidate.family),
      source: best.candidate.source,
    });
  }

  if (declaredFamilies.size > 0) {
    return {
      declaredFamilies,
      reason: `families declared by font variables: ${[...declaredFamilies].sort().join(", ")}`,
    };
  }

  // Nothing declared — fall back to the dominant measured family, and say so.
  const families = new Map<string, number>();
  for (const frame of capture.frames) {
    for (const { text } of textNodes(frame)) {
      families.set(text.fontFamily, (families.get(text.fontFamily) ?? 0) + 1);
    }
  }
  const ranked = [...families.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  if (ranked.length === 0) return { declaredFamilies, reason: "no text evidence" };
  const [dominant, count] = ranked[0];
  declaredFamilies.add(dominant);
  for (const slot of ["--font-display", "--font-body"]) {
    if (!view.byName.has(slot) || light.has(slot)) continue;
    light.set(slot, {
      value: fontStack(dominant),
      confidence: "derived",
      reason: `no font variable or text style declares a family; "${dominant}" is the dominant measured family (${count} text nodes)`,
      source: `measured:font-family`,
    });
    resolutions.push({
      slot,
      stage: "heuristic",
      confidence: "derived",
      value: fontStack(dominant),
      source: `measured:font-family (${count} nodes)`,
    });
  }
  return {
    declaredFamilies,
    reason: `no declared font family; measured dominant family "${dominant}" (${count} text nodes)`,
  };
}

// ── producer: type ramp ─────────────────────────────────────────────────────

function resolveTypeRamp(
  capture: NormalizedCapture,
  view: SchemaView,
  light: Map<string, SlotBinding>,
  resolutions: ResolutionRecord[],
  limitations: string[],
  fonts: { declaredFamilies: Set<string>; reason: string },
): void {
  if (view.rampSlots.length === 0 || view.baseSlotIndex === -1) return;

  const all: { size: number; text: NormalizedText; nodeId: string }[] = [];
  for (const frame of capture.frames) {
    for (const { node, text } of textNodes(frame)) {
      all.push({ size: text.fontSize, text, nodeId: node.id });
    }
  }
  let pool = all.filter(
    (entry) =>
      fonts.declaredFamilies.size === 0 ||
      fonts.declaredFamilies.has(entry.text.fontFamily),
  );
  const excluded = new Map<string, number>();
  for (const entry of all) {
    if (pool.includes(entry)) continue;
    excluded.set(
      entry.text.fontFamily,
      (excluded.get(entry.text.fontFamily) ?? 0) + 1,
    );
  }
  // A declared family that no text node actually uses (a stale variable, or a
  // font variable pointing at a family used only outside the captured frames)
  // must not silently delete the ramp and surface as 11 missing A1 slots.
  if (pool.length === 0 && all.length > 0) {
    limitations.push(
      `no text node uses a declared font family (${[...fonts.declaredFamilies].sort().join(", ") || "none"}); ` +
        `the type ramp falls back to all ${all.length} captured text nodes`,
    );
    pool = all;
    excluded.clear();
  }
  if (excluded.size > 0) {
    limitations.push(
      `type ramp built from declared-font text only (${fonts.reason}); ` +
        `excluded ${[...excluded.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([family, count]) => `${family} ×${count}`)
          .join(", ")} as third-party paste-ins`,
    );
  }
  if (pool.length === 0) {
    limitations.push("no text nodes matched the declared font families");
    return;
  }

  const counts = new Map<number, number>();
  for (const entry of pool) counts.set(entry.size, (counts.get(entry.size) ?? 0) + 1);
  const distinct = [...counts.keys()].sort((left, right) => left - right);

  // `--text-base` is the most-used size inside a plausible body range.
  const bodyRange = distinct.filter((size) => size >= 12 && size <= 20);
  const baseSize =
    (bodyRange.length > 0 ? bodyRange : distinct)
      .slice()
      .sort(
        (left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0) || left - right,
      )[0];

  const belowSlots = view.rampSlots.slice(0, view.baseSlotIndex).reverse();
  const aboveSlots = view.rampSlots.slice(view.baseSlotIndex + 1);
  const belowSizes = distinct.filter((size) => size < baseSize).sort((a, b) => b - a);
  const aboveSizes = distinct.filter((size) => size > baseSize).sort((a, b) => a - b);

  const belowPicked = fitRungs(belowSizes, belowSlots.length, counts, baseSize, "down");
  const abovePicked = fitRungs(aboveSizes, aboveSlots.length, counts, baseSize, "up");

  const assign = (
    slot: string,
    rung: Rung,
    neighbours: string,
  ): void => {
    const value = px(rung.size);
    const reason =
      rung.kind === "measured"
        ? `measured type ramp: ${counts.get(rung.size) ?? 0} text node(s) at ${round(rung.size)}px; the file declares 0 text styles, so every rung is projected off nodes`
        : `interpolated between ${neighbours}; the file declares no size at this rung`;
    light.set(slot, {
      value,
      confidence: "derived",
      reason: rung.note === undefined ? reason : `${reason}. ${rung.note}`,
      source: rung.kind === "measured" ? `measured:text-size ${round(rung.size)}px` : "interpolated:text-ramp",
    });
    resolutions.push({
      slot,
      stage: "heuristic",
      confidence: "derived",
      value,
      source: rung.kind === "measured" ? `measured:text-size (${counts.get(rung.size) ?? 0} nodes)` : "interpolated:text-ramp",
    });
  };

  assign(
    view.rampSlots[view.baseSlotIndex],
    { size: baseSize, kind: "measured" },
    "",
  );
  belowSlots.forEach((slot, index) => {
    const rung = belowPicked[index];
    if (rung !== undefined) assign(slot, rung, "the neighbouring rungs");
  });
  aboveSlots.forEach((slot, index) => {
    const rung = abovePicked[index];
    if (rung !== undefined) assign(slot, rung, "the neighbouring rungs");
  });

  // Leading + tracking, measured at the rungs that own them.
  const ratioAt = (predicate: (size: number) => boolean): number | undefined => {
    const ratios = pool
      .filter(
        (entry) => predicate(entry.size) && entry.text.lineHeightPx !== undefined,
      )
      .map((entry) => round((entry.text.lineHeightPx as number) / entry.size, 3));
    return modeOf(ratios)?.value;
  };
  if (view.leadingBody !== undefined) {
    const ratio = ratioAt((size) => size === baseSize);
    if (ratio !== undefined) {
      setDerived(
        light,
        resolutions,
        view.leadingBody,
        String(ratio),
        `dominant line-height ÷ font-size at the ${round(baseSize)}px body rung`,
        `measured:line-height @ ${round(baseSize)}px`,
      );
    }
  }
  // These two anchor on *measured* sizes, never on a projected rung: an
  // interpolated 48.8px rung has no nodes, so asking it for a line-height would
  // silently drop a mandatory slot.
  const largestMeasured = distinct.at(-1) ?? baseSize;
  const headingFloor = abovePicked
    .filter((rung) => rung.kind === "measured")
    .at(Math.max(0, abovePicked.filter((rung) => rung.kind === "measured").length - 3))
    ?.size;
  if (view.leadingTight !== undefined) {
    const atHeadings =
      headingFloor === undefined ? undefined : ratioAt((size) => size >= headingFloor);
    if (atHeadings !== undefined) {
      setDerived(
        light,
        resolutions,
        view.leadingTight,
        String(atHeadings),
        `dominant line-height ÷ font-size at heading rungs (≥ ${round(headingFloor as number)}px)`,
        `measured:line-height ≥ ${round(headingFloor as number)}px`,
      );
    } else {
      // No measured size above the body rung. Headings are the tight end of the
      // scale, so the tightest ratio the file actually contains is the honest
      // answer — and when there is only one, say that it equals the body.
      const ratios = pool
        .filter((entry) => entry.text.lineHeightPx !== undefined)
        .map((entry) => round((entry.text.lineHeightPx as number) / entry.size, 3));
      const tightest = ratios.length === 0 ? undefined : Math.min(...ratios);
      if (tightest !== undefined) {
        setDerived(
          light,
          resolutions,
          view.leadingTight,
          String(tightest),
          `the file declares no measured size above the ${round(baseSize)}px body rung; used the tightest line-height ratio it does contain${
            new Set(ratios).size === 1 ? ", which is the body ratio — the file distinguishes no heading leading" : ""
          }`,
          "measured:line-height (tightest)",
        );
      }
    }
  }
  if (view.trackingDisplay !== undefined) {
    const tracking = pool.filter((entry) => entry.size === largestMeasured);
    const em = modeOf(
      tracking.map((entry) => round(entry.text.letterSpacing / entry.size, 4)),
    );
    if (em !== undefined) {
      setDerived(
        light,
        resolutions,
        view.trackingDisplay,
        `${em.value}em`,
        `letter-spacing ÷ font-size at the largest measured size (${round(largestMeasured)}px, ${em.count} node(s))`,
        `measured:letter-spacing @ ${round(largestMeasured)}px`,
      );
    }
  }
}

function setDerived(
  light: Map<string, SlotBinding>,
  resolutions: ResolutionRecord[],
  slot: string,
  value: string,
  reason: string,
  source: string,
): void {
  light.set(slot, { value, confidence: "derived", reason, source });
  resolutions.push({
    slot,
    stage: "heuristic",
    confidence: "derived",
    value,
    source,
  });
}

type Rung = {
  size: number;
  kind: "measured" | "interpolated";
  note?: string;
};

/**
 * Project N candidate sizes onto M rungs.
 *
 * Too many candidates: repeatedly merge the closest adjacent pair, keeping the
 * more-used member — a 38px one-off next to a 40px family is one rung, not two.
 * Too few: interpolate geometrically and mark the rung `interpolated`.
 */
function fitRungs(
  sizes: readonly number[],
  slots: number,
  counts: ReadonlyMap<number, number>,
  baseSize: number,
  direction: "up" | "down",
): Rung[] {
  if (slots === 0) return [];
  let working = sizes.map((size): Rung => ({ size, kind: "measured" }));

  while (working.length > slots) {
    let bestIndex = 0;
    let bestRatio = Infinity;
    for (let index = 0; index + 1 < working.length; index += 1) {
      const low = Math.min(working[index].size, working[index + 1].size);
      const high = Math.max(working[index].size, working[index + 1].size);
      const ratio = high / low;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        bestIndex = index;
      }
    }
    const left = working[bestIndex];
    const right = working[bestIndex + 1];
    const leftCount = counts.get(left.size) ?? 0;
    const rightCount = counts.get(right.size) ?? 0;
    const keep =
      leftCount !== rightCount
        ? leftCount > rightCount
          ? left
          : right
        : Math.abs(left.size - baseSize) <= Math.abs(right.size - baseSize)
          ? left
          : right;
    const dropped = keep === left ? right : left;
    working.splice(bestIndex, 2, {
      ...keep,
      note: `${round(dropped.size)}px merged into this rung (ratio ${round(bestRatio, 3)}, ${
        counts.get(dropped.size) ?? 0
      } node(s) vs ${counts.get(keep.size) ?? 0})`,
    });
  }

  // Fewer candidates than rungs. Two different situations, two honest answers.
  const FAN_RATIO = 1.25;
  while (working.length < slots) {
    if (working.length >= 2) {
      // Interior gap: the guide's rule — interpolate and name both neighbours.
      let bestIndex = 0;
      let bestRatio = 0;
      for (let index = 0; index + 1 < working.length; index += 1) {
        const low = Math.min(working[index].size, working[index + 1].size);
        const high = Math.max(working[index].size, working[index + 1].size);
        const ratio = high / low;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestIndex = index;
        }
      }
      if (bestRatio > 1) {
        const low = working[bestIndex];
        const high = working[bestIndex + 1];
        working.splice(bestIndex + 1, 0, {
          size: round(Math.sqrt(low.size * high.size)),
          kind: "interpolated",
          note: `geometric mean of the neighbouring measured rungs ${round(low.size)}px and ${round(high.size)}px`,
        });
        continue;
      }
    }
    // Nothing to sit between: the file has no size on this side of the body
    // rung at all. Fan outward from the last known rung on a fixed ratio and
    // say exactly that — these slots are mandatory, so omitting is not an option.
    const anchor = working.at(-1) ?? { size: baseSize, kind: "measured" as const };
    const outward = direction === "up" ? FAN_RATIO : 1 / FAN_RATIO;
    working.push({
      size: round(anchor.size * outward),
      kind: "interpolated",
      note:
        working.length === 0
          ? `the file declares no size ${direction === "up" ? "above" : "below"} the ${round(baseSize)}px body rung; fanned out on a ${FAN_RATIO} ratio`
          : `fanned out from ${round(anchor.size)}px on a ${FAN_RATIO} ratio; the file declares no further size in this direction`,
    });
  }

  return working.slice(0, slots);
}

// ── producer: structure ─────────────────────────────────────────────────────

type FrameMeasurements = {
  breakpoint: BreakpointRole;
  frame: NormalizedFrame;
  sectionY?: { value: number; count: number; total: number };
  gutter?: { value: number; count: number; total: number };
  contentWidth?: { value: number; count: number; total: number };
};

function measureFrame(frame: NormalizedFrame): FrameMeasurements | undefined {
  if (frame.breakpointRole === undefined) return undefined;
  const sections = frame.root.children.filter(
    (child) =>
      child.width >= frame.width * 0.9 && child.height > 0 && child.width > 0,
  );
  const tops: number[] = [];
  const gutters: number[] = [];
  const widths: number[] = [];
  for (const section of sections) {
    // The content wrapper: the widest child that is genuinely inset from the
    // section edges. Absolutely-positioned art (negative offsets, overflow)
    // is skipped rather than averaged in.
    const inset = section.children
      .filter(
        (child) =>
          child.width > 0 &&
          child.width < section.width * 0.995 &&
          child.x >= section.x &&
          child.x + child.width <= section.x + section.width &&
          child.y >= section.y &&
          child.y - section.y <= section.height / 2,
      )
      .sort((left, right) => right.width - left.width)[0];
    if (inset === undefined) continue;
    tops.push(round(inset.y - section.y));
    gutters.push(round(inset.x - section.x));
    widths.push(round(inset.width));
  }
  const withTotal = (
    values: number[],
  ): { value: number; count: number; total: number } | undefined => {
    const mode = modeOf(values);
    return mode === undefined
      ? undefined
      : { value: mode.value, count: mode.count, total: values.length };
  };
  return {
    breakpoint: frame.breakpointRole,
    frame,
    sectionY: withTotal(tops.filter((top) => top > 0)),
    gutter: withTotal(gutters),
    contentWidth: withTotal(widths),
  };
}

function resolveStructure(
  capture: NormalizedCapture,
  view: SchemaView,
  light: Map<string, SlotBinding>,
  resolutions: ResolutionRecord[],
  limitations: string[],
  issues: string[],
): void {
  const measured = new Map<BreakpointRole, FrameMeasurements>();
  for (const frame of capture.frames) {
    const measurement = measureFrame(frame);
    if (measurement !== undefined) measured.set(measurement.breakpoint, measurement);
  }
  if (measured.size === 0) {
    issues.push(
      "no captured frame could be measured for section rhythm or container width",
    );
    return;
  }

  const declaredWidths = new Map<BreakpointRole, number>();
  for (const collection of capture.collections) {
    if (collection.axis !== "responsive") continue;
    for (const mode of collection.modes) {
      if (mode.breakpointRole === undefined) continue;
      const width = mode.variables.find(
        (variable) =>
          variable.resolved &&
          typeof variable.value === "number" &&
          /^(width|largura|viewport|size)$/.test(normalizeName(variable.name)),
      );
      if (width !== undefined && typeof width.value === "number") {
        declaredWidths.set(mode.breakpointRole, width.value);
      }
    }
  }

  const set = (
    slot: string,
    value: string,
    confidence: Confidence,
    reason: string,
    source: string,
  ): void => {
    light.set(slot, { value, confidence, reason, source });
    resolutions.push({ slot, stage: "heuristic", confidence, value, source });
  };

  const fill = (
    slots: ReadonlyMap<BreakpointRole, string>,
    pick: (measurement: FrameMeasurements) => { value: number; count: number; total: number } | undefined,
    label: string,
  ): void => {
    const known = new Map<BreakpointRole, number>();
    for (const [breakpoint, measurement] of measured.entries()) {
      const hit = pick(measurement);
      if (hit === undefined) continue;
      known.set(breakpoint, hit.value);
      const slot = slots.get(breakpoint);
      if (slot === undefined) continue;
      set(
        slot,
        px(hit.value),
        "derived",
        `${label} measured on ${measurement.frame.name} (${measurement.frame.nodeId}, ${measurement.frame.width}px): ${hit.value}px on ${hit.count} of ${hit.total} sections`,
        `measured:${measurement.frame.nodeId}`,
      );
    }
    // Breakpoints with no captured frame are interpolated across the declared
    // widths — never omitted, because these slots are mandatory.
    for (const [breakpoint, slot] of slots.entries()) {
      if (light.has(slot)) continue;
      const interpolated = interpolateBreakpoint(breakpoint, known, declaredWidths);
      if (interpolated === undefined) {
        limitations.push(`${slot} has no frame and no basis for interpolation`);
        continue;
      }
      set(
        slot,
        px(interpolated.value),
        "derived",
        `no ${breakpoint} frame was captured; ${interpolated.reason}`,
        "interpolated:breakpoint",
      );
    }
  };

  fill(view.sectionSlots, (measurement) => measurement.sectionY, "section top padding");
  fill(view.gutterSlots, (measurement) => measurement.gutter, "container side gutter");

  if (view.containerMax !== undefined && !light.has(view.containerMax)) {
    const widest = [...measured.values()].sort(
      (left, right) => right.frame.width - left.frame.width,
    )[0];
    if (widest.contentWidth !== undefined) {
      set(
        view.containerMax,
        px(widest.contentWidth.value),
        "derived",
        `content column measured on the widest captured frame ${widest.frame.name} (${widest.frame.nodeId}, ${widest.frame.width}px): ${widest.contentWidth.value}px on ${widest.contentWidth.count} of ${widest.contentWidth.total} sections`,
        `measured:${widest.frame.nodeId}`,
      );
    } else {
      limitations.push(
        `${view.containerMax} could not be measured on any captured frame`,
      );
    }
  }
}

function interpolateBreakpoint(
  target: BreakpointRole,
  known: ReadonlyMap<BreakpointRole, number>,
  widths: ReadonlyMap<BreakpointRole, number>,
): { value: number; reason: string } | undefined {
  if (known.size === 0) return undefined;
  const targetWidth = widths.get(target);
  const points = [...known.entries()]
    .map(([breakpoint, value]) => ({
      breakpoint,
      value,
      width: widths.get(breakpoint),
    }))
    .filter((point): point is { breakpoint: BreakpointRole; value: number; width: number } =>
      point.width !== undefined,
    )
    .sort((left, right) => left.width - right.width);

  if (targetWidth !== undefined && points.length >= 2) {
    const low = points.filter((point) => point.width <= targetWidth).at(-1) ?? points[0];
    const high = points.find((point) => point.width >= targetWidth) ?? points.at(-1)!;
    if (low.width !== high.width) {
      const t = (targetWidth - low.width) / (high.width - low.width);
      return {
        // Whole pixels: a design token of 33.37px is arithmetic leaking into the
        // artifact, not a decision anyone made.
        value: Math.round(low.value + (high.value - low.value) * t),
        reason:
          `linearly interpolated on declared frame widths between ${low.breakpoint} ` +
          `(${low.width}px → ${low.value}px) and ${high.breakpoint} (${high.width}px → ${high.value}px) ` +
          `at the declared ${target} width ${targetWidth}px`,
      };
    }
    return {
      value: low.value,
      reason: `only one distinct declared width available; reused the ${low.breakpoint} value`,
    };
  }

  const widest = [...known.entries()].sort((left, right) => right[1] - left[1])[0];
  return {
    value: widest[1],
    reason: `no declared width for ${target}; reused the ${widest[0]} value unchanged`,
  };
}

// ── stage 0: overrides ──────────────────────────────────────────────────────

function applyOverrides(
  overrides: SlotOverrides,
  view: SchemaView,
  light: Map<string, SlotBinding>,
  resolutions: ResolutionRecord[],
  issues: string[],
): void {
  for (const [slot, raw] of Object.entries(overrides.slots)) {
    if (!view.byName.has(slot)) {
      issues.push(
        `slot-overrides.slots["${slot}"] is not a slot in the loaded TOKEN_SCHEMA`,
      );
      continue;
    }
    let value: string | undefined;
    let reason = "explicit per-file override";
    if (typeof raw === "string") {
      value = raw;
    } else if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      const candidate = raw.value;
      if (typeof candidate === "string") value = candidate;
      if (typeof raw.reason === "string") reason = raw.reason;
    }
    if (value === undefined) {
      issues.push(
        `slot-overrides.slots["${slot}"] must be a string or an object with a string "value"`,
      );
      continue;
    }
    const previous = resolutions.find((record) => record.slot === slot);
    light.set(slot, {
      value,
      confidence: "high",
      reason,
      source: "slot-overrides.json",
    });
    const index = resolutions.findIndex((record) => record.slot === slot);
    const record: ResolutionRecord = {
      slot,
      stage: "override",
      ...(previous === undefined ? {} : { preemptedStage: previous.stage }),
      confidence: "high",
      value,
      source: "slot-overrides.json",
    };
    if (index === -1) resolutions.push(record);
    else resolutions[index] = record;
  }
}
