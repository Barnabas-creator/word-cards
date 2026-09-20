import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkDeck } from "../lib/check-deck.mjs";
import { validateManifest, shardName } from "../lib/shard.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function collectErrors({ dataDir, wordBasePath }) {
  const errs = [];
  const manifest = readJson(join(dataDir, "manifest.json"));
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

  errs.push(...validateManifest(manifest, onDisk));
  errs.push(...checkDeck({ cards, fakes, wordBase: loadWordBase(wordBasePath) }));
  return errs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errs = collectErrors({
    dataDir: new URL("../data/", import.meta.url).pathname,
    wordBasePath: new URL("./vendor/words_alpha.txt", import.meta.url).pathname,
  });
  if (errs.length) {
    for (const e of errs) console.error(e);
    console.error(`\n共 ${errs.length} 个问题`);
    process.exit(1);
  }
  console.log("校验通过");
}
