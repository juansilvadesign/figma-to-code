#!/usr/bin/env -S npx tsx
/**
 * extract-figma-tokens.ts — capture bundle → tokens.source.json
 *
 * The only substantially new code in this project. Everything downstream (emit +
 * validate) is vendored from ai-website-cloner-template and already works,
 * because `tokens.source.json` is a shared, source-agnostic contract.
 *
 * This script never calls the Figma MCP. `npm run capture` produces the bundle;
 * this is a pure, offline, deterministic transform over it:
 *
 *   loadCaptureBundle  → hashed evidence, validated, never rewritten
 *   normalizeCaptureBundle → the fork-adapter boundary
 *   extractTokens      → schema-driven resolution + the mandatory-slot gate
 *
 * Usage:
 *   npx tsx scripts/extract-figma-tokens.ts --capture docs/research/<slug>/capture-manifest.json
 *     [--brand <slug>]            # defaults to the capture manifest's brand
 *     [--out design-systems/<slug>/source/tokens.source.json]
 *     [--report design-systems/<slug>/source/extraction-report.json]
 *     [--name "<Display Name>"]
 *     [--od-root ../../../skills/open-design]
 *     [--stamp <iso8601>]         # the ONLY non-deterministic field, opt-in
 *     [--dry-run]                 # resolve and report, write nothing
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CaptureContractError, loadCaptureBundle } from "./lib/capture-contract.js";
import {
  ExtractionError,
  type TokenSpec,
  extractTokens,
} from "./lib/extract-tokens.js";
import { NormalizeError, normalizeCaptureBundle } from "./lib/figma-normalize.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function loadTokenSchema(odRoot: string): Promise<readonly TokenSpec[]> {
  const module = (await import(
    pathToFileURL(
      path.join(odRoot, "packages/contracts/src/design-systems/token-schema.ts"),
    ).href
  )) as { TOKEN_SCHEMA?: readonly TokenSpec[] };
  if (!Array.isArray(module.TOKEN_SCHEMA) || module.TOKEN_SCHEMA.length === 0) {
    throw new Error(
      `open-design at ${odRoot} exported no TOKEN_SCHEMA — check --od-root`,
    );
  }
  return module.TOKEN_SCHEMA;
}

async function main(): Promise<void> {
  const capturePath = arg("capture");
  if (capturePath === undefined) {
    console.error(
      "extract-figma-tokens: --capture <docs/research/<slug>/capture-manifest.json> is required.",
    );
    process.exit(1);
  }
  const odRoot = path.resolve(
    SCRIPT_DIR,
    arg("od-root") ?? process.env.OPEN_DESIGN_ROOT ?? "../../../skills/open-design",
  );

  const bundle = await loadCaptureBundle(path.resolve(PROJECT_ROOT, capturePath));
  const brand = arg("brand") ?? bundle.manifest.brand;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brand)) {
    console.error(`extract-figma-tokens: --brand must be lowercase-kebab, got ${brand}`);
    process.exit(1);
  }

  const schema = await loadTokenSchema(odRoot);
  const capture = normalizeCaptureBundle(bundle);
  const { document, report } = extractTokens({
    capture,
    overrides: bundle.overrides,
    schema,
    name: arg("name"),
    stamp: arg("stamp"),
  });

  const outPath = path.resolve(
    PROJECT_ROOT,
    arg("out") ?? `design-systems/${brand}/source/tokens.source.json`,
  );
  const reportPath = path.resolve(
    PROJECT_ROOT,
    arg("report") ?? `design-systems/${brand}/source/extraction-report.json`,
  );

  const mandatory = schema.filter(
    (spec) => spec.layer === "A1-identity" || spec.layer === "A1-structure",
  );
  const mandatoryResolved = mandatory.filter(
    (spec) => document.themes.light[spec.name] !== undefined,
  ).length;
  const high = Object.values(document.themes.light).filter(
    (binding) => binding.confidence === "high",
  ).length;
  const total = Object.keys(document.themes.light).length;

  console.log(`brand              ${brand}`);
  console.log(`capture            ${capture.captureId} (${capture.capturedAt})`);
  console.log(`document           ${capture.source.documentName}`);
  console.log(
    `A1 coverage        ${mandatoryResolved}/${mandatory.length} mandatory slots resolved`,
  );
  console.log(
    `confidence         ${high} high / ${total - high} derived of ${total} authored slots`,
  );
  console.log(
    `omitted (A2/B)     ${report.omittedOptionalSlots.length} → emitter fallback/alias`,
  );
  console.log(
    `stages             ${Object.entries(report.resolvedByStage)
      .filter(([, count]) => count > 0)
      .map(([stage, count]) => `${stage}=${count}`)
      .join(" ")}`,
  );
  for (const limitation of report.limitations) console.log(`  ⚠ ${limitation}`);

  if (flag("dry-run")) {
    console.log("\n--dry-run: nothing written.");
    return;
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nwrote ${path.relative(PROJECT_ROOT, outPath)}`);
  console.log(`wrote ${path.relative(PROJECT_ROOT, reportPath)}`);
  // These artifacts quote the source file's node ids and internal style names,
  // so they are exactly as private as the capture they came from.
  if (capture.authorization.commitPolicy === "private-local") {
    console.log(
      `\n🔒 the capture is commitPolicy=private-local${
        capture.authorization.containsPrivateContent ? " and declares private content" : ""
      } —\n` +
        `   these derived files inherit that. Keep design-systems/${brand}/ out of git.`,
    );
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    if (
      error instanceof ExtractionError ||
      error instanceof CaptureContractError ||
      error instanceof NormalizeError
    ) {
      console.error(`\n✗ ${error.message}`);
      process.exit(1);
    }
    throw error;
  });
}
