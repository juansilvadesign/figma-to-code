#!/usr/bin/env -S node --import tsx

/**
 * Fail-closed capture preflight.
 *
 * R1.2 forbids the first document read until the connected runtime is proven to
 * be the pinned one. This verifies fork commit, package version, server bundle
 * hash, plugin identity and hashes, local relay reachability, the required MCP
 * read-tool inventory, and the canonical capability fingerprint.
 *
 * It talks to the MCP server only via `initialize` + `tools/list`, which is pure
 * schema introspection: no Figma document is read and no channel is joined.
 *
 *   npm run check:r1:preflight
 *   npm run check:r1:preflight -- --json
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type CapabilityRecord,
  PINNED_FORK,
  REQUIRED_READ_CAPABILITIES,
  computeCapabilityFingerprint,
  computeJsonSha256,
  sha256,
} from "./lib/capture-contract.js";
import type { JsonValue } from "./lib/fork-payload-contracts.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_FORK_ROOT = path.resolve(PROJECT_ROOT, "..", "talk-to-figma-fork");
const DEFAULT_RELAY_PORT = 3055;
const TOOL_LIST_TIMEOUT_MS = 30_000;

type CheckStatus = "pass" | "fail";

type CheckResult = {
  name: string;
  status: CheckStatus;
  expected?: string;
  observed?: string;
  detail?: string;
};

type McpTool = {
  name: string;
  inputSchema: JsonValue;
};

type PreflightReport = {
  forkRoot: string;
  relayPort: number;
  checks: CheckResult[];
  capabilityFingerprint?: {
    algorithm: "sha256";
    scope: "required-read-tools";
    value: string;
    tools: CapabilityRecord[];
  };
  ok: boolean;
};

function parseArgs(argv: readonly string[]): {
  forkRoot: string;
  relayPort: number;
  json: boolean;
} {
  let forkRoot = DEFAULT_FORK_ROOT;
  let relayPort = DEFAULT_RELAY_PORT;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fork-root") {
      const next = argv[index + 1];
      if (!next) throw new Error("--fork-root requires a path");
      forkRoot = path.resolve(next);
      index += 1;
    } else if (arg === "--relay-port") {
      const next = argv[index + 1];
      if (!next) throw new Error("--relay-port requires a number");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`--relay-port must be a positive integer, got ${next}`);
      }
      relayPort = parsed;
      index += 1;
    } else if (arg === "--json") {
      json = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { forkRoot, relayPort, json };
}

function compare(
  name: string,
  expected: string,
  observed: string,
  detail?: string,
): CheckResult {
  return expected === observed
    ? { name, status: "pass", expected, observed, detail }
    : { name, status: "fail", expected, observed, detail };
}

async function runGit(
  forkRoot: string,
  args: readonly string[],
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", forkRoot, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `git ${args.join(" ")} failed`));
    });
  });
}

async function hashFile(filePath: string): Promise<string> {
  return sha256(await readFile(filePath));
}

async function relayReachable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const settle = (value: boolean): void => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(2_000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/** Spawn the pinned server bundle and read its advertised tool schemas. */
async function listTools(serverPath: string): Promise<McpTool[]> {
  const child = spawn("bun", ["run", serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, (message: JsonValue) => void>();
  let buffer = "";
  let nextId = 1;

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let parsed: JsonValue;
      try {
        parsed = JSON.parse(line) as JsonValue;
      } catch {
        continue;
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      const id = parsed.id;
      if (typeof id === "number") {
        const resolver = pending.get(id);
        if (resolver) {
          pending.delete(id);
          resolver(parsed);
        }
      }
    }
  });

  const request = async (
    method: string,
    params: JsonValue,
  ): Promise<JsonValue> => {
    const id = nextId;
    nextId += 1;
    return await new Promise<JsonValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${TOOL_LIST_TIMEOUT_MS}ms`));
      }, TOOL_LIST_TIMEOUT_MS);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (
          message !== null &&
          typeof message === "object" &&
          !Array.isArray(message) &&
          "error" in message
        ) {
          reject(new Error(`MCP ${method} error: ${JSON.stringify(message.error)}`));
          return;
        }
        resolve(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  try {
    await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "figma-to-code-preflight", version: "0.0.0" },
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
    );
    const response = await request("tools/list", {});
    if (
      response === null ||
      typeof response !== "object" ||
      Array.isArray(response) ||
      !("result" in response)
    ) {
      throw new Error("tools/list returned no result");
    }
    const result = response.result;
    if (
      result === null ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      !Array.isArray(result.tools)
    ) {
      throw new Error("tools/list result has no tools array");
    }
    const tools: McpTool[] = [];
    for (const entry of result.tools) {
      if (
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof entry.name === "string" &&
        "inputSchema" in entry
      ) {
        tools.push({ name: entry.name, inputSchema: entry.inputSchema });
      }
    }
    return tools;
  } finally {
    child.kill();
  }
}

async function preflight(
  forkRoot: string,
  relayPort: number,
): Promise<PreflightReport> {
  const checks: CheckResult[] = [];
  const serverPath = path.join(forkRoot, "dist", "server.js");
  const pluginDir = path.join(forkRoot, "src", "cursor_mcp_plugin");
  const pluginManifestPath = path.join(pluginDir, "manifest.json");
  const pluginCodePath = path.join(pluginDir, "code.js");

  checks.push(
    compare(
      "fork commit",
      PINNED_FORK.commit,
      await runGit(forkRoot, ["rev-parse", "HEAD"]),
    ),
  );

  const forkPackage = JSON.parse(
    await readFile(path.join(forkRoot, "package.json"), "utf8"),
  ) as { version?: unknown };
  checks.push(
    compare(
      "package version",
      PINNED_FORK.packageVersion,
      typeof forkPackage.version === "string" ? forkPackage.version : "<missing>",
    ),
  );

  checks.push(
    compare(
      "dist/server.js sha256",
      PINNED_FORK.serverBundleSha256,
      await hashFile(serverPath),
    ),
  );

  const pluginManifestRaw = await readFile(pluginManifestPath, "utf8");
  const pluginManifest = JSON.parse(pluginManifestRaw) as Record<string, unknown>;
  const pluginField = (key: string): string =>
    typeof pluginManifest[key] === "string"
      ? (pluginManifest[key] as string)
      : "<missing>";

  checks.push(compare("plugin name", PINNED_FORK.plugin.name, pluginField("name")));
  checks.push(compare("plugin id", PINNED_FORK.plugin.id, pluginField("id")));
  checks.push(compare("plugin api", PINNED_FORK.plugin.api, pluginField("api")));
  checks.push(
    compare(
      "plugin documentAccess",
      PINNED_FORK.plugin.documentAccess,
      pluginField("documentAccess"),
    ),
  );
  checks.push(
    compare(
      "plugin manifest sha256",
      PINNED_FORK.plugin.manifestSha256,
      await hashFile(pluginManifestPath),
    ),
  );
  checks.push(
    compare(
      "plugin code.js sha256",
      PINNED_FORK.plugin.codeSha256,
      await hashFile(pluginCodePath),
    ),
  );

  const relayUp = await relayReachable(relayPort);
  checks.push({
    name: "local relay",
    status: relayUp ? "pass" : "fail",
    expected: `listening on 127.0.0.1:${relayPort}`,
    observed: relayUp ? "listening" : "unreachable",
    detail: relayUp
      ? undefined
      : "Start the fork's socket relay (bun run src/socket.ts) before capturing.",
  });

  let fingerprint: PreflightReport["capabilityFingerprint"];
  try {
    const tools = await listTools(serverPath);
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const missing = REQUIRED_READ_CAPABILITIES.filter(
      (name) => !byName.has(name),
    );
    checks.push({
      name: "required read tools",
      status: missing.length === 0 ? "pass" : "fail",
      expected: `${REQUIRED_READ_CAPABILITIES.length} required`,
      observed: `${REQUIRED_READ_CAPABILITIES.length - missing.length}/${REQUIRED_READ_CAPABILITIES.length} of ${tools.length} advertised`,
      detail: missing.length === 0 ? undefined : `missing: ${missing.join(", ")}`,
    });

    if (missing.length === 0) {
      const records: CapabilityRecord[] = REQUIRED_READ_CAPABILITIES.map(
        (name) => {
          const tool = byName.get(name);
          if (!tool) throw new Error(`unreachable: ${name} vanished`);
          return {
            name,
            inputSchemaSha256: computeJsonSha256(tool.inputSchema),
          };
        },
      );
      fingerprint = {
        algorithm: "sha256",
        scope: "required-read-tools",
        value: computeCapabilityFingerprint(records),
        tools: [...records].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      };
      checks.push({
        name: "capability fingerprint",
        status: "pass",
        observed: fingerprint.value,
        detail: "Copy into runtime.capabilityFingerprint of the capture manifest.",
      });
    }
  } catch (error) {
    checks.push({
      name: "required read tools",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    forkRoot,
    relayPort,
    checks,
    capabilityFingerprint: fingerprint,
    ok: checks.every((check) => check.status === "pass"),
  };
}

function short(value: string | undefined): string {
  if (!value) return "";
  return value.length > 44 ? `${value.slice(0, 10)}…` : value;
}

function printHuman(report: PreflightReport): void {
  console.log(`fork root  ${report.forkRoot}`);
  console.log(`relay port ${report.relayPort}\n`);
  for (const check of report.checks) {
    const mark = check.status === "pass" ? "✔" : "✘";
    console.log(`${mark} ${check.name.padEnd(24)} ${short(check.observed)}`);
    if (check.status === "fail" && check.expected !== undefined) {
      console.log(`  expected ${short(check.expected)}`);
    }
    if (check.detail) console.log(`  ${check.detail}`);
  }
  console.log(`\n${report.ok ? "PREFLIGHT PASS" : "PREFLIGHT FAIL"}`);
}

async function main(): Promise<void> {
  const { forkRoot, relayPort, json } = parseArgs(process.argv.slice(2));
  const report = await preflight(forkRoot, relayPort);
  if (json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (!report.ok) process.exitCode = 1;
}

await main();
