#!/usr/bin/env -S npx tsx
/**
 * R0 acceptance checks for the emitter and validator failure paths.
 *
 * The tracked PsiAtiva compatibility fixture remains immutable. Each check runs
 * against an isolated temporary copy and removes it before exiting.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const OD_ROOT = path.resolve(SCRIPT_DIR, "../../../skills/open-design");
const FIXTURE_ROOT = path.join(PROJECT_ROOT, "design-systems", "psiativa");
const EMITTER = path.join(SCRIPT_DIR, "emit-design-system.ts");
const VALIDATOR = path.join(SCRIPT_DIR, "validate-design-system.ts");
const UNDECLARED_TOKEN = "--r0-undeclared-token";

type TokenSpec = {
  name: string;
  layer: string;
};

type SourceDoc = {
  themes: {
    light: Record<string, unknown>;
  };
};

type RunResult = {
  code: number;
  output: string;
};

function runTs(script: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, output });
    });
  });
}

function requireFailure(result: RunResult, check: string, expected: string): void {
  if (result.code === 0) {
    throw new Error(`${check}: expected a non-zero exit code.\n${result.output}`);
  }
  if (!result.output.includes(expected)) {
    throw new Error(`${check}: failure did not name ${expected}.\n${result.output}`);
  }
}

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "figma-to-code-r0-"));

  try {
    const source = JSON.parse(
      await readFile(path.join(FIXTURE_ROOT, "source", "tokens.source.json"), "utf8"),
    ) as SourceDoc;
    const { TOKEN_SCHEMA } = (await import(
      pathToFileURL(
        path.join(OD_ROOT, "packages/contracts/src/design-systems/token-schema.ts"),
      ).href
    )) as { TOKEN_SCHEMA: readonly TokenSpec[] };
    const required = TOKEN_SCHEMA.find(
      (token) => token.layer.startsWith("A1") && token.name in source.themes.light,
    );
    if (!required) {
      throw new Error("missing-A1 setup: no authored A1 token exists in the fixture.");
    }

    delete source.themes.light[required.name];
    const missingSource = path.join(tempRoot, "missing-a1.tokens.source.json");
    await writeFile(missingSource, `${JSON.stringify(source, null, 2)}\n`, "utf8");
    const missingResult = await runTs(EMITTER, [
      "--brand",
      "r0-missing-a1",
      "--source",
      missingSource,
      "--out",
      path.join(tempRoot, "missing-a1-output"),
      "--od-root",
      OD_ROOT,
    ]);
    requireFailure(missingResult, "missing-A1 check", required.name);
    console.log(`✅ Missing A1 rejected with token name: ${required.name}`);

    const undeclaredRoot = path.join(tempRoot, "undeclared-component-token");
    await cp(FIXTURE_ROOT, undeclaredRoot, { recursive: true });
    const componentsPath = path.join(undeclaredRoot, "components.html");
    const components = await readFile(componentsPath, "utf8");
    await writeFile(
      componentsPath,
      `${components}\n<style>.r0-invalid { color: var(${UNDECLARED_TOKEN}); }</style>\n`,
      "utf8",
    );

    const emitResult = await runTs(EMITTER, [
      "--brand",
      "psiativa",
      "--source",
      path.join(undeclaredRoot, "source", "tokens.source.json"),
      "--out",
      undeclaredRoot,
      "--od-root",
      OD_ROOT,
      "--name",
      "PsiAtiva",
    ]);
    if (emitResult.code !== 0) {
      throw new Error(`undeclared-token setup: emitter failed.\n${emitResult.output}`);
    }

    const validationResult = await runTs(VALIDATOR, [
      "--brand",
      "psiativa",
      "--out",
      undeclaredRoot,
      "--od-root",
      OD_ROOT,
    ]);
    requireFailure(
      validationResult,
      "undeclared-component-token check",
      UNDECLARED_TOKEN,
    );
    console.log(
      `✅ Undeclared components.html token rejected with token name: ${UNDECLARED_TOKEN}`,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
