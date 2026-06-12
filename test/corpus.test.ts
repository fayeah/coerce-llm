import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { coerce } from "../src/index.js";
import { sampleSchema } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(here, "samples");

/** 递归收集所有 .txt 样本(兼容老 Node:不依赖 readdir recursive)。 */
function collectTxt(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTxt(full));
    else if (entry.name.endsWith(".txt")) out.push(full);
  }
  return out;
}

const files = existsSync(samplesDir) ? collectTxt(samplesDir) : [];

if (files.length === 0) {
  test("语料库为空 —— 运行 `pnpm capture <model>` 采集真实样本", () => {});
} else {
  for (const file of files) {
    const name = relative(samplesDir, file);
    test(`语料样本: ${name}`, () => {
      const raw = readFileSync(file, "utf8");
      const r = coerce(raw, sampleSchema);
      assert.equal(
        r.ok,
        true,
        `解析失败: ${r.ok ? "" : r.error.message}\n原文:\n${raw.slice(0, 300)}`,
      );

      // 若存在同名 .expected.json,则严格比对解析结果。
      const expectedPath = file.replace(/\.txt$/, ".expected.json");
      if (r.ok && existsSync(expectedPath)) {
        const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
        assert.deepEqual(r.data, expected);
      }
    });
  }
}
