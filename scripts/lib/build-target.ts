import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  printValidationResult,
  validateDesignSystem,
  type DesignSystemValidation,
  type ValidateDesignSystemOptions,
} from "../validate-design-system.js";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(LIB_DIR, "../..");
const BRAND_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRAND_IMPORT = /^@import\s+(["'])\.\.\/\.\.\/design-systems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/tokens\.css\1;\s*$/;

export type BuildTarget = "none" | "astro";

export type BuildTargetResult = {
  target: BuildTarget;
  brand: string;
  previousBrand?: string;
  seamChanged: boolean;
};

type BuildTargetDependencies = {
  buildAstro?: (projectRoot: string) => Promise<void>;
  validate?: (
    options: ValidateDesignSystemOptions,
  ) => Promise<DesignSystemValidation>;
};

export class BuildTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildTargetError";
  }
}

export function parseBuildTarget(
  value: string | undefined,
  provided = value !== undefined,
): BuildTarget {
  if (!provided) return "none";
  if (value === "none") return "none";
  if (value === "astro") return "astro";
  throw new BuildTargetError(
    `emit-design-system: --build must be one of none|astro, got ${JSON.stringify(value)}.`,
  );
}

export function retargetBrandImport(
  source: string,
  brand: string,
): { source: string; previousBrand: string; changed: boolean } {
  if (!BRAND_SLUG.test(brand)) {
    throw new BuildTargetError(
      `emit-design-system: --brand must be lowercase-kebab, got ${brand}.`,
    );
  }

  const lines = source.split("\n");
  const imports = lines
    .map((line, index) => ({ index, match: line.match(/^@import\b/) }))
    .filter((entry) => entry.match !== null);
  if (imports.length === 0) {
    throw new BuildTargetError(
      "build target astro: src/styles/global.css has no @import brand seam.",
    );
  }

  const seamIndex = imports[0].index;
  const seam = lines[seamIndex].match(BRAND_IMPORT);
  if (seam === null) {
    throw new BuildTargetError(
      "build target astro: the first @import in src/styles/global.css is not the design-systems/<slug>/tokens.css brand seam.",
    );
  }

  const previousBrand = seam[2];
  if (previousBrand === brand) {
    return { source, previousBrand, changed: false };
  }

  lines[seamIndex] = `@import "../../design-systems/${brand}/tokens.css";`;
  return { source: lines.join("\n"), previousBrand, changed: true };
}

async function buildAstro(projectRoot: string): Promise<void> {
  const { build } = await import("astro");
  await build({ root: projectRoot });
}

export async function runBuildTarget(
  options: {
    target: BuildTarget;
    brand: string;
    odRoot: string;
    packageRoot: string;
    projectRoot?: string;
  },
  dependencies: BuildTargetDependencies = {},
): Promise<BuildTargetResult> {
  const { target, brand, odRoot } = options;
  if (target === "none") {
    return { target, brand, seamChanged: false };
  }
  if (!BRAND_SLUG.test(brand)) {
    throw new BuildTargetError(
      `emit-design-system: --brand must be lowercase-kebab, got ${brand}.`,
    );
  }

  const projectRoot = path.resolve(options.projectRoot ?? PROJECT_ROOT);
  const packageRoot = path.resolve(options.packageRoot);
  const expectedPackageRoot = path.join(projectRoot, "design-systems", brand);
  if (packageRoot !== expectedPackageRoot) {
    throw new BuildTargetError(
      `build target astro: package output must be ${expectedPackageRoot}; got ${packageRoot}.`,
    );
  }

  const validate = dependencies.validate ?? validateDesignSystem;
  const validation = await validate({ brand, brandRoot: packageRoot, odRoot });
  printValidationResult(validation);
  if (!validation.ok) {
    throw new BuildTargetError(
      `build target astro: refusing to retarget the brand seam because design-systems/${brand}/ failed validation.`,
    );
  }

  const stylesPath = path.join(projectRoot, "src", "styles", "global.css");
  const currentStyles = await readFile(stylesPath, "utf8");
  const retargeted = retargetBrandImport(currentStyles, brand);
  if (retargeted.changed) {
    await writeFile(stylesPath, retargeted.source, "utf8");
    console.log(
      `\nbrand seam         ${retargeted.previousBrand} → ${brand} (${path.relative(projectRoot, stylesPath)})`,
    );
  } else {
    console.log(`\nbrand seam         ${brand} (already selected)`);
  }

  console.log("astro build        starting after in-process package validation");
  await (dependencies.buildAstro ?? buildAstro)(projectRoot);
  console.log(`astro build        passed with design-systems/${brand}/`);

  return {
    target,
    brand,
    previousBrand: retargeted.previousBrand,
    seamChanged: retargeted.changed,
  };
}
