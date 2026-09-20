import { POS_TAGS } from "./card-schema.mjs";

export const DECK_PROMPT = `你是一个英语—中文双语词典编辑，为备考 Duolingo English Test 的中文母语学习者编写单词卡。

给定一批英语词，为每个词输出一条卡片，严格遵守：

- ipa：英式或美式音标均可，必须用斜杠包裹，例如 /ˈneɪʃ(ə)n/
- pos：英文缩写词性，例如 n. / v. / adj. / adv. / prep.
- zh：中文释义，不超过 20 个汉字，用顿号分隔多个义项。写地道中文，不要机翻腔
- fam：同一词族的派生词，最多 4 个，按常用度排序。必须是真实存在的英语词。没有派生词就给空数组
- ex：一个英语例句，长度 8–20 个词，难度控制在 CEFR B2，必须包含该词或它的某个派生形
- exZh：例句的中文翻译，自然流畅
- conf：形近或义近的易混词，最多 3 个，必须是真实英语词。没有就给空数组
- c：中文词性标签，只能从这些里选：${POS_TAGS.join(" / ")}

只输出 JSON 数组，不要任何解释文字。`;

export const DECK_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      w: { type: "string" },
      ipa: { type: "string" },
      pos: { type: "string" },
      zh: { type: "string" },
      fam: { type: "array", items: { type: "string" } },
      ex: { type: "string" },
      exZh: { type: "string" },
      conf: { type: "array", items: { type: "string" } },
      c: { type: "array", items: { type: "string" } },
    },
    required: ["w", "ipa", "pos", "zh", "fam", "ex", "exZh", "conf", "c"],
  },
};

export function buildDeckRequest(batch) {
  const words = batch.map((e) => e.w).join("\n");
  return {
    contents: [{ parts: [{ text: `${DECK_PROMPT}\n\n这批词：\n${words}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DECK_SCHEMA,
      temperature: 0.4,
    },
  };
}

export function parseDeckResponse(json) {
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini 响应结构不对：找不到 text");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Gemini 返回的不是合法 JSON");
  }
  if (!Array.isArray(data)) throw new Error("Gemini 返回的 JSON 不是数组");
  return data;
}

export function cardsFromResponse(items, batch) {
  const meta = new Map(batch.map((e) => [e.w.toLowerCase(), e]));
  const out = [];
  for (const item of items) {
    const m = meta.get(String(item?.w ?? "").toLowerCase());
    if (!m) continue;
    out.push({ ...item, w: m.w, lvl: m.lvl, src: m.src });
  }
  return out;
}
