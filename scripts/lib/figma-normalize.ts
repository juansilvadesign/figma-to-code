/**
 * Fork-adapter boundary — versioned raw fork replies → normalized capture.
 *
 * Everything downstream of this file consumes `NormalizedCapture` and must never
 * reach back into a raw payload. When the fork's reply shape changes, this file
 * is the only place that changes.
 *
 * Two rules this boundary enforces on the way through:
 *
 *   1. A value is carried forward only when the fork says it resolved. A
 *      variable whose `resolutionStatus` is not `"resolved"` becomes a recorded
 *      limitation, never a guess — including alias hops, where only the fork's
 *      own `resolvedValue` is trusted and the alias envelope is noted rather
 *      than interpreted.
 *   2. Colors are normalized to one representation. Style paints arrive as
 *      `{r,g,b}` floats with a separate paint opacity; node fills arrive already
 *      hex-encoded by the fork's node filter. Both become `NormalizedColor`.
 */

import type {
  LoadedCaptureBundle,
  SelectedNode,
} from "./capture-contract.js";
import type { JsonObject, JsonValue } from "./fork-payload-contracts.js";

export type BreakpointRole = "desktop" | "tablet" | "phone";
export type ThemeRole = "light" | "dark";

/**
 * How a collection's mode axis maps onto OpenDesign, which has exactly two
 * theme scopes and a fixed set of responsive structural slots.
 */
export type ModeAxis =
  | "single"
  | "theme"
  | "responsive"
  | "brand"
  | "ambiguous";

export type NormalizedColor = {
  /** `#rrggbb`, always lowercase. */
  hex: string;
  /** 0–1. Paint opacity, or 1 when the fork reported none. */
  opacity: number;
  /** CSS-ready: `#rrggbb` at full opacity, otherwise `rgba(…)`. */
  css: string;
};

export type NormalizedVariable = {
  id: string;
  name: string;
  resolvedType: string;
  /** Present only when the fork resolved the variable. */
  value?: string | number | boolean;
  /** True when the raw `value` was an envelope rather than a scalar. */
  aliased: boolean;
  resolved: boolean;
  resolutionStatus: string;
};

export type NormalizedMode = {
  id: string;
  name: string;
  themeRole?: ThemeRole;
  breakpointRole?: BreakpointRole;
  variables: NormalizedVariable[];
};

export type NormalizedCollection = {
  id: string;
  name: string;
  defaultModeId: string;
  axis: ModeAxis;
  /** Why `axis` was chosen — quoted verbatim into extraction evidence. */
  axisReason: string;
  modes: NormalizedMode[];
};

export type NormalizedPaintStyle = {
  id: string;
  name: string;
  paintType: string;
  /** Absent for non-solid paints (image, gradient) — not an error. */
  color?: NormalizedColor;
};

export type NormalizedNamedStyle = { id: string; name: string };

export type NormalizedText = {
  characters: string;
  fontFamily: string;
  fontStyle?: string;
  fontWeight: number;
  fontSize: number;
  lineHeightPx?: number;
  letterSpacing: number;
  textAlignHorizontal?: string;
  /** True when the node's fontFamily is bound to a variable. */
  fontFamilyBound: boolean;
};

export type NormalizedNode = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: NormalizedColor[];
  strokes: NormalizedColor[];
  cornerRadius?: number;
  text?: NormalizedText;
  children: NormalizedNode[];
};

export type NormalizedFrame = {
  nodeId: string;
  name: string;
  pageId: string;
  purposes: SelectedNode["purposes"];
  width: number;
  height: number;
  root: NormalizedNode;
  /** Resolved from the responsive mode whose declared width equals `width`. */
  breakpointRole?: BreakpointRole;
  breakpointReason?: string;
};

export type StyleUsage = {
  styleName: string;
  fill: number;
  stroke: number;
  text: number;
  effect: number;
  other: number;
};

export type NormalizedBinding = {
  nodeId: string;
  property: string;
  variableId: string;
  variableName: string;
  value?: JsonValue;
  resolved: boolean;
};

export type NormalizedCapture = {
  brand: string;
  captureId: string;
  capturedAt: string;
  source: {
    fileKey: string;
    documentId: string;
    documentName: string;
  };
  /**
   * Carried through from the capture manifest because derived artifacts inherit
   * it: a `tokens.source.json` built from a private-local capture still holds
   * that file's node ids and internal style names.
   */
  authorization: {
    commitPolicy: string;
    containsPrivateContent: boolean;
  };
  collections: NormalizedCollection[];
  paintStyles: NormalizedPaintStyle[];
  textStyles: NormalizedNamedStyle[];
  effectStyles: NormalizedNamedStyle[];
  frames: NormalizedFrame[];
  /** Keyed by style name, aggregated across every captured subtree. */
  styleUsage: Map<string, StyleUsage>;
  bindings: NormalizedBinding[];
  componentFamilies: { name: string; count: number }[];
  /** Every coverage gap the fork declared, plus the ones found here. */
  limitations: string[];
};

