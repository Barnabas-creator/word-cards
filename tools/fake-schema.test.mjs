import test from "node:test";
import assert from "node:assert/strict";
import { validateFake, FAKE_KINDS } from "../lib/fake-schema.mjs";

const ok = { w: "nationize", kind: "affix", base: "nation" };

test("合法假词零错误", () => {
  assert.deepEqual(validateFake(ok, "nationize"), []);
});

test("kind 取值受限", () => {
  assert.deepEqual(FAKE_KINDS, ["affix", "morph", "combo"]);
  assert.match(validateFake({ ...ok, kind: "random" }, "x")[0], /kind/);
});

test("缺 base 报错", () => {
  const { base, ...bad } = ok;
  assert.match(validateFake(bad, "x")[0], /base/);
});

test("w 必须是纯小写字母", () => {
  assert.match(validateFake({ ...ok, w: "Nationize" }, "x")[0], /w/);
  assert.match(validateFake({ ...ok, w: "nation ize" }, "x")[0], /w/);
});

test("w 不能等于 base", () => {
  assert.match(validateFake({ ...ok, w: "nation" }, "x")[0], /base/);
});
