export interface StripResult {
  text: string;
  warnings: string[];
}

/**
 * 从模型原始输出中剥离噪声,定位出 JSON 主体:
 *  - 去掉 <think>…</think> 等思考过程标签
 *  - 去掉 ```json … ``` 代码围栏
 *  - 截取首个 { 或 [ 到与之匹配的结尾,丢弃两侧的解释性文字
 */
export function strip(raw: string): StripResult {
  const warnings: string[] = [];
  let text = raw;

  // 1. 去思考过程标签(DeepSeek R1 等)
  const thinkPattern = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;
  if (thinkPattern.test(text)) {
    text = text.replace(thinkPattern, "");
    warnings.push("剥离了 <think> 思考过程");
  }
  // 未闭合的思考起始标签:丢弃其之前的内容
  const openThink = text.match(/<think(?:ing)?>/i);
  if (openThink) {
    text = text.slice((openThink.index ?? 0) + openThink[0].length);
    warnings.push("剥离了未闭合的 <think> 起始片段");
  }

  // 2. 去代码围栏,优先取 ```json 块
  const fenced =
    text.match(/```(?:json|json5)?\s*([\s\S]*?)```/i) ?? text.match(/```([\s\S]*?)```/);
  if (fenced) {
    text = fenced[1];
    warnings.push("从 ``` 代码围栏中提取内容");
  }

  // 3. 定位 JSON 主体:首个 { 或 [ 到匹配的结尾(按引号/转义感知做括号配对)
  const body = locateJsonBody(text);
  if (body && body !== text.trim()) {
    text = body;
    warnings.push("截取了 JSON 主体,丢弃两侧多余文字");
  }

  return { text: text.trim(), warnings };
}

/** 找到第一个 { 或 [,并配对到其结尾,跳过字符串内部的括号。 */
function locateJsonBody(input: string): string | undefined {
  const start = firstOpen(input);
  if (start === -1) return undefined;
  const open = input[start];
  const close = open === "{" ? "}" : "]";

  let depth = 0;
  let inStr = false;
  let quote = "";
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inStr) {
      if (ch === "\\") {
        i++; // 跳过转义字符
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  // 没配平(可能被截断):返回从起点到末尾,交给后续容错解析
  return input.slice(start);
}

function firstOpen(input: string): number {
  const brace = input.indexOf("{");
  const bracket = input.indexOf("[");
  if (brace === -1) return bracket;
  if (bracket === -1) return brace;
  return Math.min(brace, bracket);
}
