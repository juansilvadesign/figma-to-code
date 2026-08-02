/**
 * Read-only Figma capture client.
 *
 * Speaks MCP to the pinned fork's own `dist/server.js` over stdio and writes
 * every reply to disk exactly as received. This is the *raw-reply* client the
 * capture contract needs: an agent harness that renders image content blocks
 * can never preserve `export_node_as_image`'s base64 envelope, so screenshots
 * could not be captured honestly through one.
 *
 * The fork is invoked only through its MCP interface. Nothing from its `src/`,
 * plugin, or bundled modules is imported here.
 *
 * Usage:
 *   npm run capture -- --channel <name> --brand <slug> --out docs/research/<slug> \
 *     --page <pageId> \
 *     --node <nodeId>=desktop-frame,interactive-root,token-measurement \
 *     --node <nodeId>=mobile-frame,token-measurement
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type CaptureArtifact,
  type CaptureManifest,
  type CapturePurpose,
  type CoverageRecord,
  type CoverageScope,
  type SelectedNode,
  PINNED_FORK,
  REQUIRED_READ_CAPABILITIES,
  computeCapabilityFingerprint,
  computeJsonSha256,
  loadCaptureBundle,
  sanitizeNodeId,
  sha256,
} from "./lib/capture-contract.js";
import type { JsonObject, JsonValue } from "./lib/fork-payload-contracts.js";
import { DEFAULT_FORK_ROOT, preflight } from "./preflight-capture.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const CALL_TIMEOUT_MS = 600_000;
const DEFAULT_RELAY_PORT = 3055;
const CAPTURE_PURPOSES = [
  "desktop-frame",
  "mobile-frame",
  "interactive-root",
  "token-measurement",
] as const;

type NodeRequest = {
  id: string;
  purposes: CapturePurpose[];
};

type Options = {
  channel: string;
  brand: string;
  captureId: string;
  outDir: string;
  pageId: string;
  nodes: NodeRequest[];
  reactionNodeIds: string[];
  forkRoot: string;
  relayPort: number;
  capturedBy: string;
  basis: CaptureManifest["authorization"]["basis"];
  notes: string;
};

function parseArgs(argv: readonly string[]): Options {
  let channel = "";
  let brand = "";
  let captureId = "";
  let outDir = "";
  let pageId = "";
  const nodes: NodeRequest[] = [];
  const reactionNodeIds: string[] = [];
  let forkRoot = DEFAULT_FORK_ROOT;
  let relayPort = DEFAULT_RELAY_PORT;
  let capturedBy = "";
  let basis: CaptureManifest["authorization"]["basis"] = "owned";
  let notes = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--channel":
        channel = next();
        break;
      case "--brand":
        brand = next();
        break;
      case "--capture-id":
        captureId = next();
        break;
      case "--out":
        outDir = next();
        break;
      case "--page":
        pageId = next();
        break;
      case "--node": {
        const [id, purposeList] = next().split("=");
        if (!id || !purposeList) {
          throw new Error("--node expects <nodeId>=<purpose,purpose>");
        }
        const purposes = purposeList.split(",").map((purpose) => {
          if (!(CAPTURE_PURPOSES as readonly string[]).includes(purpose)) {
            throw new Error(
              `unknown purpose ${purpose}; expected one of ${CAPTURE_PURPOSES.join(", ")}`,
            );
          }
          return purpose as CapturePurpose;
        });
        nodes.push({ id, purposes });
        break;
      }
      case "--reactions":
        reactionNodeIds.push(...next().split(","));
        break;
      case "--fork-root":
        forkRoot = path.resolve(next());
        break;
      case "--relay-port":
        relayPort = Number.parseInt(next(), 10);
        break;
      case "--captured-by":
        capturedBy = next();
        break;
      case "--basis":
        basis = next() as CaptureManifest["authorization"]["basis"];
        break;
      case "--notes":
        notes = next();
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!channel) throw new Error("--channel is required");
  if (!brand) throw new Error("--brand is required");
  if (!outDir) throw new Error("--out is required");
  if (!pageId) throw new Error("--page is required");
  if (nodes.length === 0) throw new Error("at least one --node is required");
  if (!capturedBy) throw new Error("--captured-by is required");

  return {
    channel,
    brand,
    captureId: captureId || brand,
    outDir: path.resolve(PROJECT_ROOT, outDir),
    pageId,
    nodes,
    reactionNodeIds,
    forkRoot,
    relayPort,
    capturedBy,
    basis,
    notes: notes || "Captured read-only through the pinned local fork.",
  };
}

/** A minimal MCP stdio client that hands back replies untouched. */
type McpClient = {
  listTools: () => Promise<{ name: string; inputSchema: JsonValue }[]>;
  /** The parsed JSON of a tool's text content block. */
  call: (name: string, args: JsonObject) => Promise<unknown>;
  /** The tool's raw first content block, unparsed. */
  callRaw: (name: string, args: JsonObject) => Promise<JsonObject>;
  close: () => void;
};

