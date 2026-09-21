import { LEVELS } from "./card-schema.mjs";

export function shardName(lvl) {
  return `deck-${String(lvl).toLowerCase().replace("+", "plus")}.json`;
}

export function shardCards(cards) {
  const out = new Map();
  for (const lvl of LEVELS) {
    const group = cards.filter((c) => c.lvl === lvl);
    if (group.length) out.set(shardName(lvl), group);
  }
  return out;
}

export function buildManifest(shards, version) {
  const entries = [];
  for (const lvl of LEVELS) {
    const file = shardName(lvl);
    if (shards.has(file)) entries.push({ file, lvl, count: shards.get(file).length });
  }
  return {
    version,
    total: entries.reduce((n, e) => n + e.count, 0),
    shards: entries,
  };
}

export function validateManifest(manifest, shards) {
  const errs = [];
  let total = 0;
  for (const e of manifest?.shards ?? []) {
    const actual = shards.get(e.file);
    if (!actual) {
      errs.push(`manifest 列了 ${e.file}，但分片不存在`);
      continue;
    }
    if (actual.length !== e.count) {
      errs.push(`${e.file}：manifest 的 count 是 ${e.count}，实际 ${actual.length}`);
    }
    total += actual.length;
  }
  for (const file of shards.keys()) {
    if (!(manifest?.shards ?? []).some((e) => e.file === file)) {
      errs.push(`分片 ${file} 没有登记进 manifest`);
    }
  }
  if (manifest?.total !== total) {
    errs.push(`manifest 的 total 是 ${manifest?.total}，实际 ${total}`);
  }
  return errs;
}

// --lvl= 的局部生成只重写自己那几个分片，manifest 必须与旧条目合并，
// 否则一次局部跑会把其他等级的登记整段抹掉。
export function mergeManifest(prev, shards, version) {
  const byFile = new Map((prev?.shards ?? []).map((e) => [e.file, e]));
  for (const e of buildManifest(shards, version).shards) byFile.set(e.file, e);
  const order = LEVELS.map(shardName);
  const entries = [...byFile.values()].sort((a, b) => order.indexOf(a.file) - order.indexOf(b.file));
  return { version, total: entries.reduce((n, e) => n + e.count, 0), shards: entries };
}
