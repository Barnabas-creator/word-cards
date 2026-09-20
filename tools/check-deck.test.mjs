import test from "node:test";
import assert from "node:assert/strict";
import { checkDeck } from "../lib/check-deck.mjs";

const wordBase = new Set(["nation", "national", "nature", "plant", "run", "brighten"]);

const card = {
  w: "nation", ipa: "/ˈneɪʃ(ə)n/", pos: "n.", zh: "国家、民族",
  fam: ["national"],
  ex: "The nation voted for change last autumn without any real protest.",
  exZh: "去年秋天全国投票支持变革，没有出现真正的抗议。",
  conf: ["nature"], lvl: "B1", src: "NGSL", c: ["名词"],
};
const fake = { w: "nationize", kind: "affix", base: "nation" };

test("合法组合零错误", () => {
  assert.deepEqual(checkDeck({ cards: [card], fakes: [fake], wordBase }), []);
});

test("真词重复报错", () => {
  const errs = checkDeck({ cards: [card, card], fakes: [], wordBase });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /重复/);
});

test("真词库与假词库相交报错", () => {
  const errs = checkDeck({ cards: [card], fakes: [{ w: "nation", kind: "affix", base: "nations" }], wordBase });
  assert.ok(errs.some((e) => /交集/.test(e)));
});

test("fam 成员不是真词报错", () => {
  const errs = checkDeck({ cards: [{ ...card, fam: ["nationhood"] }], fakes: [], wordBase });
  assert.ok(errs.some((e) => /fam.*nationhood/.test(e)));
});

test("fam 成员出现在假词库报错", () => {
  const errs = checkDeck({ cards: [{ ...card, fam: ["national"] }],
                           fakes: [{ w: "national", kind: "affix", base: "nation" }], wordBase });
  assert.ok(errs.some((e) => /假词/.test(e)));
});

test("假词其实是真词报错", () => {
  const errs = checkDeck({ cards: [], fakes: [{ w: "plant", kind: "morph", base: "plan" }], wordBase });
  assert.ok(errs.some((e) => /真词/.test(e)));
});

test("例句词数越界报错", () => {
  const short = { ...card, ex: "The nation voted." };
  assert.ok(checkDeck({ cards: [short], fakes: [], wordBase }).some((e) => /词数/.test(e)));
});

test("例句没提到词头或其派生形报错", () => {
  const off = { ...card, ex: "They walked along the river bank for nearly two hours." };
  assert.ok(checkDeck({ cards: [off], fakes: [], wordBase }).some((e) => /例句未出现/.test(e)));
});

test("例句用派生形也算提到", () => {
  const der = { ...card, ex: "The national team trained hard before the final match began." };
  assert.deepEqual(checkDeck({ cards: [der], fakes: [], wordBase }), []);
});

test("中文释义过长或含机翻腔报错", () => {
  assert.ok(checkDeck({ cards: [{ ...card, zh: "进行了一个国家的行为" }], fakes: [], wordBase })
    .some((e) => /机翻/.test(e)));
});

test("逐条 schema 错误一并带出", () => {
  assert.ok(checkDeck({ cards: [{ ...card, lvl: "C1" }], fakes: [], wordBase }).some((e) => /lvl/.test(e)));
});