async function connect(
  serverPath: string,
  channel: string,
): Promise<McpClient> {
  const child: ChildProcessWithoutNullStreams = spawn("bun", ["run", serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, (message: JsonObject) => void>();
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      const message = parsed as JsonObject;
      if (typeof message.id === "number") {
        const resolver = pending.get(message.id);
        if (resolver) {
          pending.delete(message.id);
          resolver(message);
        }
      }
    }
  });

  const request = async (
    method: string,
    params: JsonValue,
  ): Promise<JsonObject> => {
    const id = nextId;
    nextId += 1;
    return await new Promise<JsonObject>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP ${method} timed out after ${CALL_TIMEOUT_MS}ms`));
      }, CALL_TIMEOUT_MS);
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error !== undefined) {
          reject(new Error(`MCP ${method} error: ${JSON.stringify(message.error)}`));
          return;
        }
        resolve(message);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "figma-to-code-capture", version: "0.0.0" },
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
  );

  const firstBlock = async (
    name: string,
    args: JsonObject,
  ): Promise<JsonObject> => {
    const response = await request("tools/call", { name, arguments: args });
    const result = response.result;
    if (
      result === null ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      !Array.isArray(result.content) ||
      result.content.length === 0
    ) {
      throw new Error(`${name}: reply carried no content block`);
    }
    const block = result.content[0];
    if (block === null || typeof block !== "object" || Array.isArray(block)) {
      throw new Error(`${name}: first content block is not an object`);
    }
    return block as JsonObject;
  };

  const joined = await firstBlock("join_channel", { channel });
  if (typeof joined.text !== "string" || !joined.text.includes("joined channel")) {
    throw new Error(`join_channel failed: ${JSON.stringify(joined)}`);
  }

  return {
    listTools: async () => {
      const response = await request("tools/list", {});
      const result = response.result as JsonObject;
      const tools = result.tools;
      if (!Array.isArray(tools)) throw new Error("tools/list has no tools array");
      return tools.flatMap((entry) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          return [];
        }
        const tool = entry as JsonObject;
        return typeof tool.name === "string" && tool.inputSchema !== undefined
          ? [{ name: tool.name, inputSchema: tool.inputSchema }]
          : [];
      });
    },
    call: async (name, args) => {
      const block = await firstBlock(name, args);
      if (typeof block.text !== "string") {
        throw new Error(`${name}: expected a text content block`);
      }
      // A fork-side failure arrives as prose in a text block, not a JSON-RPC
      // error, so an unparseable reply is a failed read — never evidence.
      try {
        return JSON.parse(block.text) as unknown;
      } catch {
        throw new Error(`${name}: reply is not JSON — ${block.text.slice(0, 200)}`);
      }
    },
    callRaw: firstBlock,
    close: () => child.kill(),
  };
}

type PendingArtifact = {
  artifact: Omit<CaptureArtifact, "sha256" | "bytes">;
  bytes: Buffer;
};

function jsonArtifact(
  artifact: Omit<CaptureArtifact, "sha256" | "bytes" | "mediaType">,
  value: unknown,
): PendingArtifact {
  return {
    artifact: { ...artifact, mediaType: "application/json" },
    bytes: Buffer.from(`${JSON.stringify(value)}\n`, "utf8"),
  };
}

function coverageOf(
  payload: unknown,
  scope: CoverageScope,
  fallbackComplete = true,
): CoverageRecord {
  const record =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as JsonObject)
      : {};
  const nested =
    record.coverage !== null &&
    typeof record.coverage === "object" &&
    !Array.isArray(record.coverage)
      ? (record.coverage as JsonObject)
      : undefined;
  const limitation = nested?.limitation;
  const limitations = Array.isArray(record.limitations)
    ? record.limitations.filter((entry): entry is string => typeof entry === "string")
    : typeof limitation === "string"
      ? [limitation]
      : [];
  return {
    scope,
    complete:
      typeof record.complete === "boolean" ? record.complete : fallbackComplete,
    supported: typeof record.supported === "boolean" ? record.supported : undefined,
    limitations,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Fail closed: never capture against an unverified runtime.
  const report = await preflight(options.forkRoot, options.relayPort);
  if (!report.ok || !report.capabilityFingerprint) {
    const failed = report.checks
      .filter((check) => check.status === "fail")
      .map((check) => `  - ${check.name}: ${check.detail ?? check.observed}`);
    throw new Error(`preflight failed:\n${failed.join("\n")}`);
  }
  console.log(`preflight ok — fingerprint ${report.capabilityFingerprint.value}`);

  const client = await connect(
    path.join(options.forkRoot, "dist", "server.js"),
    options.channel,
  );

  const pending: PendingArtifact[] = [];
  const screenshots: { artifact: PendingArtifact; nodeId: string }[] = [];
  const nodeNames = new Map<string, string>();
  let documentName = "";
  let documentId = "";

  try {
    const tools = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const records = REQUIRED_READ_CAPABILITIES.map((name) => {
      const tool = byName.get(name);
      if (!tool) throw new Error(`connected runtime is missing ${name}`);
      return { name, inputSchemaSha256: computeJsonSha256(tool.inputSchema) };
    });
    const liveFingerprint = computeCapabilityFingerprint(records);
    if (liveFingerprint !== report.capabilityFingerprint.value) {
      throw new Error(
        `connected runtime fingerprint ${liveFingerprint} does not match preflight ${report.capabilityFingerprint.value}`,
      );
    }

    const at = (): string => `${new Date().toISOString().slice(0, 19)}Z`;

    const pagesArgs = { includeChildCount: true };
    const pages = await client.call("get_pages", pagesArgs);
    const pagesRecord = pages as JsonObject;
    const documentRecord = pagesRecord.document as JsonObject;
    documentId = String(documentRecord.id);
    documentName = String(documentRecord.name);
    console.log(`document "${documentName}" (${documentId}), ${String(pagesRecord.pageCount)} pages`);
    if (!Array.isArray(pagesRecord.pages) ||
        !pagesRecord.pages.some(
          (page) =>
            page !== null &&
            typeof page === "object" &&
            !Array.isArray(page) &&
            (page as JsonObject).id === options.pageId,
        )) {
      throw new Error(
        `page ${options.pageId} is not in the connected document "${documentName}"`,
      );
    }
    pending.push(
      jsonArtifact(
        {
          id: "pages-all",
          role: "pages",
          path: "raw/pages.json",
          capturedAt: at(),
          toolCall: { name: "get_pages", arguments: pagesArgs },
          coverage: coverageOf(pages, "document"),
        },
        pages,
      ),
    );

    await client.call("set_current_page", { pageId: options.pageId });

    const documentArgs = { summary: true };
    const documentInfo = await client.call("get_document_info", documentArgs);
    pending.push(
      jsonArtifact(
        {
          id: `document-${sanitizeNodeId(options.pageId)}`,
          role: "document",
          path: "raw/document.json",
          capturedAt: at(),
          pageId: options.pageId,
          toolCall: { name: "get_document_info", arguments: documentArgs },
          coverage: coverageOf(documentInfo, "current-page"),
        },
        documentInfo,
      ),
    );

    const variables = await client.call("get_variables", {});
    pending.push(
      jsonArtifact(
        {
          id: "variables-doc",
          role: "variables",
          path: "raw/variables.json",
          capturedAt: at(),
          toolCall: { name: "get_variables", arguments: {} },
          coverage: coverageOf(variables, "document"),
        },
        variables,
      ),
    );

    const styles = await client.call("get_styles", {});
    pending.push(
      jsonArtifact(
        {
          id: "styles-doc",
          role: "styles",
          path: "raw/styles.json",
          capturedAt: at(),
          toolCall: { name: "get_styles", arguments: {} },
          coverage: coverageOf(styles, "document"),
        },
        styles,
      ),
    );

    const componentArgs = { summary: true };
    const components = await client.call("get_local_components", componentArgs);
    pending.push(
      jsonArtifact(
        {
          id: "components-local",
          role: "components",
          path: "raw/components.json",
          capturedAt: at(),
          toolCall: { name: "get_local_components", arguments: componentArgs },
          coverage: coverageOf(components, "document"),
        },
        components,
      ),
    );

    for (const node of options.nodes) {
      const safeId = sanitizeNodeId(node.id);

      const nodeArgs = { nodeId: node.id };
      const nodeInfo = await client.call("get_node_info", nodeArgs);
      const nodeName = (nodeInfo as JsonObject).name;
      if (typeof nodeName === "string") nodeNames.set(node.id, nodeName);
      pending.push(
        jsonArtifact(
          {
            id: `node-${safeId}`,
            role: "node",
            path: `raw/nodes/${safeId}.json`,
            capturedAt: at(),
            nodeId: node.id,
            pageId: options.pageId,
            toolCall: { name: "get_node_info", arguments: nodeArgs },
            coverage: coverageOf(nodeInfo, "node-subtree"),
          },
          nodeInfo,
        ),
      );

      const nodeVariables = await client.call("get_node_variables", nodeArgs);
      pending.push(
        jsonArtifact(
          {
            id: `node-variables-${safeId}`,
            role: "node-variables",
            path: `raw/node-variables/${safeId}.json`,
            capturedAt: at(),
            nodeId: node.id,
            pageId: options.pageId,
            toolCall: { name: "get_node_variables", arguments: nodeArgs },
            coverage: coverageOf(nodeVariables, "node-subtree"),
          },
          nodeVariables,
        ),
      );

      // The image block is the reply. It is stored verbatim so the decoded
      // screenshot can always be re-derived from, and checked against, it.
      const exportArgs = { nodeId: node.id, format: "PNG", scale: 1 };
      const exported = await client.callRaw("export_node_as_image", exportArgs);
      if (exported.type !== "image" || typeof exported.data !== "string") {
        throw new Error(
          `export_node_as_image ${node.id}: ${JSON.stringify(exported).slice(0, 200)}`,
        );
      }
      pending.push(
        jsonArtifact(
          {
            id: `image-export-${safeId}`,
            role: "image-export",
            path: `raw/exports/${safeId}.json`,
            capturedAt: at(),
            nodeId: node.id,
            pageId: options.pageId,
            toolCall: { name: "export_node_as_image", arguments: exportArgs },
            coverage: coverageOf(exported, "node-subtree"),
          },
          exported,
        ),
      );
      screenshots.push({
        nodeId: node.id,
        artifact: {
          artifact: {
            id: `screenshot-${safeId}`,
            role: "screenshot",
            path: `screenshots/${safeId}.png`,
            mediaType: "image/png",
            capturedAt: at(),
            nodeId: node.id,
            pageId: options.pageId,
            derivedFromArtifactId: `image-export-${safeId}`,
          },
          bytes: Buffer.from(exported.data, "base64"),
        },
      });
      console.log(`captured ${node.id} (${node.purposes.join(", ")})`);
    }

    const reactionTargets = [
      ...new Set([
        ...options.nodes
          .filter((node) => node.purposes.includes("interactive-root"))
          .map((node) => node.id),
        ...options.reactionNodeIds,
      ]),
    ];
    for (const nodeId of reactionTargets) {
      const safeId = sanitizeNodeId(nodeId);
      const reactionArgs = { nodeIds: [nodeId] };
      const reactions = await client.call("get_reactions", reactionArgs);
      pending.push(
        jsonArtifact(
          {
            id: `reactions-${safeId}`,
            role: "reactions",
            path: `raw/reactions/${safeId}.json`,
            capturedAt: at(),
            nodeId,
            pageId: options.pageId,
            toolCall: { name: "get_reactions", arguments: reactionArgs },
            coverage: coverageOf(reactions, "node-subtree"),
          },
          reactions,
        ),
      );
    }
  } finally {
    client.close();
  }

  const artifacts: CaptureArtifact[] = [];
  for (const entry of [...pending, ...screenshots.map((s) => s.artifact)]) {
    const target = path.join(options.outDir, entry.artifact.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, entry.bytes);
    artifacts.push({
      ...entry.artifact,
      sha256: sha256(entry.bytes),
      bytes: entry.bytes.length,
    });
  }

  const overridesBytes = Buffer.from(
    `${JSON.stringify(
      {
        schemaVersion: "figma-to-code/slot-overrides/v1",
        modeMap: {},
        slots: {},
        notes: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(path.join(options.outDir, "slot-overrides.json"), overridesBytes);

  const selectedNodes: SelectedNode[] = options.nodes.map((node) => ({
    id: node.id,
    // The authored frame name is only knowable from the node reply itself.
    name: nodeNames.get(node.id) ?? node.id,
    pageId: options.pageId,
    purposes: node.purposes,
  }));

  const manifest: CaptureManifest = {
    $schema: "https://figma-to-code.local/schemas/capture-manifest.schema.json",
    schemaVersion: "figma-to-code/capture-manifest/v1",
    captureId: options.captureId,
    brand: options.brand,
    capturedAt: `${new Date().toISOString().slice(0, 19)}Z`,
    source: {
      kind: "figma",
      fileKey: documentName,
      documentId,
      documentName,
      selectedPageIds: [options.pageId],
      selectedNodes,
    },
    authorization: {
      status: "authorized",
      basis: options.basis,
      capturedBy: options.capturedBy,
      containsPrivateContent: true,
      commitPolicy: "private-local",
      notes: options.notes,
    },
    provenance: {
      captureMethod: "read-only-local-mcp",
      operator: "scripts/capture-figma.ts",
      notes: [
        `fork ${PINNED_FORK.commit} via ${options.channel}`,
        "Raw replies written verbatim; screenshots decoded from the stored export blocks.",
      ],
    },
    runtime: {
      provider: "talk-to-figma-fork",
      forkCommit: PINNED_FORK.commit,
      packageVersion: PINNED_FORK.packageVersion,
      serverBundleSha256: PINNED_FORK.serverBundleSha256,
      connection: { relay: "local-websocket", channel: options.channel },
      plugin: { ...PINNED_FORK.plugin },
      capabilityFingerprint: report.capabilityFingerprint,
    },
    artifacts,
    overrides: {
      path: "slot-overrides.json",
      sha256: sha256(overridesBytes),
      bytes: overridesBytes.length,
    },
  };

  const manifestPath = path.join(options.outDir, "capture-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  // The capture is only real if the immutable contract accepts it offline.
  const bundle = await loadCaptureBundle(manifestPath);
  console.log(
    `bundle ok — ${bundle.manifest.artifacts.length} artifacts, ${bundle.payloads.size} payloads, ${bundle.screenshots.size} screenshots`,
  );
  console.log(manifestPath);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
