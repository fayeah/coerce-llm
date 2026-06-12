import { strip } from "./strip.js";
import { parseLoose, ParseError } from "./parse.js";
import type { CoerceOptions, CoerceResult, SchemaLike } from "./types.js";

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  return new Error(String(e));
}

/**
 * 把 LLM 的脏文本解析为符合 schema 的结构化数据。
 * 不调用模型、不依赖任何框架——纯函数。
 *
 * @param raw    模型返回的原始字符串
 * @param schema 任意带 safeParse 的 schema(如 zod)
 */
export function coerce<T>(
  raw: string,
  schema: SchemaLike<T>,
  options: CoerceOptions = {},
): CoerceResult<T> {
  const warnings: string[] = [];

  const stripped = strip(raw);
  warnings.push(...stripped.warnings);

  let parsedValue: unknown;
  try {
    const parsed = parseLoose(stripped.text, { aggressive: options.aggressive });
    parsedValue = parsed.value;
    warnings.push(...parsed.warnings);
  } catch (e) {
    return { ok: false, error: toError(e), warnings, raw };
  }

  const result = schema.safeParse(parsedValue);
  if (result.success) {
    return { ok: true, data: result.data, warnings };
  }
  return { ok: false, error: toError(result.error), warnings, raw };
}

/** coerce 的抛错版:成功返回数据,失败抛出错误(错误上挂 warnings/raw)。 */
export function coerceOrThrow<T>(
  raw: string,
  schema: SchemaLike<T>,
  options: CoerceOptions = {},
): T {
  const r = coerce(raw, schema, options);
  if (r.ok) return r.data;
  Object.assign(r.error, { warnings: r.warnings, raw: r.raw });
  throw r.error;
}

export { ParseError };
