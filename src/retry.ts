import { coerce } from "./coerce.js";
import type { CoerceOptions, CoerceResult, SchemaLike } from "./types.js";

/** 从失败的 coerce 错误生成给模型的中文纠错提示。 */
export function buildRetryHint(error: Error): string {
  const issues = (error as { issues?: unknown }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    const lines = issues
      .slice(0, 10)
      .map((i) => {
        const issue = i as { path?: unknown[]; message?: string };
        const path = (issue.path ?? []).join(".") || "(根)";
        return `- 字段 ${path}: ${issue.message ?? "不符合要求"}`;
      })
      .join("\n");
    return `你上次的输出不符合要求,请修正以下问题后**只返回 JSON**(不要解释、不要代码围栏):\n${lines}`;
  }
  return "你上次的输出不是合法 JSON,请**只返回 JSON**,不要任何解释或代码围栏。";
}

export interface RetryOptions<T> extends CoerceOptions {
  schema: SchemaLike<T>;
  /**
   * 调用模型并返回原始字符串。
   * @param hint    重试时的中文纠错提示(首次为 undefined),请把它拼进你的 prompt。
   * @param attempt 第几次尝试(从 0 开始)。
   */
  call: (hint: string | undefined, attempt: number) => Promise<string>;
  /** 最大重试次数(不含首次)。默认 2,即最多调用 3 次。 */
  maxRetries?: number;
}

export type RetryResult<T> = CoerceResult<T> & { attempts: number };

/**
 * 带模型重试的结构化输出:调用模型 → coerce → 失败则把错误用中文回喂模型重试。
 * 本库不绑定任何传输,模型怎么调由你在 `call` 里决定。
 */
export async function coerceWithRetry<T>(opts: RetryOptions<T>): Promise<RetryResult<T>> {
  const max = opts.maxRetries ?? 2;
  const allWarnings: string[] = [];
  let last: CoerceResult<T> | undefined;
  let hint: string | undefined;

  for (let attempt = 0; attempt <= max; attempt++) {
    const raw = await opts.call(hint, attempt);
    last = coerce(raw, opts.schema, { aggressive: opts.aggressive });
    if (last.ok) {
      return { ...last, warnings: [...allWarnings, ...last.warnings], attempts: attempt + 1 };
    }
    allWarnings.push(...last.warnings);
    hint = buildRetryHint(last.error);
  }

  return { ...(last as CoerceResult<T>), warnings: allWarnings, attempts: max + 1 };
}
