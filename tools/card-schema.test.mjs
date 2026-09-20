import test from "node:test";
import assert from "node:assert/strict";
import { validateCard, LEVELS, SOURCES } from "../lib/card-schema.mjs";

const ok = {
  w: "nation", ipa: "/ˈneɪʃ(ə)n/", pos: "n.", zh: "国家、民族",
  fam: ["national", "nationality", "nationalize", "international"],
  ex: "The nation voted for change last autumn without any real protest.",
  exZh: "去年秋天全国投票支持变革，没有出现真正的抗议。",
  conf: ["nature", "notion"], lvl: "B1", src: "NGSL", c: ["名词"],
};

test("合法卡片零错误", () => {
  assert.deepEqual(validateCard(ok, "nation"), []);
});

test("缺必填字段报错", () => {
  const { zh, ...bad } = ok;
  const errs = validateCard(bad, "x");
  assert.equal(errs.length, 1);
  assert.match(errs[0], /zh/);
});

test("lvl 与 src 取值受限", () => {
  assert.match(validateCard({ ...ok, lvl: "C1" }, "x")[0], /lvl/);
  assert.match(validateCard({ ...ok, src: "COCA" }, "x")[0], /src/);
  assert.deepEqual(LEVELS, ["A1", "A2", "B1", "B2", "B2+"]);
  assert.deepEqual(SOURCES, ["NGSL", "NAWL", "DET"]);
});

test("ipa 必须被斜杠包裹", () => {
  assert.match(validateCard({ ...ok, ipa: "ˈneɪʃən" }, "x")[0], /ipa/);
});

test("fam 最多 4 个、conf 最多 3 个、都不能为空串", () => {
  assert.match(validateCard({ ...ok, fam: [...ok.fam, "nationhood"] }, "x")[0], /fam/);
  assert.match(validateCard({ ...ok, conf: ["a", "b", "c", "d"] }, "x")[0], /conf/);
  assert.match(validateCard({ ...ok, fam: ["national", ""] }, "x")[0], /fam/);
});

test("fam 为空数组是合法的（有些词没有派生形）", () => {
  assert.deepEqual(validateCard({ ...ok, fam: [] }, "x"), []);
});

test("c 至少一个标签且取值受限", () => {
  assert.match(validateCard({ ...ok, c: [] }, "x")[0], /c/);
  assert.match(validateCard({ ...ok, c: ["拟声词"] }, "x")[0], /c/);
});
