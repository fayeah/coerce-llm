import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { coerce, coerceOrThrow } from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  severity: z.enum(["high", "low"]),
  line: z.number().optional(),
});

test("干净 JSON 直接通过", () => {
  const r = coerce('{"title":"x","severity":"high"}', Schema);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.title, "x");
});

test("```json 代码围栏", () => {
  const raw = '```json\n{"title":"x","severity":"low"}\n```';
  const r = coerce(raw, Schema);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.severity, "low");
});

test("前置废话 + 围栏", () => {
  const raw = '好的,以下是审查结果:\n```json\n{"title":"空指针","severity":"high"}\n```\n希望有用!';
  const r = coerce(raw, Schema);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.title, "空指针");
});

test("推理模型 <think> 思考过程", () => {
  const raw = '<think>用户想要一个问题对象,我分析一下...</think>\n{"title":"越界","severity":"high"}';
  const r = coerce(raw, Schema);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.title, "越界");
});

test("单引号 + 尾逗号(JSON5 兜底)", () => {
  const raw = "{'title':'x','severity':'low',}";
  const r = coerce(raw, Schema);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.title, "x");
});

test("全角逗号/冒号作分隔符,但保留字符串值内的全角逗号", () => {
  const raw = '{"title":"登录，失败"，"severity":"high"}';
  const r = coerce(raw, Schema);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.data.title, "登录，失败"); // 值里的全角逗号必须保留
    assert.equal(r.data.severity, "high");
  }
});

test("中文引号作分隔符(激进规范化 + 告警)", () => {
  const raw = "{“title”：“你好”，“severity”：“low”}";
  const r = coerce(raw, Schema);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.data.title, "你好");
    assert.ok(r.warnings.some((w) => w.includes("激进规范化")));
  }
});

test("数组根 + 围栏", () => {
  const ArrSchema = z.array(z.object({ id: z.number() }));
  const raw = "```\n[{id:1},{id:2},]\n```";
  const r = coerce(raw, ArrSchema);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.length, 2);
});

test("schema 校验失败时返回 ok:false", () => {
  const raw = '{"title":"x","severity":"中危"}'; // severity 不在枚举内
  const r = coerce(raw, Schema);
  assert.equal(r.ok, false);
});

test("完全无法解析时返回 ok:false", () => {
  const r = coerce("这就是一段没有任何 JSON 的纯文本", Schema);
  assert.equal(r.ok, false);
});

test("aggressive:false 时不做中文引号替换", () => {
  const raw = "{“title”：“你好”，“severity”：“low”}";
  const r = coerce(raw, Schema, { aggressive: false });
  assert.equal(r.ok, false); // 关闭激进后应解析失败
});

test("coerceOrThrow 成功返回数据", () => {
  const data = coerceOrThrow('{"title":"x","severity":"high"}', Schema);
  assert.equal(data.title, "x");
});

test("coerceOrThrow 失败时抛错并带 warnings", () => {
  assert.throws(() => coerceOrThrow("纯文本无 JSON", Schema));
});
