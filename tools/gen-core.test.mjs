import test from "node:test";
import assert from "node:assert/strict";
import { DECK_PROMPT, DECK_SCHEMA, buildDeckRequest, parseDeckResponse, cardsFromResponse }
  from "../lib/gen-core.mjs";

test("DECK_PROMPT 写死硬性规则", () => {
  assert.match(DECK_PROMPT, /8[–-]20/);
  assert.match(DECK_PROMPT, /最多 4 个/);
  assert.match(DECK_PROMPT, /B2/);
});

test("DECK_SCHEMA 把内容字段全列进 required，且不含 lvl 与 src", () => {
  const req = DECK_SCHEMA.items.required;
  assert.deepEqual(req, ["w", "ipa", "pos", "zh", "fam", "ex", "exZh", "conf", "c"]);
  assert.equal("lvl" in DECK_SCHEMA.items.properties, false);
  assert.equal("src" in DECK_SCHEMA.items.properties, false);
});

test("buildDeckRequest 把整批词放进 contents 并要求 JSON 输出", () => {
  const body = buildDeckRequest([{ w: "nation", lvl: "B1", src: "NGSL" }]);
  const text = body.contents[0].parts[0].text;
  assert.match(text, /nation/);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseSchema, DECK_SCHEMA);
});

test("parseDeckResponse 剥出模型返回的 JSON 数组", () => {
  const json = { candidates: [{ content: { parts: [{ text: '[{"w":"nation"}]' }] } }] };
  assert.deepEqual(parseDeckResponse(json), [{ w: "nation" }]);
});

test("parseDeckResponse 在结构不对或不是 JSON 时报错", () => {
  assert.throws(() => parseDeckResponse({}), /结构/);
  assert.throws(() => parseDeckResponse({ candidates: [{ content: { parts: [{ text: "oops" }] } }] }), /JSON/);
});

test("cardsFromResponse 按词形回填 lvl 与 src", () => {
  const items = [{ w: "nation", ipa: "/x/", pos: "n.", zh: "国家", fam: [], ex: "a", exZh: "啊", conf: [], c: ["名词"] }];
  const out = cardsFromResponse(items, [{ w: "nation", lvl: "B1", src: "NGSL" }]);
  assert.equal(out[0].lvl, "B1");
  assert.equal(out[0].src, "NGSL");
});

test("cardsFromResponse 丢掉批次里没点过的词", () => {
  const items = [{ w: "ghost", ipa: "/x/", pos: "n.", zh: "鬼", fam: [], ex: "a", exZh: "啊", conf: [], c: ["名词"] }];
  assert.deepEqual(cardsFromResponse(items, [{ w: "nation", lvl: "B1", src: "NGSL" }]), []);
});

test("cardsFromResponse 用批次的词形覆盖模型返回的词形", () => {
  const items = [{ w: "Nation", ipa: "/x/", pos: "n.", zh: "国家", fam: [], ex: "a", exZh: "啊", conf: [], c: ["名词"] }];
  const out = cardsFromResponse(items, [{ w: "nation", lvl: "B1", src: "NGSL" }]);
  assert.equal(out[0].w, "nation");
});
