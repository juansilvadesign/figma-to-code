#!/usr/bin/env -S node --import tsx
/**
 * Offline tests for the R1.4 extractor.
 *
 * Two levels, deliberately:
 *   - the fork-adapter boundary (`normalizeCaptureBundle`), driven by
 *     hand-built payload literals, because that is where fork reply shapes are
 *     interpreted;
 *   - the pure transform (`extractTokens`), driven by synthetic normalized
 *     captures, because that is where slot decisions are made.
 *
 * The schema is the real TOKEN_SCHEMA loaded from open-design — never a copy —
 * so a schema change fails these tests instead of silently changing output.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LoadedCaptureBundle, SlotOverrides } from "./lib/capture-contract.js";
import {
  ExtractionError,
  type TokenSpec,
  extractTokens,
} from "./lib/extract-tokens.js";
import type {
  NormalizedCapture,
  NormalizedFrame,
  NormalizedNode,
} from "./lib/figma-normalize.js";
import { NormalizeError, normalizeCaptureBundle } from "./lib/figma-normalize.js";
import type { JsonObject } from "./lib/fork-payload-contracts.js";
import { loadTokenSchema } from "./extract-figma-tokens.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;

function check(name: string, action: () => void): void {
  action();
  passed += 1;
  console.log(`✅ ${name}`);
}

function expectFailure(name: string, action: () => void, expected: RegExp): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof Error, `${name}: expected an Error`);
  assert.match(thrown.message, expected, `${name}: unexpected failure message`);
  passed += 1;
  console.log(`✅ ${name}`);
}

// ── builders ────────────────────────────────────────────────────────────────

const NO_OVERRIDES: SlotOverrides = {
  schemaVersion: "figma-to-code/slot-overrides/v1",
  modeMap: {},
  slots: {},
  notes: [],
};

function text(
  id: string,
  size: number,
  y: number,
  family = "Lato",
  color = "#111111",
): NormalizedNode {
  return {
    id,
    name: `text-${id}`,
    type: "TEXT",
    x: 100,
    y,
    width: 200,
    height: size * 1.5,
    fills: [{ hex: color, opacity: 1, css: color }],
    strokes: [],
    text: {
      characters: "sample",
      fontFamily: family,
      fontWeight: 400,
      fontSize: size,
      lineHeightPx: size * 1.6,
      letterSpacing: 0,
      fontFamilyBound: true,
    },
    children: [],
  };
}

/**
 * A frame shaped like a real landing page: full-bleed sections, each holding one
 * inset content column. That inset is what section rhythm and gutters are
 * measured from.
 */
function frame(options: {
  nodeId: string;
  width: number;
  gutter: number;
  sectionY: number;
  purposes: NormalizedFrame["purposes"];
  sizes?: number[];
  strokeColor?: string;
}): NormalizedFrame {
  const { nodeId, width, gutter, sectionY, purposes } = options;
  const sizes = options.sizes ?? [12, 14, 16, 16, 16, 18, 20, 24, 32, 48];
  const sections: NormalizedNode[] = [];
  let cursor = 0;
  for (let index = 0; index < 6; index += 1) {
    const height = 600;
    const content: NormalizedNode = {
      id: `${nodeId}-c${index}`,
      name: "Container",
      type: "FRAME",
      x: gutter,
      y: cursor + sectionY,
      width: width - gutter * 2,
      height: height - sectionY * 2,
      fills: [],
      strokes:
        options.strokeColor === undefined
          ? []
          : [
              {
                hex: options.strokeColor,
                opacity: 1,
                css: options.strokeColor,
              },
            ],
      children: sizes
        .slice(index * 2, index * 2 + 3)
        .map((size, order) =>
          text(`${nodeId}-t${index}-${order}`, size, cursor + sectionY + order * 40),
        ),
    };
    sections.push({
      id: `${nodeId}-s${index}`,
      name: `Section ${index}`,
      type: "FRAME",
      x: 0,
      y: cursor,
      width,
      height,
      fills: [{ hex: "#ffffff", opacity: 1, css: "#ffffff" }],
      strokes: [],
      children: [content],
    });
    cursor += height;
  }
  // Guarantee every declared size appears somewhere, regardless of the slicing.
  sections[0].children[0].children.push(
    ...sizes.map((size, order) => text(`${nodeId}-extra-${order}`, size, order * 10)),
  );
  return {
    nodeId,
    name: `Frame ${nodeId}`,
    pageId: "1:1",
    purposes,
    width,
    height: cursor,
    root: {
      id: nodeId,
      name: `Frame ${nodeId}`,
      type: "FRAME",
      x: 0,
      y: 0,
      width,
      height: cursor,
      fills: [],
      strokes: [],
      children: sections,
    },
  };
}