const THEME_MODE_NAMES: Record<string, ThemeRole> = {
  light: "light",
  claro: "light",
  day: "light",
  dark: "dark",
  escuro: "dark",
  night: "dark",
};

/**
 * Figma files name the same breakpoint half a dozen ways. Only the axis
 * vocabulary is interpreted here; a declared *width* still has to come from the
 * collection itself.
 */
const BREAKPOINT_MODE_NAMES: Record<string, BreakpointRole> = {
  desktop: "desktop",
  laptop: "desktop",
  web: "desktop",
  wide: "desktop",
  lg: "desktop",
  tablet: "tablet",
  ipad: "tablet",
  md: "tablet",
  mobile: "phone",
  phone: "phone",
  celular: "phone",
  sm: "phone",
};

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NormalizeError";
  }
}

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    // Strip the combining marks NFD just split off, so "atenção" and "atencao"
    // are the same key. Portuguese-named palettes depend on this.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toHex(component: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(component * 255)));
  return clamped.toString(16).padStart(2, "0");
}

export function colorFrom(
  value: JsonValue | undefined,
  opacity: number | undefined,
): NormalizedColor | undefined {
  let hex: string | undefined;
  if (typeof value === "string") {
    const match = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(value.trim());
    if (match === null) return undefined;
    hex = `#${match[1].toLowerCase()}`;
    if (match[2] !== undefined && opacity === undefined) {
      opacity = Number.parseInt(match[2], 16) / 255;
    }
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const { r, g, b, a } = value as Record<string, JsonValue>;
    if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") {
      return undefined;
    }
    hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    if (typeof a === "number" && opacity === undefined) opacity = a;
  }
  if (hex === undefined) return undefined;
  const alpha = opacity === undefined ? 1 : Math.min(1, Math.max(0, opacity));
  return { hex, opacity: alpha, css: cssColor(hex, alpha) };
}

