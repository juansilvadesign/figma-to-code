/**
 * Vendored from juansilvadesign/ai-website-cloner-template
 * @ b7b4dda5ffc9cfa279f9269b567c073f22a25860 on 2026-08-10.
 * Functional delta from that commit: dropped the "templates" ignore entry — no
 * such directory here.
 */

import { globalIgnores } from "eslint/config";
import astro from "eslint-plugin-astro";

const eslintConfig = [
  ...astro.configs.recommended,
  globalIgnores([
    ".astro/**",
    "dist/**",
    "scripts/**",
    "design-systems/**",
  ]),
];

export default eslintConfig;