function capture(patch: Partial<NormalizedCapture> = {}): NormalizedCapture {
  const desktop = frame({
    nodeId: "1:10",
    width: 1280,
    gutter: 64,
    sectionY: 96,
    purposes: ["desktop-frame"],
    strokeColor: "#dddddd",
  });
  desktop.breakpointRole = "desktop";
  const phone = frame({
    nodeId: "1:20",
    width: 375,
    gutter: 16,
    sectionY: 48,
    purposes: ["mobile-frame"],
    strokeColor: "#dddddd",
  });
  phone.breakpointRole = "phone";

  return {
    brand: "fixture",
    captureId: "fixture",
    capturedAt: "2026-01-01T00:00:00Z",
    source: {
      fileKey: "FIXTUREKEY",
      documentId: "0:0",
      documentName: "Fixture File",
    },
    authorization: { commitPolicy: "sanitized-fixture", containsPrivateContent: false },
    collections: [],
    paintStyles: [
      solid("bg", "#fefefe"),
      solid("card", "#f2f2f2"),
      solid("texto", "#111111"),
      solid("placeholder", "#777777"),
      solid("primaria", "#0055ff"),
      solid("borda", "#dddddd"),
    ],
    textStyles: [],
    effectStyles: [],
    frames: [desktop, phone],
    styleUsage: new Map(),
    bindings: [],
    componentFamilies: [],
    limitations: [],
    ...patch,
  };
}

function solid(name: string, hex: string) {
  return {
    id: `S:${name}`,
    name,
    paintType: "SOLID",
    color: { hex, opacity: 1, css: hex },
  };
}

function fontCollection(name = "Typograph") {
  return {
    id: "VariableCollectionId:1",
    name,
    defaultModeId: "m0",
    axis: "single" as const,
    axisReason: "single mode",
    modes: [
      {
        id: "m0",
        name: "Mode 1",
        variables: [
          variable("Heading", "STRING", "Fixture Display"),
          variable("Body", "STRING", "Fixture Body"),
        ],
      },
    ],
  };
}

function variable(
  name: string,
  resolvedType: string,
  value: string | number,
  patch: Record<string, unknown> = {},
) {
  return {
    id: `VariableID:${name}`,
    name,
    resolvedType,
    value,
    aliased: false,
    resolved: true,
    resolutionStatus: "resolved",
    ...patch,
  };
}

function bundle(payloadPatch: {
  variables?: JsonObject;
  styles?: JsonObject;
  omit?: "variables" | "styles";
}): LoadedCaptureBundle {
  const artifacts = [
    { id: "variables-1", role: "variables" as const, path: "raw/variables.json" },
    { id: "styles-1", role: "styles" as const, path: "raw/styles.json" },
  ].filter((artifact) => artifact.role !== payloadPatch.omit);

  const payloads = new Map<string, { role: string; value: JsonObject; limitations: string[] }>();
  if (payloadPatch.omit !== "variables") {
    payloads.set("variables-1", {
      role: "variables",
      value: payloadPatch.variables ?? { collections: [] },
      limitations: [],
    });
  }
  if (payloadPatch.omit !== "styles") {
    payloads.set("styles-1", {
      role: "styles",
      value: payloadPatch.styles ?? { colors: [], texts: [], effects: [] },
      limitations: [],
    });
  }

  return {
    root: "/fixture",
    manifest: {
      brand: "fixture",
      captureId: "fixture",
      capturedAt: "2026-01-01T00:00:00Z",
      source: {
        fileKey: "K",
        documentId: "0:0",
        documentName: "Fixture",
        selectedPageIds: ["1:1"],
        selectedNodes: [],
      },
      authorization: {
        commitPolicy: "sanitized-fixture",
        containsPrivateContent: false,
      },
      artifacts: artifacts.map((artifact) => ({
        ...artifact,
        mediaType: "application/json",
        sha256: "0".repeat(64),
        bytes: 0,
        capturedAt: "2026-01-01T00:00:00Z",
        coverage: { scope: "document", complete: true, limitations: [] },
      })),
    },
    payloads,
    screenshots: new Map(),
    overrides: NO_OVERRIDES,
  } as unknown as LoadedCaptureBundle;
}

