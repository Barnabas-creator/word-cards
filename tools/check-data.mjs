import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { checkDeck } from "../lib/check-deck.mjs";
import { validateManifest, shardName } from "../lib/shard.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// 对照 wordlist.json 查覆盖率：跑到一半夭折的生成会写出更少的卡片，
// 而 manifest 的 total 也跟着变小，光靠 manifest 自洽性是看不出来的。
function checkCoverage(dataDir, cards) {
  const path = join(dataDir, "wordlist.json");
  if (!existsSync(path)) return ["缺少 data/wordlist.json，无法核对卡片覆盖率"];

  const errs = [];
  const wordlist = readJson(path);
  const byWord = new Map(wordlist.map((e) => [String(e.w).toLowerCase(), e]));
  const covered = new Set();

  for (const c of cards) {
    const w = String(c?.w ?? "").toLowerCase();
    covered.add(w);
    const e = byWord.get(w);
    if (!e) {
      errs.push(`卡片 ${c?.w}：不在词表 wordlist.json 里`);
      continue;
    }
    if (c?.lvl !== e.lvl) errs.push(`卡片 ${c?.w}：lvl 是 ${c?.lvl}，词表里是 ${e.lvl}`);
    if (c?.src !== e.src) errs.push(`卡片 ${c?.w}：src 是 ${c?.src}，词表里是 ${e.src}`);
  }

  for (const e of wordlist) {
    if (!covered.has(String(e.w).toLowerCase())) errs.push(`词表里的 ${e.w} 没有对应卡片`);
  }
  return errs;
}

export function collectErrors({ dataDir, wordBasePath, supplementPath }) {
  if (!existsSync(dataDir)) {
    return [`缺少数据目录 ${dataDir}，请先运行 node tools/gen-deck.mjs 生成 deck-*.json 分片`];
  }
  const manifestPath = join(dataDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return [`缺少 ${manifestPath}：deck-*.json 分片还没有生成，请先运行 node tools/gen-deck.mjs`];
  }

  const errs = [];
  const manifest = readJson(manifestPath);
  const fakes = existsSync(join(dataDir, "fakewords.json"))
    ? readJson(join(dataDir, "fakewords.json"))
    : [];

  const files = readdirSync(dataDir).filter((f) => f.startsWith("deck-") && f.endsWith(".json"));
  const onDisk = new Map();
  const cards = [];
  for (const f of files.sort()) {
    const group = readJson(join(dataDir, f));
    onDisk.set(f, group);
    for (const c of group) {
      cards.push(c);
      if (shardName(c.lvl) !== f) errs.push(`卡片 ${c.w}（${c.lvl}）落在了错误的分片 ${f}`);
    }
  }

  errs.push(...checkCoverage(dataDir, cards));
  errs.push(...validateManifest(manifest, onDisk));
  errs.push(...checkDeck({ cards, fakes, wordBase: loadWordBase(wordBasePath, supplementPath) }));
  return errs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errs = collectErrors({
    dataDir: fileURLToPath(new URL("../data/", import.meta.url)),
    wordBasePath: fileURLToPath(new URL("./vendor/words_alpha.txt", import.meta.url)),
    supplementPath: fileURLToPath(new URL("./vendor/words_supplement.txt", import.meta.url)),
  });
  if (errs.length) {
    for (const e of errs) console.error(e);
    console.error(`\n共 ${errs.length} 个问题`);
    process.exit(1);
  }
  console.log("校验通过");
}
