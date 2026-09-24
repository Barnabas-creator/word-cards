// 词族释义表：卡片的 fam 只存了词形，查词页显示词族时没有中文。
// 这里给「自己没有卡片」的词族成员补音标和简短释义，写到 data/famgloss.json。
// 有卡片的成员不收——前端直接用那张卡的 ipa / zh。
//
// 可续跑：已有释义的词跳过，每批写一次盘，配额用尽中途停下也不丢。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("需要环境变量 GEMINI_API_KEY");

// 429 配额用尽 / 404 模型已下线就换下一个模型；503 过载先等一等再试同一个
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-flash-lite-latest").split(",");
const BATCH = 50;   // 100 一批时模型输出常被截断，整批 JSON 解析失败

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const readJson = (f, fallback) => (existsSync(join(dataDir, f)) ? JSON.parse(readFileSync(join(dataDir, f), "utf8")) : fallback);

const cards = readJson("manifest.json", { shards: [] }).shards.flatMap((s) => readJson(s.file, []));
const own = new Set(cards.map((c) => c.w.toLowerCase()));
const need = [...new Set(cards.flatMap((c) => (c.fam ?? []).map((f) => f.toLowerCase())))]
  .filter((f) => !own.has(f));

const outFile = join(dataDir, "famgloss.json");
const gloss = readJson("famgloss.json", {});
// 顺带清掉已经有了自己卡片的词（比如后来被补充词表收进去的）
for (const w of Object.keys(gloss)) if (!need.includes(w)) delete gloss[w];
const todo = need.filter((w) => !Object.hasOwn(gloss, w));   // 别用 gloss[w]：constructor 会取到 Object 原型上的函数
console.log(`词族成员 ${need.length} 个，已有释义 ${need.length - todo.length}，本次待生成 ${todo.length}`);

const PROMPT = `你是英汉词典编辑。给下面每个英语词输出音标和中文释义：
- ipa：斜杠包裹，例如 /ˈneɪʃ(ə)nl/
- zh：中文释义，不超过 12 个汉字，最常用的一两个义项，顿号分隔，要带词性提示可写「（形）」这类前缀，地道不机翻
只输出 JSON 数组，每个词一条，w 原样照抄。`;
const SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { w: { type: "string" }, ipa: { type: "string" }, zh: { type: "string" } },
    required: ["w", "ipa", "zh"],
  },
};

async function call(model, words) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${PROMPT}\n\n${words.join("\n")}` }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const j = await res.json();
  return JSON.parse(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
}

let mi = 0;
let missed = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  let items = null;
  let busy = 0;
  while (!items && mi < MODELS.length) {
    try {
      items = await call(MODELS[mi], batch);
    } catch (err) {
      if (err.status === 400 || err.status === 403) throw err;   // 密钥问题，换模型没用
      if (err.status === 503 && busy < 3) { busy++; await new Promise((r) => setTimeout(r, 5000 * busy)); continue; }
      if (err.status === 429 || err.status === 503 || err.status === 404) {
        console.log(`\n${MODELS[mi]}：${err.status}，换模型`); mi++; busy = 0; continue;
      }
      console.log(`\n本批出错，跳过：${err.message}`);
      items = [];
    }
  }
  if (!items) { console.log("\n⚠ 所有模型都不可用，已停止；过一阵再跑同一条命令即可续上。"); break; }

  const want = new Set(batch);
  for (const it of items) {
    const w = String(it?.w ?? "").trim().toLowerCase();
    const zh = String(it?.zh ?? "").trim();
    if (!want.has(w) || !zh) continue;
    gloss[w] = { ipa: String(it.ipa ?? "").trim(), zh };
    want.delete(w);
  }
  missed += want.size;
  writeFileSync(outFile, JSON.stringify(gloss));
  process.stdout.write(`\r已完成 ${Object.keys(gloss).length} / ${need.length}`);
}
console.log(`\n写入 data/famgloss.json：${Object.keys(gloss).length} 条；本次漏掉 ${missed} 个，重跑可补。`);
