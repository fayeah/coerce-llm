/**
 * 采集脚本:用真实模型 key 调用各家模型,把"原始返回"原样存为样本,
 * 供无 key 的语料测试回归使用。只需每个模型手动跑一次。
 *
 * 用法:
 *   ZHIPU_API_KEY=xxx    pnpm capture chatglm
 *   DEEPSEEK_API_KEY=xxx pnpm capture deepseek
 *   DASHSCOPE_API_KEY=xxx pnpm capture qwen
 *   自定义/网关:
 *   COERCE_API_KEY=xxx COERCE_BASE_URL=https://your-gateway/v1 COERCE_MODEL=xxx pnpm capture custom
 *
 * 可用 COERCE_MODEL 覆盖任意预设的模型名。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { capturePrompts } from "../test/fixtures.js";

interface Preset {
  baseUrl: string;
  keyEnv: string;
  model: string;
}

const PRESETS: Record<string, Preset> = {
  chatglm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    keyEnv: "ZHIPU_API_KEY",
    model: "glm-4-plus",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyEnv: "DASHSCOPE_API_KEY",
    model: "qwen-plus",
  },
};

function resolvePreset(name: string): Preset {
  if (name === "custom") {
    const baseUrl = process.env.COERCE_BASE_URL;
    const model = process.env.COERCE_MODEL;
    if (!baseUrl || !model) {
      throw new Error("custom 需要设置 COERCE_BASE_URL 与 COERCE_MODEL,key 走 COERCE_API_KEY。");
    }
    return { baseUrl, keyEnv: "COERCE_API_KEY", model };
  }
  const preset = PRESETS[name];
  if (!preset) {
    throw new Error(
      `未知模型「${name}」。可选: ${Object.keys(PRESETS).join(" / ")} / custom`,
    );
  }
  return preset;
}

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("用法: pnpm capture <chatglm|deepseek|qwen|custom>");
    process.exit(1);
  }

  const preset = resolvePreset(name);
  const model = process.env.COERCE_MODEL || preset.model;
  const apiKey = process.env[preset.keyEnv];
  if (!apiKey) {
    console.error(`缺少 API key:请设置环境变量 ${preset.keyEnv}。`);
    process.exit(1);
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "samples", name);
  mkdirSync(outDir, { recursive: true });

  for (const prompt of capturePrompts) {
    process.stdout.write(`采集 ${name}/${prompt.id} ... `);
    try {
      const res = await fetch(`${preset.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages: prompt.messages, stream: false }),
      });
      if (!res.ok) {
        console.log(`失败 (${res.status})`);
        console.log("  " + (await res.text()).slice(0, 200));
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const file = join(outDir, `${prompt.id}.txt`);
      writeFileSync(file, raw, "utf8");
      console.log(`已存 ${file}`);
    } catch (e) {
      console.log(`异常: ${(e as Error).message}`);
    }
  }

  console.log(`\n完成。可运行 pnpm test 用语料测试回归(无需 key)。`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
