import { z } from "zod";

/**
 * 采集脚本与语料测试共用的 schema。
 * 设计上覆盖多种类型:枚举、数组、可选数字、字符串,便于检验解析健壮性。
 */
export const sampleSchema = z.object({
  title: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  tags: z.array(z.string()),
  line: z.number().optional(),
});

export type Sample = z.infer<typeof sampleSchema>;

export interface CapturePrompt {
  id: string;
  messages: { role: "system" | "user"; content: string }[];
}

const SCHEMA_HINT =
  "返回一个 JSON 对象,字段:title(字符串)、severity(只能是 high/medium/low 之一)、tags(字符串数组)、line(可选,整数)。只返回 JSON。";

/** 采集时发给各模型的 prompt;故意不强约束格式,以诱出各家的"脏"输出。 */
export const capturePrompts: CapturePrompt[] = [
  {
    id: "basic",
    messages: [
      { role: "system", content: "你是代码审查助手。" },
      { role: "user", content: `描述一个"空指针风险"的问题。${SCHEMA_HINT}` },
    ],
  },
  {
    id: "with-tags",
    messages: [
      { role: "user", content: `给出一个 XSS 安全问题,tags 至少两个。${SCHEMA_HINT}` },
    ],
  },
  {
    id: "no-format-hint",
    messages: [
      // 不提"只返回JSON",更容易诱出围栏/前置废话
      { role: "user", content: `用上面的字段(title/severity/tags/line)描述一个并发竞态问题,给我 JSON。` },
    ],
  },
];
