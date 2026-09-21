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

test("fam 成员是屈折形而非词典词报错", () => {
  for (const bad of ["nationing", "nationes"]) {
    const errs = checkDeck({ cards: [{ ...card, fam: [bad] }], fakes: [], wordBase });
    assert.ok(errs.some((e) => new RegExp(`fam.*${bad}`).test(e)), `${bad} 应当被拒`);
  }
});

test("fam 成员是词典里的派生词则通过", () => {
  assert.deepEqual(checkDeck({ cards: [{ ...card, fam: ["national"] }], fakes: [], wordBase }), []);
});

test("conf 成员不是真词报错", () => {
  const errs = checkDeck({ cards: [{ ...card, conf: ["natureness"] }], fakes: [], wordBase });
  assert.ok(errs.some((e) => /conf.*natureness/.test(e)));
});

test("conf 成员出现在假词库报错", () => {
  const errs = checkDeck({ cards: [{ ...card, conf: ["nature"] }],
                           fakes: [{ w: "nature", kind: "morph", base: "nation" }], wordBase });
  assert.ok(errs.some((e) => /conf 成员 nature 出现在假词库里/.test(e)));
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

test("中文释义过长报错", () => {
  const longZh = "国".repeat(21);
  assert.ok(checkDeck({ cards: [{ ...card, zh: longZh }], fakes: [], wordBase })
    .some((e) => /过长/.test(e)));
});

test("中文释义混入拉丁字母报错", () => {
  assert.ok(checkDeck({ cards: [{ ...card, zh: "国家abc" }], fakes: [], wordBase })
    .some((e) => /拉丁字母/.test(e)));
});

test("中文释义出现叠词报错", () => {
  assert.ok(checkDeck({ cards: [{ ...card, zh: "好的的很好" }], fakes: [], wordBase })
    .some((e) => /的的/.test(e)));
});

test("短词不误匹配无关词根", () => {
  const runCard = {
    w: "run", ipa: "/rʌn/", pos: "v.", zh: "运行、跑步",
    fam: [],
    ex: "The runway was clear and the plane could take off immediately.",
    exZh: "跑道很清晰，飞机可以立即起飞。",
    conf: [], lvl: "A1", src: "NGSL", c: ["动词"],
  };
  const runWordBase = new Set(["run", "runway"]);
  assert.ok(checkDeck({ cards: [runCard], fakes: [], wordBase: runWordBase })
    .some((e) => /例句未出现/.test(e)));
});

test("inflection studies匹配study", () => {
  const studyCard = {
    w: "study", ipa: "/ˈstʌdi/", pos: "v.", zh: "学习、研究",
    fam: [],
    ex: "She studies hard every day and makes good progress in her academic work.",
    exZh: "她每天认真学习，在学术工作中取得良好进展。",
    conf: [], lvl: "A1", src: "NGSL", c: ["动词"],
  };
  const studyWordBase = new Set(["study", "studies"]);
  assert.deepEqual(checkDeck({ cards: [studyCard], fakes: [], wordBase: studyWordBase }), []);
});

test("逐条 schema 错误一并带出", () => {
  assert.ok(checkDeck({ cards: [{ ...card, lvl: "C1" }], fakes: [], wordBase }).some((e) => /lvl/.test(e)));
});
