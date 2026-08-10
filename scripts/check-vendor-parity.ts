#!/usr/bin/env -S node --import tsx

/**
 * Vendor parity check — make the pinned-sibling-reuse claim executable.
 *
 * The cross-cutting checklist promises that "every vendored file or workflow
 * cites the source commit and has a parity check". R0 honored the first half in
 * code and the second half only in prose: a SHA-256 table typed into a build
 * note, which nothing re-runs. This closes that gap for every vendored file at
 * once, including R0's two scripts.
 *
 * Per file the manifest records the provenance block's line range, the local
 * hash, and the hash after that block is removed. Removing exactly those lines
 * must reproduce the baseline bytes for any file whose delta is "none", so a
 * hand-edit to a vendored file cannot pass silently.
 *
 * Fully offline by design — no sibling checkout, no network. The baseline commit
 * is immutable, so its hashes are facts that can simply be recorded.
 *
 *   npm run check:vendor
 *   npm run check:vendor -- --json
 *   npm run check:vendor -- --update   # after a deliberate re-vendor
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sha256 } from "./lib/capture-contract.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const MANIFEST_PATH = path.resolve(PROJECT_ROOT, "vendor.manifest.json");

type CheckStatus = "pass" | "fail";

export type ParityCheck = {
  name: string;
  status: CheckStatus;
  expected?: string;
  observed?: string;
  detail?: string;
};

type VendoredFile = {
  path: string;
  baselinePath: string;
  vendoredOn: string;
  release: string;
  provenanceLines: [number, number];
  baselineSha256: string;
  localSha256: string;
  strippedSha256: string;
  matchesBaseline: boolean;
  delta: string;
};

type VendorManifest = {
  baseline: { repository: string; commit: string; version: string };
  provenanceMarker: string;
  files: VendoredFile[];
};

export type ParityReport = {
  baselineCommit: string;
  fileCount: number;
  checks: ParityCheck[];
  ok: boolean;
};

/**
 * Remove an inclusive, 1-indexed line range. Splitting on "\n" and rejoining is
 * lossless for the trailing newline, so the result is byte-comparable with the
 * baseline blob.
 */
export function stripLines(content: string, from: number, to: number): string {
  const lines = content.split("\n");
  return [...lines.slice(0, from - 1), ...lines.slice(to)].join("\n");
}

function hashText(text: string): string {
  return sha256(Buffer.from(text, "utf8"));
}

function checkFile(entry: VendoredFile, content: string, marker: string, commit: string): ParityCheck[] {
  const checks: ParityCheck[] = [];
  const [from, to] = entry.provenanceLines;
  const block = content.split("\n").slice(from - 1, to).join("\n");

  checks.push(
    block.includes(marker)
      ? { name: `${entry.path} · provenance block`, status: "pass", observed: `lines ${from}-${to}` }
      : {
          name: `${entry.path} · provenance block`,
          status: "fail",
          expected: `the marker inside lines ${from}-${to}`,
          observed: "marker not found",
          detail: "The provenance block moved, shrank, or was deleted.",
        },
  );

  if (!block.includes(commit)) {
    checks.push({
      name: `${entry.path} · cited commit`,
      status: "fail",
      expected: commit,
      observed: "absent from the provenance block",
    });
  }

  const localSha = hashText(content);
  checks.push(
    localSha === entry.localSha256
      ? { name: `${entry.path} · local hash`, status: "pass", observed: localSha }
      : {
          name: `${entry.path} · local hash`,
          status: "fail",
          expected: entry.localSha256,
          observed: localSha,
          detail: "The file changed since it was vendored. Re-run with --update if that was deliberate.",
        },
  );

  const strippedSha = hashText(stripLines(content, from, to));
  checks.push(
    strippedSha === entry.strippedSha256
      ? { name: `${entry.path} · stripped hash`, status: "pass", observed: strippedSha }
      : {
          name: `${entry.path} · stripped hash`,
          status: "fail",
          expected: entry.strippedSha256,
          observed: strippedSha,
        },
  );

  // The load-bearing assertion: a file claiming no functional delta must still
  // reproduce the baseline byte-for-byte once its provenance block is removed.
  if (entry.matchesBaseline) {
    checks.push(
      strippedSha === entry.baselineSha256
        ? { name: `${entry.path} · baseline parity`, status: "pass", observed: "byte-identical" }
        : {
            name: `${entry.path} · baseline parity`,
            status: "fail",
            expected: entry.baselineSha256,
            observed: strippedSha,
            detail: 'Declared matchesBaseline=true but the stripped bytes differ. Fix the file or record the delta.',
          },
    );
  } else if (strippedSha === entry.baselineSha256) {
    checks.push({
      name: `${entry.path} · baseline parity`,
      status: "fail",
      expected: "a real delta",
      observed: "byte-identical to the baseline",
      detail: "Declared matchesBaseline=false but nothing differs. Set it to true.",
    });
  }

  return checks;
}

