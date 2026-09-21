import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWordBase, isExactWord } from "../lib/wordbase.mjs";
import { isRealWord, wordForms } from "../lib/inflect.mjs";

const p = join(tmpdir(), `wb-${process.pid}.txt`);
writeFileSync(p, "nation\nnational\nplant\nbrighten\n");
const base = loadWordBase(p);

test("loadWordBase 读成小写集合", () => {
  assert.equal(base.size, 4);
  assert.ok(base.has("nation"));
});

test("isRealWord 命中原形，忽略大小写与空白", () => {
  assert.ok(isRealWord(base, " Nation "));
  assert.ok(isRealWord(base, "plant"));
});

test("isRealWord 容忍常规屈折", () => {
  assert.ok(isRealWord(base, "nations"));
  assert.ok(isRealWord(base, "planted"));
  assert.ok(isRealWord(base, "planting"));
});

test("isRealWord 对造出来的假词返回 false", () => {
  assert.equal(isRealWord(base, "nationize"), false);
  assert.equal(isRealWord(base, "plaunt"), false);
  assert.equal(isRealWord(base, "unbrighten"), false);
});

test("wordForms 现在无条件加 -es（宽松是故意的，召回优先于精确）", () => {
  assert.ok(wordForms("box").has("boxes"));
  assert.ok(wordForms("watch").has("watches"));
  assert.ok(wordForms("travel").has("traveles")); // 非词，但只用于召回判定，无害
});

test("wordForms 处理词尾哑 e", () => {
  const f = wordForms("hope");
  assert.ok(f.has("hoped"));
  assert.ok(f.has("hoping"));
});

test("wordForms 对辅音结尾的词都生成双写变体，含多音节词；w/x/y 结尾除外", () => {
  assert.ok(wordForms("stop").has("stopped"));
  assert.ok(wordForms("stop").has("stopping"));
  assert.ok(wordForms("visit").has("visitted")); // 非词，但只用于召回判定，无害
  assert.ok(wordForms("travel").has("travelled"));
  assert.equal(wordForms("play").has("playyed"), false);
});

test("wordForms 修复漏生成的常规派生形（回归测试）", () => {
  assert.ok(wordForms("go").has("goes"));
  assert.ok(wordForms("do").has("does"));
  assert.ok(wordForms("begin").has("beginning"));
  assert.ok(wordForms("admit").has("admitted"));
  assert.ok(wordForms("study").has("studies"));
  assert.ok(wordForms("hope").has("hoping"));
});

test("wordForms 只在辅音 + y 时把 y 变成 i", () => {
  assert.ok(wordForms("study").has("studies"));
  assert.ok(wordForms("study").has("studied"));
  assert.equal(wordForms("play").has("plaies"), false);
  assert.equal(wordForms("play").has("plaied"), false);
});

test("isExactWord 不容忍屈折形", () => {
  assert.ok(isExactWord(base, "National"));
  assert.equal(isExactWord(base, "nationing"), false);
  assert.equal(isExactWord(base, "nations"), false);
});
