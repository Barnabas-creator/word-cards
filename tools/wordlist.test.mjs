import test from "node:test";
import assert from "node:assert/strict";
import { parseBands, parseFlat, assignLevel, mergeSources } from "../lib/wordlist.mjs";

test("parseBands 摊平三个频段，记下频段号", () => {
  const json = { "1000": { be: [], and: [] }, "2000": { nation: [] }, "3000": { cognitive: [] } };
  assert.deepEqual(parseBands(json), [
    { w: "be", band: 1000 }, { w: "and", band: 1000 },
    { w: "nation", band: 2000 }, { w: "cognitive", band: 3000 },
  ]);
});

test("parseBands 归一化大小写", () => {
  assert.deepEqual(parseBands({ "1000": { Nation: [] } }), [{ w: "nation", band: 1000 }]);
});

test("parseFlat 取词头，band 记 0", () => {
  assert.deepEqual(parseFlat({ abdominal: [], absorb: ["absorbs"] }), [
    { w: "abdominal", band: 0 }, { w: "absorb", band: 0 },
  ]);
});

test("assignLevel 按 NGSL 频段分档", () => {
  assert.equal(assignLevel(1000, "NGSL"), "A1");
  assert.equal(assignLevel(2000, "NGSL"), "A2");
  assert.equal(assignLevel(3000, "NGSL"), "B1");
});

test("assignLevel 把 NAWL 归到 B2、DET 补充归到 B2+", () => {
  assert.equal(assignLevel(0, "NAWL"), "B2");
  assert.equal(assignLevel(0, "DET"), "B2+");
});

test("assignLevel 遇到未知频段抛错，不静默兜底", () => {
  assert.throws(() => assignLevel(4000, "NGSL"), /频段/);
});

test("mergeSources 去重：同一个词优先保留先出现的来源", () => {
  const out = mergeSources({
    ngsl: [{ w: "nation", band: 2000 }],
    nawl: [{ w: "nation", band: 0 }, { w: "cognitive", band: 0 }],
    det: ["nation", "bespoke"],
  });
  assert.deepEqual(out, [
    { w: "nation", lvl: "A2", src: "NGSL" },
    { w: "cognitive", lvl: "B2", src: "NAWL" },
    { w: "bespoke", lvl: "B2+", src: "DET" },
  ]);
});

test("mergeSources 忽略 det 里的空行与前后空白", () => {
  const out = mergeSources({ ngsl: [], nawl: [], det: ["  bespoke  ", "", "   "] });
  assert.deepEqual(out, [{ w: "bespoke", lvl: "B2+", src: "DET" }]);
});