export async function checkVendorParity(manifestPath = MANIFEST_PATH): Promise<ParityReport> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as VendorManifest;
  const checks: ParityCheck[] = [];

  for (const entry of manifest.files) {
    const absolute = path.resolve(PROJECT_ROOT, entry.path);
    let content: string;
    try {
      content = await readFile(absolute, "utf8");
    } catch {
      checks.push({
        name: `${entry.path} · present`,
        status: "fail",
        expected: "a vendored file",
        observed: "missing",
      });
      continue;
    }
    checks.push(...checkFile(entry, content, manifest.provenanceMarker, manifest.baseline.commit));
  }

  return {
    baselineCommit: manifest.baseline.commit,
    fileCount: manifest.files.length,
    checks,
    ok: checks.every((check) => check.status === "pass"),
  };
}

/** Rewrite the recorded hashes from what is on disk, after a deliberate re-vendor. */
async function updateManifest(manifestPath = MANIFEST_PATH): Promise<void> {
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as VendorManifest;
  let changed = 0;

  for (const entry of manifest.files) {
    const content = await readFile(path.resolve(PROJECT_ROOT, entry.path), "utf8");
    const [from, to] = entry.provenanceLines;
    const localSha = hashText(content);
    const strippedSha = hashText(stripLines(content, from, to));
    if (localSha !== entry.localSha256 || strippedSha !== entry.strippedSha256) {
      console.log(`updated ${entry.path}`);
      console.log(`  local    ${entry.localSha256} → ${localSha}`);
      console.log(`  stripped ${entry.strippedSha256} → ${strippedSha}`);
      if (entry.matchesBaseline && strippedSha !== entry.baselineSha256) {
        console.log("  ⚠ this file no longer matches the baseline — set matchesBaseline=false and record the delta");
      }
      entry.localSha256 = localSha;
      entry.strippedSha256 = strippedSha;
      changed += 1;
    }
  }

  if (changed === 0) {
    console.log("no hash changes; manifest left untouched");
    return;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`\n${changed} entr${changed === 1 ? "y" : "ies"} rewritten. Review the delta text before committing.`);
}

function printHuman(report: ParityReport): void {
  console.log(`baseline ${report.baselineCommit}`);
  console.log(`files    ${report.fileCount}\n`);
  for (const check of report.checks) {
    const mark = check.status === "pass" ? "✔" : "✘";
    console.log(`${mark} ${check.name}`);
    if (check.status === "fail") {
      if (check.expected !== undefined) console.log(`  expected ${check.expected}`);
      if (check.observed !== undefined) console.log(`  observed ${check.observed}`);
      if (check.detail) console.log(`  ${check.detail}`);
    }
  }
  const failed = report.checks.filter((check) => check.status === "fail").length;
  console.log(`\n${report.ok ? `VENDOR PARITY PASS (${report.checks.length} checks)` : `VENDOR PARITY FAIL (${failed} of ${report.checks.length} checks)`}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--update")) {
    await updateManifest();
    return;
  }
  const report = await checkVendorParity();
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
