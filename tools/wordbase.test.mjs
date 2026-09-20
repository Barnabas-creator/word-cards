import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWordBase, isRealWord } from "../lib/wordbase.mjs";

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
