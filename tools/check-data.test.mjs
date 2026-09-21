import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectErrors } from "./check-data.mjs";

const card = {
  w: "nation", ipa: "/ˈneɪʃ(ə)n/", pos: "n.", zh: "国家、民族", fam: ["national"],
  ex: "The nation voted for change last autumn without any real protest.",
  exZh: "去年秋天全国投票支持变革，没有出现真正的抗议。",
  conf: ["nature"], lvl: "B1", src: "NGSL", c: ["名词"],
};

const wordlist = [{ w: "nation", lvl: "B1", src: "NGSL" }];

function fixture({ cards = [card], fakes = [{ w: "nationize", kind: "affix", base: "nation" }],
                   manifest, words = wordlist, withWordlist = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wc-"));
  if (withWordlist) writeFileSync(join(dir, "wordlist.json"), JSON.stringify(words));
  writeFileSync(join(dir, "deck-b1.json"), JSON.stringify(cards));
  writeFileSync(join(dir, "fakewords.json"), JSON.stringify(fakes));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest ?? {
    version: "v1", total: cards.length,
    shards: [{ file: "deck-b1.json", lvl: "B1", count: cards.length }],
  }));
  const wb = join(dir, "wb.txt");
  writeFileSync(wb, "nation\nnational\nnature\n");
  return { dataDir: dir, wordBasePath: wb };
}

test("干净的数据目录零错误", () => {
  assert.deepEqual(collectErrors(fixture()), []);
});

test("卡片有问题时报出来", () => {
  const errs = collectErrors(fixture({ cards: [{ ...card, lvl: "C1" }] }));
  assert.ok(errs.some((e) => /lvl/.test(e)));
});

test("manifest 对不上时报出来", () => {
  const errs = collectErrors(fixture({
    manifest: { version: "v1", total: 9, shards: [{ file: "deck-b1.json", lvl: "B1", count: 9 }] },
  }));
  assert.ok(errs.some((e) => /count/.test(e)));
});

test("卡片落在错误的分片里报出来", () => {
  const errs = collectErrors(fixture({ cards: [{ ...card, lvl: "A1" }] }));
  assert.ok(errs.some((e) => /分片/.test(e)));
});

test("词表里的词没有卡片时报出来", () => {
  const errs = collectErrors(fixture({
    words: [...wordlist, { w: "nature", lvl: "B1", src: "NGSL" }],
  }));
  assert.ok(errs.some((e) => /词表里的 nature 没有对应卡片/.test(e)));
});

test("卡片不在词表里时报出来", () => {
  const errs = collectErrors(fixture({ words: [] }));
  assert.ok(errs.some((e) => /卡片 nation：不在词表/.test(e)));
});

test("卡片的 lvl 与词表不一致时报出来", () => {
  const errs = collectErrors(fixture({ words: [{ w: "nation", lvl: "A1", src: "NGSL" }] }));
  assert.ok(errs.some((e) => /lvl 是 B1，词表里是 A1/.test(e)));
});

test("卡片的 src 与词表不一致时报出来", () => {
  const errs = collectErrors(fixture({ words: [{ w: "nation", lvl: "B1", src: "NAWL" }] }));
  assert.ok(errs.some((e) => /src 是 NGSL，词表里是 NAWL/.test(e)));
});

test("词表缺失本身就是错误", () => {
  const errs = collectErrors(fixture({ withWordlist: false }));
  assert.ok(errs.some((e) => /缺少 data\/wordlist\.json/.test(e)));
});
