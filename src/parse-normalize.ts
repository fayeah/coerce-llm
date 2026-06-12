/** 全角 → 半角 的结构性标点映射(只对 JSON 结构字符)。 */
const FULLWIDTH_MAP: Record<string, string> = {
  "，": ",",
  "：": ":",
  "｛": "{",
  "｝": "}",
  "［": "[",
  "］": "]",
  "　": " ", // 全角空格
};

/**
 * 字符串感知的结构性规范化:仅在「不处于 ASCII 双引号字符串内部」时,
 * 把全角结构标点转半角。这样能保护字符串值里合法的全角标点(如中文逗号)。
 */
export function normalizeStructural(text: string): { text: string; changed: boolean } {
  let out = "";
  let inStr = false;
  let changed = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1]; // 原样保留转义序列
        i++;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    const mapped = FULLWIDTH_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      changed = true;
    } else {
      out += ch;
    }
  }

  return { text: out, changed };
}

/**
 * 激进规范化(最后手段):全局替换中文/弯引号为 ASCII 引号,并清理尾逗号。
 * 可能误伤字符串值里的同类字符,因此仅在更安全的解析都失败后才用,并告警。
 */
export function normalizeAggressive(text: string): { text: string; changed: boolean } {
  const before = text;
  let out = text
    // 弯/全角双引号 → "
    .replace(/[“”„‟＂]/g, '"')
    // 弯/全角单引号 → '
    .replace(/[‘’‛＇]/g, "'")
    // 残余全角结构标点
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/｛/g, "{")
    .replace(/｝/g, "}")
    .replace(/［/g, "[")
    .replace(/］/g, "]")
    .replace(/　/g, " ")
    // 尾逗号: ,} 或 ,]
    .replace(/,(\s*[}\]])/g, "$1");

  return { text: out, changed: out !== before };
}