// ── tests ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const schema = await loadTokenSchema(
    path.resolve(
      SCRIPT_DIR,
      process.env.OPEN_DESIGN_ROOT ?? "../../../skills/open-design",
    ),
  );
  const mandatory = schema
    .filter((spec) => spec.layer === "A1-identity" || spec.layer === "A1-structure")
    .map((spec) => spec.name);
  const run = (patch: Partial<NormalizedCapture>, overrides = NO_OVERRIDES) =>
    extractTokens({ capture: capture(patch), overrides, schema });

  // 1 ── declared variables outrank styles and land as `high`.
  check("declared COLOR variables resolve at high confidence", () => {
    const { document } = run({
      collections: [
        {
          id: "c1",
          name: "Brand",
          defaultModeId: "m0",
          axis: "single",
          axisReason: "single mode",
          modes: [
            {
              id: "m0",
              name: "Mode 1",
              variables: [
                variable("bg", "COLOR", "#abcdef"),
                variable("Heading", "STRING", "Var Display"),
                variable("Body", "STRING", "Var Body"),
              ],
            },
          ],
        },
      ],
    });
    const bg = document.themes.light["--bg"];
    assert.equal(bg.value, "#abcdef");
    assert.equal(bg.confidence, "high");
    assert.match(bg.source, /^variable Brand\/bg$/);
    assert.equal(document.themes.light["--font-display"].value, '"Var Display", sans-serif');
  });

  // 2 ── alias resolution: only the fork's own resolvedValue is trusted, and an
  //      unresolved variable becomes a limitation instead of a value.
  check("alias hops use resolvedValue; unresolved variables are dropped", () => {
    const normalized = normalizeCaptureBundle(
      bundle({
        variables: {
          collections: [
            {
              id: "c1",
              name: "Brand",
              defaultModeId: "m0",
              modes: [
                {
                  id: "m0",
                  name: "Mode 1",
                  variables: [
                    {
                      id: "VariableID:1",
                      name: "alias-ok",
                      resolvedType: "COLOR",
                      value: { type: "VARIABLE_ALIAS", id: "VariableID:base" },
                      resolvedValue: "#123456",
                      resolutionStatus: "resolved",
                    },
                    {
                      id: "VariableID:2",
                      name: "alias-broken",
                      resolvedType: "COLOR",
                      value: { type: "VARIABLE_ALIAS", id: "VariableID:missing" },
                      resolvedValue: null,
                      resolutionStatus: "unresolved",
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
    const [ok, broken] = normalized.collections[0].modes[0].variables;
    assert.equal(ok.value, "#123456");
    assert.equal(ok.aliased, true, "an envelope in `value` marks the variable aliased");
    assert.equal(broken.resolved, false);
    assert.equal(broken.value, undefined, "an unresolved variable carries no value");
    assert.ok(
      normalized.limitations.some((entry) => /alias-broken.*unresolved/.test(entry)),
      "the unresolved variable is recorded as a limitation",
    );
  });

  // 3 ── style-only fallback: no variables at all, styles still resolve the
  //      identity colors, and the ramp falls back to the measured font family.
  check("a file with no variables resolves from styles alone", () => {
    const { document, report } = run({ collections: [] });
    assert.equal(document.themes.light["--bg"].value, "#fefefe");
    assert.equal(document.themes.light["--surface"].value, "#f2f2f2");
    assert.equal(document.themes.light["--accent"].value, "#0055ff");
    assert.equal(document.themes.light["--fg"].value, "#111111");
    assert.equal(
      document.themes.light["--font-body"].confidence,
      "derived",
      "an undeclared font family is derived, never high",
    );
    assert.ok(report.resolvedByStage["role-map"] > 0);
  });

  // 4 ── responsive modes feed the responsive structural slots, not a theme.
  check("responsive modes drive the structural slots", () => {
    const { document } = run({
      collections: [
        fontCollection(),
        {
          id: "c2",
          name: "Size",
          defaultModeId: "m0",
          axis: "responsive",
          axisReason: "breakpoint modes",
          modes: [
            {
              id: "m0",
              name: "Desktop",
              breakpointRole: "desktop",
              variables: [variable("width", "FLOAT", 1280)],
            },
            {
              id: "m1",
              name: "Tablet",
              breakpointRole: "tablet",
              variables: [variable("width", "FLOAT", 768)],
            },
            {
              id: "m2",
              name: "Mobile",
              breakpointRole: "phone",
              variables: [variable("width", "FLOAT", 375)],
            },
          ],
        },
      ],
    });
    assert.equal(document.themes.light["--section-y-desktop"].value, "96px");
    assert.equal(document.themes.light["--section-y-phone"].value, "48px");
    assert.equal(document.themes.light["--container-gutter-desktop"].value, "64px");
    assert.equal(document.themes.light["--container-gutter-phone"].value, "16px");
    assert.equal(document.themes.light["--container-max"].value, "1152px");
    assert.equal(
      document.themes.dark,
      undefined,
      "a responsive axis must not create a dark theme scope",
    );
    // Tablet has no frame: interpolated on the declared widths, whole pixels.
    const tablet = document.themes.light["--section-y-tablet"];
    assert.equal(tablet.confidence, "derived");
    assert.match(tablet.value, /^\d+px$/, "interpolated values are whole pixels");
    assert.match(tablet.reason, /no tablet frame was captured.*interpolated/s);
  });

  // 5 ── an unrecognizable multi-mode axis is a brand axis, and brand axes stop
  //      the run until an override picks one mode.
  const brandCapture: Partial<NormalizedCapture> = {
    collections: [
      fontCollection(),
      {
        id: "c3",
        name: "Theme",
        defaultModeId: "m0",
        axis: "brand",
        axisReason: "no mode names a theme or a breakpoint (Acme, Globex)",
        modes: [
          { id: "m0", name: "Acme", variables: [] },
          { id: "m1", name: "Globex", variables: [] },
        ],
      },
    ],
  };
  expectFailure(
    "an ambiguous brand axis fails until an override resolves it",
    () => run(brandCapture),
    /brand axis with 2 modes.*One design system per brand mode/s,
  );
  check("naming the brand mode in modeMap lets the run proceed", () => {
    const { document } = run(brandCapture, {
      ...NO_OVERRIDES,
      modeMap: { Theme: "Acme" },
    });
    assert.ok(document.themes.light["--bg"] !== undefined);
  });
  expectFailure(
    "modeMap naming a mode the collection does not declare fails",
    () => run(brandCapture, { ...NO_OVERRIDES, modeMap: { Theme: "Initech" } }),
    /names mode "Initech", which the collection does not declare/,
  );

  // 6 ── a missing A1 slot fails loudly and names every one of them.
  expectFailure(
    "missing mandatory slots fail with the full list",
    () =>
      run({
        collections: [],
        paintStyles: [],
        frames: [],
      }),
    /no captured frame could be measured/,
  );
  check("every mandatory slot is resolved on a complete capture", () => {
    const { document } = run({ collections: [fontCollection()] });
    const missing = mandatory.filter(
      (slot) => document.themes.light[slot] === undefined,
    );
    assert.deepEqual(missing, [], `unresolved mandatory slots: ${missing.join(", ")}`);
  });
  check("A2 and B slots with no evidence are omitted for the emitter", () => {
    const { document, report } = run({ collections: [fontCollection()] });
    for (const slot of ["--space-4", "--radius-md", "--motion-fast", "--elev-raised"]) {
      assert.equal(
        document.themes.light[slot],
        undefined,
        `${slot} must be omitted so the emitter applies its schema fallback`,
      );
      assert.ok(report.omittedOptionalSlots.includes(slot));
    }
  });

  // 7 ── overrides pre-empt everything and say what they pre-empted.
  check("an override wins and records the stage it displaced", () => {
    const { document, report } = run(
      { collections: [fontCollection()] },
      {
        ...NO_OVERRIDES,
        slots: {
          "--accent": "#ff0000",
          "--border": { value: "#00ff00", reason: "brand book, not in the file" },
        },
      },
    );
    assert.equal(document.themes.light["--accent"].value, "#ff0000");
    assert.equal(document.themes.light["--border"].value, "#00ff00");
    assert.equal(document.themes.light["--border"].reason, "brand book, not in the file");
    const accent = report.resolutions.find((entry) => entry.slot === "--accent");
    assert.equal(accent?.stage, "override");
    assert.equal(
      accent?.preemptedStage,
      "role-map",
      "the displaced stage is recorded so a stale override is visible",
    );
  });
  expectFailure(
    "an override for a slot outside TOKEN_SCHEMA fails",
    () =>
      run(
        { collections: [fontCollection()] },
        { ...NO_OVERRIDES, slots: { "--not-a-slot": "#000000" } },
      ),
    /is not a slot in the loaded TOKEN_SCHEMA/,
  );

  // 8 ── a partial capture is rejected at the adapter boundary.
  expectFailure(
    "a capture missing get_variables is rejected",
    () => normalizeCaptureBundle(bundle({ omit: "variables" })),
    /missing its get_variables payload/,
  );
  expectFailure(
    "a capture missing get_styles is rejected",
    () => normalizeCaptureBundle(bundle({ omit: "styles" })),
    /missing its get_styles payload/,
  );

  // 9 ── determinism: same inputs, byte-identical artifact.
  check("identical inputs produce a byte-identical artifact", () => {
    const first = run({ collections: [fontCollection()] });
    const second = run({ collections: [fontCollection()] });
    assert.equal(
      JSON.stringify(first.document),
      JSON.stringify(second.document),
      "the transform must not depend on a clock or on iteration order",
    );
    assert.equal(
      JSON.stringify(first.document).includes("generatedAt"),
      false,
      "no run-time field unless --stamp asks for one",
    );
    const stamped = extractTokens({
      capture: capture({ collections: [fontCollection()] }),
      overrides: NO_OVERRIDES,
      schema,
      stamp: "2026-01-02T03:04:05Z",
    });
    assert.equal(
      (stamped.document.extraction as Record<string, unknown>).generatedAt,
      "2026-01-02T03:04:05Z",
    );
  });

  // 10 ── the type ramp is projected, not copied, and interpolation is honest.
  check("the type ramp projects onto the schema's rungs", () => {
    const sparse = capture({ collections: [fontCollection()] });
    for (const item of sparse.frames) {
      item.root.children = item.root.children.map((section) => ({
        ...section,
        children: section.children.map((content) => ({
          ...content,
          children: [text(`${content.id}-only`, 16, content.y)],
        })),
      }));
    }
    const { document } = extractTokens({
      capture: sparse,
      overrides: NO_OVERRIDES,
      schema,
    });
    const rungs = schema
      .filter((spec) => /^--text-/.test(spec.name) && spec.layer === "A1-structure")
      .map((spec) => spec.name);
    for (const rung of rungs) {
      assert.ok(document.themes.light[rung] !== undefined, `${rung} must be filled`);
      assert.equal(document.themes.light[rung].confidence, "derived");
    }
    assert.equal(document.themes.light["--text-base"].value, "16px");
    const fanned = document.themes.light["--text-4xl"];
    assert.match(
      fanned.reason,
      /interpolated|fanned out/,
      "a rung with no measured size must say it was interpolated",
    );
  });

  // 11 ── the schema is authority: an unknown mandatory responsive slot stops us.
  expectFailure(
    "a responsive slot this extractor cannot measure fails loudly",
    () =>
      extractTokens({
        capture: capture({ collections: [fontCollection()] }),
        overrides: NO_OVERRIDES,
        schema: [
          ...schema,
          {
            name: "--section-y-ultrawide",
            layer: "A1-structure",
            description: "hypothetical future breakpoint",
          } satisfies TokenSpec,
        ],
      }),
    /cannot measure: --section-y-ultrawide/,
  );

  console.log(`\n${passed} checks passed.`);
}

main().catch((error: unknown) => {
  if (error instanceof ExtractionError || error instanceof NormalizeError) {
    console.error(`\n✗ ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
