import JSON5 from "json5";
import { coerce } from "./coerce.js";
import type { CoerceResult, SchemaLike } from "./types.js";

function firstOpen(input: string): number {
  const brace = input.indexOf("{");
  const bracket = input.indexOf("[");
  if (brace === -1) return bracket;
  if (bracket === -1) return brace;
  return Math.min(brace, bracket);
}

/** 给可能被截断的 JSON 自动补全:闭合未结束的字符串、去尾逗号、补全括号。 */
function autoClose(text: string): string {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let res = text;
  if (inStr) res += '"';
  res = res.replace(/\s+$/, "");
  if (res.endsWith(",")) res = res.slice(0, -1);
  if (res.endsWith(":")) res += "null";
  for (let i = stack.length - 1; i >= 0; i--) {
    res += stack[i] === "{" ? "}" : "]";
  }
  return res;
}

/**
 * 尽力解析"半截 JSON":先自动补全再解析;失败则丢弃最后一个不完整字段(到上一个逗号)重试。
 * 返回当前能解析出的最大局部对象;完全无从下手则返回 undefined。
 */
export function parsePartial(raw: string): unknown | undefined {
  const start = firstOpen(raw);
  if (start === -1) return undefined;
  let text = raw.slice(start);

  while (text.length > 0) {
    try {
      return JSON5.parse(autoClose(text));
    } catch {
      const comma = text.lastIndexOf(",");
      if (comma <= 0) break;
      text = text.slice(0, comma);
    }
  }
  return undefined;
}

/**
 * 消费一个文本块流,边流边解析:
 *  - 每来一块就回调 onPartial(当前能解析出的局部对象),用于实时渲染;
 *  - 流结束后对完整内容做一次正式 coerce 校验并返回结果。
 */
export async function coerceStream<T>(
  chunks: AsyncIterable<string>,
  schema: SchemaLike<T>,
  onPartial?: (partial: unknown) => void,
): Promise<CoerceResult<T>> {
  let buf = "";
  for await (const chunk of chunks) {
    buf += chunk;
    if (onPartial) {
      const partial = parsePartial(buf);
      if (partial !== undefined) onPartial(partial);
    }
  }
  return coerce(buf, schema);
}