export function cssColor(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Number(opacity.toFixed(4))})`;
}

function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function asArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function paintsToColors(value: JsonValue | undefined): NormalizedColor[] {
  const colors: NormalizedColor[] = [];
  for (const entry of asArray(value)) {
    const paint = asObject(entry);
    if (paint === undefined) continue;
    if (paint.visible === false) continue;
    if (paint.type !== undefined && paint.type !== "SOLID") continue;
    const opacity =
      typeof paint.opacity === "number" ? paint.opacity : undefined;
    const color = colorFrom(paint.color, opacity);
    if (color !== undefined) colors.push(color);
  }
  return colors;
}

function classifyModes(
  collectionName: string,
  modeNames: string[],
): { axis: ModeAxis; reason: string } {
  if (modeNames.length <= 1) {
    return {
      axis: "single",
      reason: `collection "${collectionName}" declares a single mode`,
    };
  }
  const themeHits = modeNames.filter(
    (name) => THEME_MODE_NAMES[normalizeName(name)] !== undefined,
  );
  const breakpointHits = modeNames.filter(
    (name) => BREAKPOINT_MODE_NAMES[normalizeName(name)] !== undefined,
  );
  if (themeHits.length === modeNames.length && breakpointHits.length === 0) {
    return {
      axis: "theme",
      reason: `every mode of "${collectionName}" names a theme (${modeNames.join(", ")})`,
    };
  }
  if (breakpointHits.length === modeNames.length && themeHits.length === 0) {
    return {
      axis: "responsive",
      reason: `every mode of "${collectionName}" names a breakpoint (${modeNames.join(", ")})`,
    };
  }
  if (themeHits.length > 0 && breakpointHits.length > 0) {
    return {
      axis: "ambiguous",
      reason: `"${collectionName}" mixes theme and breakpoint mode names (${modeNames.join(", ")})`,
    };
  }
  if (themeHits.length > 0 || breakpointHits.length > 0) {
    return {
      axis: "ambiguous",
      reason: `"${collectionName}" names only ${themeHits.length + breakpointHits.length} of ${modeNames.length} modes recognizably (${modeNames.join(", ")})`,
    };
  }
  return {
    axis: "brand",
    reason: `no mode of "${collectionName}" names a theme or a breakpoint (${modeNames.join(", ")})`,
  };
}

function normalizeVariable(entry: JsonValue): NormalizedVariable | undefined {
  const variable = asObject(entry);
  if (variable === undefined) return undefined;
  const id = variable.id;
  const name = variable.name;
  if (typeof id !== "string" || typeof name !== "string") return undefined;
  const status =
    typeof variable.resolutionStatus === "string"
      ? variable.resolutionStatus
      : "unknown";
  const resolvedValue = variable.resolvedValue;
  const scalar =
    typeof resolvedValue === "string" ||
    typeof resolvedValue === "number" ||
    typeof resolvedValue === "boolean"
      ? resolvedValue
      : undefined;
  const rawIsScalar =
    typeof variable.value === "string" ||
    typeof variable.value === "number" ||
    typeof variable.value === "boolean";
  const resolved = status === "resolved" && scalar !== undefined;
  return {
    id,
    name,
    resolvedType:
      typeof variable.resolvedType === "string" ? variable.resolvedType : "UNKNOWN",
    value: resolved ? scalar : undefined,
    // An envelope in `value` with a scalar in `resolvedValue` is an alias the
    // fork already followed. The envelope itself is never interpreted here.
    aliased: !rawIsScalar && variable.value !== undefined,
    resolved,
    resolutionStatus: status,
  };
}

function normalizeNode(entry: JsonValue): NormalizedNode | undefined {
  const node = asObject(entry);
  if (node === undefined) return undefined;
  const { id, name, type } = node;
  if (typeof id !== "string" || typeof name !== "string" || typeof type !== "string") {
    return undefined;
  }
  const box = asObject(node.absoluteBoundingBox);
  const number = (value: JsonValue | undefined): number =>
    typeof value === "number" ? value : 0;
  const style = asObject(node.style);
  let text: NormalizedText | undefined;
  if (
    type === "TEXT" &&
    style !== undefined &&
    typeof style.fontFamily === "string" &&
    typeof style.fontSize === "number"
  ) {
    const boundVariables = asObject(node.boundVariables);
    text = {
      characters:
        typeof node.characters === "string" ? node.characters : "",
      fontFamily: style.fontFamily,
      fontStyle: typeof style.fontStyle === "string" ? style.fontStyle : undefined,
      fontWeight: typeof style.fontWeight === "number" ? style.fontWeight : 400,
      fontSize: style.fontSize,
      lineHeightPx:
        typeof style.lineHeightPx === "number" ? style.lineHeightPx : undefined,
      letterSpacing:
        typeof style.letterSpacing === "number" ? style.letterSpacing : 0,
      textAlignHorizontal:
        typeof style.textAlignHorizontal === "string"
          ? style.textAlignHorizontal
          : undefined,
      fontFamilyBound: boundVariables?.fontFamily !== undefined,
    };
  }
  const children: NormalizedNode[] = [];
  for (const child of asArray(node.children)) {
    const normalized = normalizeNode(child);
    if (normalized !== undefined) children.push(normalized);
  }
  return {
    id,
    name,
    type,
    x: number(box?.x),
    y: number(box?.y),
    width: number(box?.width),
    height: number(box?.height),
    fills: paintsToColors(node.fills),
    strokes: paintsToColors(node.strokes),
    cornerRadius:
      typeof node.cornerRadius === "number" ? node.cornerRadius : undefined,
    text,
    children,
  };
}

/**
 * Resolve each captured frame to a breakpoint by matching its measured width
 * against a width declared by a responsive collection. Falling back to the
 * frame's capture purpose keeps files without a Size collection usable.
 */
function assignBreakpoints(
  frames: NormalizedFrame[],
  collections: NormalizedCollection[],
  limitations: string[],
): void {
  const declared: { role: BreakpointRole; width: number; source: string }[] = [];
  for (const collection of collections) {
    if (collection.axis !== "responsive") continue;
    for (const mode of collection.modes) {
      if (mode.breakpointRole === undefined) continue;
      const widthVariable = mode.variables.find(
        (variable) =>
          variable.resolved &&
          typeof variable.value === "number" &&
          /^(width|largura|viewport|size|breakpoint-width)$/.test(
            normalizeName(variable.name),
          ),
      );
      if (widthVariable !== undefined && typeof widthVariable.value === "number") {
        declared.push({
          role: mode.breakpointRole,
          width: widthVariable.value,
          source: `variable ${collection.name}/${widthVariable.name} @ mode ${mode.name}`,
        });
      }
    }
  }
  for (const frame of frames) {
    const hit = declared.find((entry) => entry.width === frame.width);
    if (hit !== undefined) {
      frame.breakpointRole = hit.role;
      frame.breakpointReason = `frame width ${frame.width} matches ${hit.source}`;
      continue;
    }
    if (frame.purposes.includes("desktop-frame")) {
      frame.breakpointRole = "desktop";
      frame.breakpointReason = `capture purpose desktop-frame (width ${frame.width} matches no declared breakpoint)`;
    } else if (frame.purposes.includes("mobile-frame")) {
      frame.breakpointRole = "phone";
      frame.breakpointReason = `capture purpose mobile-frame (width ${frame.width} matches no declared breakpoint)`;
    } else {
      limitations.push(
        `frame ${frame.nodeId} (${frame.name}) has no breakpoint: width ${frame.width} matches no declared mode and it carries no desktop/mobile purpose`,
      );
    }
  }
}

export function normalizeCaptureBundle(
  bundle: LoadedCaptureBundle,
): NormalizedCapture {
  const { manifest, payloads } = bundle;
  const limitations: string[] = [];
  const byRole = (role: string) =>
    manifest.artifacts.filter((artifact) => artifact.role === role);

  for (const artifact of manifest.artifacts) {
    for (const limitation of artifact.coverage?.limitations ?? []) {
      limitations.push(`${artifact.role} ${artifact.id}: ${limitation}`);
    }
  }

  // ── variables → collections/modes ──────────────────────────────────────
  const collections: NormalizedCollection[] = [];
  const variablesArtifact = byRole("variables")[0];
  const variablesPayload =
    variablesArtifact === undefined
      ? undefined
      : payloads.get(variablesArtifact.id);
  if (variablesPayload === undefined || typeof variablesPayload.value === "string") {
    throw new NormalizeError("capture is missing its get_variables payload");
  }
  for (const entry of asArray(variablesPayload.value.collections)) {
    const collection = asObject(entry);
    if (collection === undefined) continue;
    const id = collection.id;
    const name = collection.name;
    if (typeof id !== "string" || typeof name !== "string") continue;
    const rawModes = asArray(collection.modes)
      .map((mode) => asObject(mode))
      .filter((mode): mode is JsonObject => mode !== undefined);
    const modeNames = rawModes.map((mode) =>
      typeof mode.name === "string" ? mode.name : "",
    );
    const { axis, reason } = classifyModes(name, modeNames);
    const modes: NormalizedMode[] = rawModes.map((mode) => {
      const modeName = typeof mode.name === "string" ? mode.name : "";
      const key = normalizeName(modeName);
      const variables: NormalizedVariable[] = [];
      for (const variableEntry of asArray(mode.variables)) {
        const variable = normalizeVariable(variableEntry);
        if (variable === undefined) continue;
        if (!variable.resolved) {
          limitations.push(
            `variable ${collection.name}/${variable.name} @ mode ${modeName} is ${variable.resolutionStatus}; no value carried forward`,
          );
        }
        variables.push(variable);
      }
      return {
        id: typeof mode.id === "string" ? mode.id : "",
        name: modeName,
        themeRole: axis === "theme" ? THEME_MODE_NAMES[key] : undefined,
        breakpointRole:
          axis === "responsive" ? BREAKPOINT_MODE_NAMES[key] : undefined,
        variables,
      };
    });
    collections.push({
      id,
      name,
      defaultModeId:
        typeof collection.defaultModeId === "string"
          ? collection.defaultModeId
          : "",
      axis,
      axisReason: reason,
      modes,
    });
  }

  // ── styles ─────────────────────────────────────────────────────────────
  const paintStyles: NormalizedPaintStyle[] = [];
  const textStyles: NormalizedNamedStyle[] = [];
  const effectStyles: NormalizedNamedStyle[] = [];
  const stylesArtifact = byRole("styles")[0];
  const stylesPayload =
    stylesArtifact === undefined ? undefined : payloads.get(stylesArtifact.id);
  if (stylesPayload === undefined || typeof stylesPayload.value === "string") {
    throw new NormalizeError("capture is missing its get_styles payload");
  }
  for (const entry of asArray(stylesPayload.value.colors)) {
    const style = asObject(entry);
    if (style === undefined) continue;
    const { id, name } = style;
    if (typeof id !== "string" || typeof name !== "string") continue;
    const paint = asObject(style.paint);
    const paintType =
      paint !== undefined && typeof paint.type === "string" ? paint.type : "UNKNOWN";
    const color =
      paint === undefined || paintType !== "SOLID"
        ? undefined
        : colorFrom(
            paint.color,
            typeof paint.opacity === "number" ? paint.opacity : undefined,
          );
    if (paintType === "SOLID" && color === undefined) {
      limitations.push(
        `paint style "${name}" is SOLID but carries no readable color`,
      );
    }
    paintStyles.push({ id, name, paintType, color });
  }
  for (const [inventory, sink] of [
    ["texts", textStyles],
    ["effects", effectStyles],
  ] as const) {
    for (const entry of asArray(stylesPayload.value[inventory])) {
      const style = asObject(entry);
      if (style === undefined) continue;
      const { id, name } = style;
      if (typeof id === "string" && typeof name === "string") {
        sink.push({ id, name });
      }
    }
  }

  // ── frames ─────────────────────────────────────────────────────────────
  const frames: NormalizedFrame[] = [];
  for (const artifact of byRole("node")) {
    const payload = payloads.get(artifact.id);
    if (payload === undefined || typeof payload.value === "string") continue;
    const root = normalizeNode(payload.value);
    if (root === undefined) {
      limitations.push(`node artifact ${artifact.id} could not be normalized`);
      continue;
    }
    const selected = manifest.source.selectedNodes.find(
      (node) => node.id === artifact.nodeId,
    );
    frames.push({
      nodeId: root.id,
      name: root.name,
      pageId: artifact.pageId ?? "",
      purposes: selected?.purposes ?? [],
      width: root.width,
      height: root.height,
      root,
    });
  }
  frames.sort((left, right) => right.width - left.width);
  assignBreakpoints(frames, collections, limitations);

  // ── style usage + bindings, aggregated across every node-variables read ─
  const styleUsage = new Map<string, StyleUsage>();
  const bindings: NormalizedBinding[] = [];
  for (const artifact of byRole("node-variables")) {
    const payload = payloads.get(artifact.id);
    if (payload === undefined || typeof payload.value === "string") continue;
    for (const entry of asArray(payload.value.styles)) {
      const style = asObject(entry);
      if (style === undefined) continue;
      const name = style.styleName;
      const property = style.property;
      if (typeof name !== "string" || typeof property !== "string") continue;
      if (style.resolutionStatus !== "resolved") continue;
      const usage = styleUsage.get(name) ?? {
        styleName: name,
        fill: 0,
        stroke: 0,
        text: 0,
        effect: 0,
        other: 0,
      };
      if (property === "fillStyleId") usage.fill += 1;
      else if (property === "strokeStyleId") usage.stroke += 1;
      else if (property === "textStyleId") usage.text += 1;
      else if (property === "effectStyleId") usage.effect += 1;
      else usage.other += 1;
      styleUsage.set(name, usage);
    }
    for (const entry of asArray(payload.value.bindings)) {
      const binding = asObject(entry);
      if (binding === undefined) continue;
      const { nodeId, property, variableId, variableName } = binding;
      if (
        typeof nodeId !== "string" ||
        typeof property !== "string" ||
        typeof variableId !== "string" ||
        typeof variableName !== "string"
      ) {
        continue;
      }
      bindings.push({
        nodeId,
        property,
        variableId,
        variableName,
        value: binding.value,
        resolved: binding.resolutionStatus === "resolved",
      });
    }
  }

  // ── component families (summary mode) ──────────────────────────────────
  const componentFamilies: { name: string; count: number }[] = [];
  const componentsArtifact = byRole("components")[0];
  const componentsPayload =
    componentsArtifact === undefined
      ? undefined
      : payloads.get(componentsArtifact.id);
  if (componentsPayload !== undefined && typeof componentsPayload.value !== "string") {
    for (const entry of asArray(componentsPayload.value.nameFamilies)) {
      const family = asObject(entry);
      if (family === undefined) continue;
      const name = family.name;
      if (typeof name !== "string") continue;
      componentFamilies.push({
        name,
        count: typeof family.count === "number" ? family.count : 0,
      });
    }
  }

  return {
    brand: manifest.brand,
    captureId: manifest.captureId,
    capturedAt: manifest.capturedAt,
    source: {
      fileKey: manifest.source.fileKey,
      documentId: manifest.source.documentId,
      documentName: manifest.source.documentName,
    },
    authorization: {
      commitPolicy: manifest.authorization.commitPolicy,
      containsPrivateContent: manifest.authorization.containsPrivateContent,
    },
    collections,
    paintStyles,
    textStyles,
    effectStyles,
    frames,
    styleUsage,
    bindings,
    componentFamilies,
    limitations,
  };
}
