#!/usr/bin/env -S node --import tsx

import assert from "node:assert/strict";

import { computeCapabilityFingerprint } from "./lib/capture-contract.js";
import {
  IMAGE_FILL_EXPORT_CAPABILITY_SCOPE,
  IMAGE_FILL_EXPORT_FORK,
  IMAGE_FILL_EXPORT_REQUIRED_TOOLS,
  assertImageFillExportManifest,
  preservesObservedImageFillFields,
  sameJson,
  validateImageFillExportManifest,
  type ImageFillExportManifest,
} from "./lib/image-fill-export-contract.js";

let passed = 0;

function check(name: string, action: () => void): void {
  action();
  passed += 1;
  console.log(`✅ ${name}`);
}

function expectFailure(name: string, action: () => void, pattern: RegExp): void {
  assert.throws(action, pattern, name);
  passed += 1;
  console.log(`✅ ${name}`);
}

const hash = (character: string): string => character.repeat(64);
const capabilityTools = IMAGE_FILL_EXPORT_REQUIRED_TOOLS.map((name, index) => ({
  name,
  inputSchemaSha256: hash(`${index + 1}`),
}));

function validManifest(): ImageFillExportManifest {
  return {
    $schema: "https://figma-to-code.local/schemas/image-fill-export-manifest.schema.json",
    schemaVersion: "figma-to-code/image-fill-export-manifest/v1",
    exportId: "synthetic-image-fill-pass",
    capturedAt: "2026-09-02T12:00:00.000Z",
    sourceCapture: { manifestSha256: hash("a"), bytes: 42 },
    authorization: {
      status: "authorized",
      basis: "synthetic",
      capturedBy: "contract test",
      containsPrivateContent: true,
      commitPolicy: "private-local",
      notes: "Synthetic private-local shape only; no source asset is present.",
    },
    provenance: {
      captureMethod: "read-only-local-mcp",
      operator: "scripts/export-figma-image-fills.ts",
      notes: ["Synthetic contract fixture."],
    },
    runtime: {
      provider: "talk-to-figma-fork",
      forkCommit: IMAGE_FILL_EXPORT_FORK.commit,
      packageVersion: IMAGE_FILL_EXPORT_FORK.packageVersion,
      serverBundleSha256: IMAGE_FILL_EXPORT_FORK.serverBundleSha256,
      connection: { relay: "local-websocket", channel: "synthetic-channel" },
      plugin: { ...IMAGE_FILL_EXPORT_FORK.plugin },
      capabilityFingerprint: {
        algorithm: "sha256",
        scope: IMAGE_FILL_EXPORT_CAPABILITY_SCOPE,
        value: computeCapabilityFingerprint(capabilityTools),
        tools: capabilityTools,
      },
    },
    assets: [
      {
        id: "synthetic-cta-background",
        capturedAt: "2026-09-02T12:00:01.000Z",
        nodeId: "1:2",
        paintIndex: 0,
        sourceImageHash: "figma-opaque-image-hash",
        imageFill: {
          type: "IMAGE",
          imageHash: "figma-opaque-image-hash",
          scaleMode: "FILL",
        },
        mimeType: "image/png",
        width: 1280,
        height: 720,
        dimensionSource: "png-ihdr",
        toolCall: {
          name: "export_image_fill",
          arguments: { nodeId: "1:2", paintIndex: 0 },
          delivery: "file",
        },
        sourceBytes: { path: "assets/synthetic-cta-background.asset", sha256: hash("b"), bytes: 24 },
        receipt: { path: "receipts/synthetic-cta-background.json", sha256: hash("c"), bytes: 240 },
        before: { path: "node-observations/synthetic-cta-background.before.json", sha256: hash("d"), bytes: 120 },
        after: { path: "node-observations/synthetic-cta-background.after.json", sha256: hash("e"), bytes: 120 },
      },
    ],
  };
}

check("a valid targeted image-fill manifest passes without touching the R1 capture pin", () => {
  const manifest = validManifest();
  assert.deepEqual(validateImageFillExportManifest(manifest), []);
  assertImageFillExportManifest(manifest);
});

expectFailure(
  "a runtime from the historical full-capture pin cannot masquerade as an R2.5 asset pass",
  () => {
    const manifest = validManifest();
    manifest.runtime.forkCommit = "0".repeat(40);
    assertImageFillExportManifest(manifest);
  },
  /runtime\.forkCommit/,
);

expectFailure(
  "the scoped fingerprint refuses a tool that is outside the narrow read lane",
  () => {
    const manifest = validManifest();
    manifest.runtime.capabilityFingerprint.tools.push({
      name: "set_fill",
      inputSchemaSha256: hash("f"),
    });
    manifest.runtime.capabilityFingerprint.value = computeCapabilityFingerprint(
      manifest.runtime.capabilityFingerprint.tools,
    );
    assertImageFillExportManifest(manifest);
  },
  /must contain exactly the R2\.5 read tools/,
);

expectFailure(
  "two evidence roles cannot alias the same path",
  () => {
    const manifest = validManifest();
    manifest.assets[0].after.path = manifest.assets[0].before.path;
    assertImageFillExportManifest(manifest);
  },
  /evidence file paths must be unique/,
);

check("node no-mutation comparison is order-insensitive but value-sensitive", () => {
  assert.equal(
    sameJson(
      { fills: [{ type: "IMAGE", imageHash: "opaque" }], name: "CTA" },
      { name: "CTA", fills: [{ imageHash: "opaque", type: "IMAGE" }] },
    ),
    true,
  );
  assert.equal(
    sameJson(
      { fills: [{ type: "IMAGE", imageHash: "opaque" }] },
      { fills: [{ type: "IMAGE", imageHash: "changed" }] },
    ),
    false,
  );
});

check("an export may add Figma's opaque image hash while retaining every stable observed placement field", () => {
  assert.equal(
    preservesObservedImageFillFields(
      { type: "IMAGE", scaleMode: "CROP", imageTransform: [[0.5, 0, 0.25], [0, 0.5, 0.25]] },
      {
        type: "IMAGE",
        imageHash: "opaque-hash",
        scaleMode: "CROP",
        imageTransform: [[0.5, 0, 0.25], [0, 0.5, 0.25]],
      },
    ),
    true,
  );
  assert.equal(
    preservesObservedImageFillFields(
      { type: "IMAGE", scaleMode: "FILL" },
      { type: "IMAGE", imageHash: "opaque-hash", scaleMode: "FIT" },
    ),
    false,
  );
});

console.log(`\n${passed} image-fill export contract checks passed.`);
