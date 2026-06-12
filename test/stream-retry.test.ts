import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { coerceWithRetry, parsePartial, coerceStream } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  severity: z.enum(["high", "low"]),
});

// ---------- coerceWithRetry ----------

test("首次成功则只调用一次", async () => {
  let calls = 0;
  const r = await coerceWithRetry({
    schema: Schema,
    call: async () => {
      calls++;
      return '{"title":"x","severity":"high"}';
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 1);
  assert.equal(calls, 1);
});

test("首次脏/非法,重试时带中文 hint 并成功", async () => {
  const hints: (string | undefined)[] = [];
  const r = await coerceWithRetry({
    schema: Schema,
    call: async (hint, attempt) => {
      hints.push(hint);
      if (attempt === 0) return "这不是 JSON,只是一段话";
      return '{"title":"x","severity":"high"}';
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.equal(hints[0], undefined); // 首次无 hint
  assert.ok(hints[1] && hints[1].includes("JSON")); // 重试带 hint
});

test("schema 错误生成字段级 hint", async () => {
  const seen: (string | undefined)[] = [];
  const r = await coerceWithRetry({
    schema: Schema,
    maxRetries: 1,
    call: async (hint, attempt) => {
      seen.push(hint);
      if (attempt === 0) return '{"title":"x","severity":"中危"}'; // 枚举不符
      return '{"title":"x","severity":"low"}';
    },
  });
  assert.equal(r.ok, true);
  assert.ok(seen[1] && seen[1].includes("severity")); // hint 指出了具体字段
});

test("超过重试上限仍失败返回 ok:false", async () => {
  const r = await coerceWithRetry({
    schema: Schema,
    maxRetries: 2,
    call: async () => "永远不是 JSON",
  });
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 3);
});

// ---------- parsePartial ----------

test("半截字符串值能解析出局部对象", () => {
  const p = parsePartial('{"title":"登录逻辑可能空指');
  assert.deepEqual(p, { title: "登录逻辑可能空指" });
});

test("逐步流入,对象逐步长出", () => {
  assert.deepEqual(parsePartial("{"), {});
  assert.deepEqual(parsePartial('{"title":"x"'), { title: "x" });
  assert.deepEqual(parsePartial('{"title":"x","severity":"hi'), {
    title: "x",
    severity: "hi",
  });
});

test("丢弃不完整的尾字段(key 无值)", () => {
  // "severity 后面还没给值 → 丢掉该字段,保留已完整的部分
  const p = parsePartial('{"title":"x","severity');
  assert.deepEqual(p, { title: "x" });
});

test("数组流式补全", () => {
  assert.deepEqual(parsePartial('[{"id":1},{"id":2'), [{ id: 1 }, { id: 2 }]);
});

// ---------- coerceStream ----------

async function* streamOf(full: string, size = 5): AsyncGenerator<string> {
  for (let i = 0; i < full.length; i += size) yield full.slice(i, i + size);
}

test("coerceStream:边流边回调 + 最终校验", async () => {
  const full = '{"title":"空指针风险","severity":"high"}';
  const partials: unknown[] = [];
  const r = await coerceStream(streamOf(full), Schema, (p) => partials.push(p));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.title, "空指针风险");
  assert.ok(partials.length > 1); // 中途有多次局部更新
  // 最后一次局部对象应已接近完整
  assert.equal((partials.at(-1) as { title?: string }).title, "空指针风险");
});
