# coerce-llm

> 把国产 / 推理模型吐出的脏 JSON,稳定解析成符合 zod schema 的结构化数据。框架无关的"解析 + 修复"核。

国产模型(ChatGLM / DeepSeek / Qwen…)和推理模型常常**不支持原生结构化输出**(function calling / json schema),只能"提示 + 自己解析"。而它们的输出又脏:包 ```json 围栏、前置废话、`<think>` 思考过程、全角标点、中文引号、单引号、尾逗号……普通 `JSON.parse` 一碰就炸。

`coerce-llm` 专门收拾这些脏输出:**给一段文本 + 一个 zod schema,尽最大努力解析校验成类型化数据**。

- **框架无关**:纯函数,不调用模型、不绑定任何 SDK。配 fetch、Vercel AI SDK、任何东西都能用。
- **分层修复**:从最安全到最激进逐级尝试,能不动就不动。
- **修复可见**:每一步做了什么都记在 `warnings` 里,避免静默改错。

## 安装

```bash
npm i coerce-llm zod
```

`zod` 是 peer 依赖(v3 / v4 均可)。

## 用法

```ts
import { coerce } from "coerce-llm";
import { z } from "zod";

const schema = z.object({
  title: z.string(),
  severity: z.enum(["high", "low"]),
  line: z.number().optional(),
});

// 来自某个不支持原生结构化输出的模型的脏输出
const raw = '好的,以下是:\n```json\n{"title":"空指针风险"，"severity":"high",}\n```';

const r = coerce(raw, schema);
if (r.ok) {
  console.log(r.data);     // { title: "空指针风险", severity: "high" }
  console.log(r.warnings); // ["从 ``` 代码围栏中提取内容", "规范化全角结构标点后解析成功", ...]
} else {
  console.error(r.error);  // ParseError 或 ZodError
  console.error(r.raw);    // 原始输入,便于排查
}
```

抛错版:

```ts
import { coerceOrThrow } from "coerce-llm";
const data = coerceOrThrow(raw, schema); // 成功返回 data,失败抛错(错误上挂 warnings/raw)
```

## 它能修什么

按"先安全后激进"的顺序逐级尝试,命中即返回:

1. **严格 `JSON.parse`** —— 本来就干净就直接过。
2. **JSON5** —— 容忍单引号、尾逗号、`//` 注释、不带引号的 key。
3. **结构性规范化(字符串感知)** —— 把**结构位置**的全角标点(`，``：``｛｝``［］`)转半角,**保留字符串值里的全角标点**(如中文逗号)。
4. **激进规范化(最后手段)** —— 中文/弯引号 `“ ” ‘ ’` → ASCII 引号、清理尾逗号。可能误伤,**会在 `warnings` 中明确告警**。

剥壳阶段还会去掉:`<think>…</think>` 思考过程、```` ```json ```` 围栏、JSON 主体两侧的解释性文字。

## 选项

```ts
coerce(raw, schema, { aggressive: false });
```

- `aggressive`(默认 `true`):是否启用第 4 步激进规范化。设为 `false` 则绝不冒误伤风险,只用前三步——适合对数据准确性要求极高的场景。

## 配合 Vercel AI SDK

`coerce-llm` 不和 SDK 抢"调模型",而是补它在国产/推理模型上"解析不稳"的最后一公里:

```ts
import { generateText } from "ai";
import { coerce } from "coerce-llm";

const { text } = await generateText({ model, prompt });
const r = coerce(text, schema); // 用 SDK 调模型,用 coerce-llm 稳定解析
```

## 不做什么

- **不调用模型**、不管网络/鉴权/流式——那是 SDK 或你自己的事。
- 不保证"猜"对语义:激进修复可能把脏文本改成合法但语义存疑的 JSON,所以有 `warnings` 和 `aggressive:false`。

## 测试 / 采集真实样本

测试**不需要任何模型 key**——`coerce` 是纯函数,测试只是把"脏字符串"喂进去看结果。样本按"怪癖"组织在 `test/samples/`,语料测试会遍历每个 `.txt`:

```bash
pnpm test   # 跑单元测试 + 语料库回归(无需 key)
```

`test/samples/<来源>/<case>.txt` 是原始脏文本;同名 `<case>.expected.json` 存在时,会严格比对解析结果。加一个新 case = 丢一个文件,不用写代码。

> 仓库已内置真实采集样本(如 ChatGLM 在"不强约束格式"时会返回:前置废话 + ```json 块 + 一大段 markdown 讲解 + 额外的 `````go````` 代码块,JSON 里还多塞 schema 之外的字段)。coerce 能剥掉废话、**只抓正确的 ```json 块**,zod 默认丢弃多余字段——这些都在语料测试里回归。

真实模型的脏样本只需**手动采集一次**(这步才用 key):

```bash
ZHIPU_API_KEY=xxx    pnpm capture chatglm
DEEPSEEK_API_KEY=xxx pnpm capture deepseek
DASHSCOPE_API_KEY=xxx pnpm capture qwen
# 任意 OpenAI 兼容网关:
COERCE_API_KEY=xxx COERCE_BASE_URL=https://your-gateway/v1 COERCE_MODEL=xxx pnpm capture custom
```

采集脚本会把各模型的**原始返回**原样存进 `test/samples/<model>/`,之后回归测试全程无需 key、可在 CI 跑。

## Roadmap

- [ ] 值级轻度强转(数字字符串 → 数字等)
- [ ] 带模型重试的 `coerceWithRetry`:把 zod 错误用中文回喂模型纠错
- [ ] 流式部分 JSON 解析(边流边出)
- [ ] 更多真实脏样本进测试集

## License

MIT
