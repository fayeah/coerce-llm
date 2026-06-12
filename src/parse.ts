import JSON5 from "json5";
import { normalizeStructural, normalizeAggressive } from "./parse-normalize.js";

export interface ParseOutcome {
  value: unknown;
  warnings: string[];
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly attempts: string[],
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * 分层解析,从最安全到最激进逐级尝试:
 *  1. 严格 JSON.parse
 *  2. JSON5(容忍单引号 / 尾逗号 / 注释 / 不带引号的 key)
 *  3. 字符串感知的结构性规范化 + JSON5
 *  4. 激进规范化(中文引号等)+ JSON5
 */
export function parseLoose(
  text: string,
  options: { aggressive?: boolean } = {},
): ParseOutcome {
  const aggressive = options.aggressive ?? true;
  const attempts: string[] = [];

  const tryParse = (input: string): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON5.parse(input) };
    } catch {
      return { ok: false };
    }
  };

  // 1. 严格
  try {
    return { value: JSON.parse(text), warnings: [] };
  } catch {
    attempts.push("strict JSON.parse 失败");
  }

  // 2. JSON5
  {
    const r = tryParse(text);
    if (r.ok) return { value: r.value, warnings: ["用 JSON5 容错解析成功"] };
    attempts.push("JSON5 解析失败");
  }

  // 3. 结构性规范化
  {
    const { text: t, changed } = normalizeStructural(text);
    if (changed) {
      const r = tryParse(t);
      if (r.ok) return { value: r.value, warnings: ["规范化全角结构标点后解析成功"] };
      attempts.push("结构性规范化后仍解析失败");
    }
  }

  // 4. 激进规范化(在结构性规范化基础上叠加)
  if (aggressive) {
    const structural = normalizeStructural(text).text;
    const { text: t, changed } = normalizeAggressive(structural);
    if (changed) {
      const r = tryParse(t);
      if (r.ok) {
        return {
          value: r.value,
          warnings: ["激进规范化(中文引号/尾逗号等)后解析成功,可能存在误伤,请核对"],
        };
      }
      attempts.push("激进规范化后仍解析失败");
    }
  }

  throw new ParseError("无法将文本解析为 JSON", attempts);
}
