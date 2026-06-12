/** 任何带 safeParse 的 schema(zod v3/v4 都满足),避免硬依赖 zod。 */
export interface SchemaLike<T> {
  safeParse(
    data: unknown,
  ): { success: true; data: T } | { success: false; error: unknown };
}

export interface CoerceOptions {
  /**
   * 是否允许激进规范化(中文引号/全角标点全局替换)。
   * 默认 true;设为 false 则只用严格/JSON5/结构性规范化,绝不冒误伤风险。
   */
  aggressive?: boolean;
}

export type CoerceResult<T> =
  | { ok: true; data: T; warnings: string[] }
  | { ok: false; error: Error; warnings: string[]; raw: string };
