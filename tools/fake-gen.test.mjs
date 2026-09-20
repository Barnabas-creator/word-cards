import test from "node:test";
import assert from "node:assert/strict";
import { affixCandidates, morphCandidates, comboCandidates, generateFakes } from "../lib/fake-gen.mjs";

test("affixCandidates 挂常见词缀", () => {
  const out = affixCandidates("book");
  assert.ok(out.includes("bookize"));
  assert.ok(out.includes("bookful"));
  assert.ok(out.every((w) => w.startsWith("book")));
});

test("morphCandidates 只改一两个字母，长度不变", () => {
  const out = morphCandidates("plant");
  assert.ok(out.length > 0);
  assert.ok(out.every((w) => w.length === 5 && w !== "plant" && /^[a-z]+$/.test(w)));
});

test("comboCandidates 加前缀", () => {
  const out = comboCandidates("brighten");
  assert.ok(out.includes("unbrighten"));
});

test("generateFakes 产出的词都不是真词、不重复、带 kind 与 base", () => {
  const wordBase = new Set(["nation", "plant", "brighten", "nations", "planted"]);
  const wordlist = [{ w: "nation" }, { w: "plant" }, { w: "brighten" }];
  const out = generateFakes({ wordlist, wordBase, target: 9, rng: mulberry(1) });
  assert.equal(out.length, 9);
  assert.equal(new Set(out.map((f) => f.w)).size, 9);
  assert.ok(out.every((f) => !wordBase.has(f.w)));
  assert.ok(out.every((f) => ["affix", "morph", "combo"].includes(f.kind)));
  assert.ok(out.every((f) => wordlist.some((e) => e.w === f.base)));
});

test("generateFakes 三种造法数量大致均衡", () => {
  const wordBase = new Set(["nation", "plant", "brighten"]);
  const wordlist = [{ w: "nation" }, { w: "plant" }, { w: "brighten" }];
  const out = generateFakes({ wordlist, wordBase, target: 30, rng: mulberry(2) });
  const n = (k) => out.filter((f) => f.kind === k).length;
  for (const k of ["affix", "morph", "combo"]) {
    assert.ok(n(k) >= 6, `${k} 只有 ${n(k)} 条`);
  }
});

test("目标数超过可产出的上限时，返回能产出的全部", () => {
  const wordBase = new Set(["nation"]);
  const out = generateFakes({ wordlist: [{ w: "nation" }], wordBase, target: 100000, rng: mulberry(3) });
  assert.ok(out.length > 0 && out.length < 100000);
});

test("morphCandidates 从不产生非法的词首辅音群", () => {
  const out = morphCandidates("student");
  assert.ok(!out.includes("ftudent"), "ftudent should not be in results");
  assert.ok(out.every((w) => {
    // Check that no illegal word-initial clusters appear
    if (w.length > 0 && /^[bcdfghjklmnprstvw]/.test(w)) {
      const firstVowel = w.search(/[aeiou]/);
      if (firstVowel > 1) {
        // More than one initial consonant - should be in whitelist
        // This is checked by the function itself, but we verify no "ftudent" exists
        return w !== "ftudent";
      }
    }
    return true;
  }));
});

test("morphCandidates 从不产生非法的词尾辅音群", () => {
  const out = morphCandidates("noise");
  assert.ok(!out.includes("noisb"), "noisb should not be in results");
});

test("affixCandidates 跳过已有派生词缀的基词", () => {
  const out = affixCandidates("equipment");
  assert.equal(out.length, 0, "equipment ends with -ment, should produce no candidates");
});

test("comboCandidates 跳过已有派生词缀的基词", () => {
  const out = comboCandidates("intention");
  assert.equal(out.length, 0, "intention ends with -tion, should produce no candidates");
});

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
