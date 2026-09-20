import test from "node:test";
import assert from "node:assert/strict";
import { shardName, shardCards, buildManifest, validateManifest } from "../lib/shard.mjs";

const mk = (w, lvl) => ({ w, lvl });

test("shardName 把 B2+ 写成 b2plus，其余转小写", () => {
  assert.equal(shardName("A1"), "deck-a1.json");
  assert.equal(shardName("B2+"), "deck-b2plus.json");
});

test("shardCards 按等级分组，组内保持原顺序", () => {
  const shards = shardCards([mk("a", "A1"), mk("b", "B2+"), mk("c", "A1")]);
  assert.deepEqual([...shards.keys()], ["deck-a1.json", "deck-b2plus.json"]);
  assert.deepEqual(shards.get("deck-a1.json").map((c) => c.w), ["a", "c"]);
});

test("buildManifest 记录每片词数与总数", () => {
  const shards = shardCards([mk("a", "A1"), mk("b", "A1"), mk("c", "B1")]);
  const m = buildManifest(shards, "v1");
  assert.equal(m.version, "v1");
  assert.equal(m.total, 3);
  assert.deepEqual(m.shards, [
    { file: "deck-a1.json", lvl: "A1", count: 2 },
    { file: "deck-b1.json", lvl: "B1", count: 1 },
  ]);
});

test("validateManifest 抓词数对不上", () => {
  const shards = shardCards([mk("a", "A1")]);
  const m = buildManifest(shards, "v1");
  m.shards[0].count = 99;
  assert.match(validateManifest(m, shards)[0], /count/);
});

test("validateManifest 抓分片文件缺失", () => {
  const shards = shardCards([mk("a", "A1"), mk("c", "B1")]);
  const m = buildManifest(shards, "v1");
  shards.delete("deck-b1.json");
  assert.ok(validateManifest(m, shards).some((e) => /deck-b1\.json/.test(e)));
});

test("合法 manifest 零错误", () => {
  const shards = shardCards([mk("a", "A1"), mk("c", "B1")]);
  assert.deepEqual(validateManifest(buildManifest(shards, "v1"), shards), []);
});
