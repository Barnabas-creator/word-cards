import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCards } from "../lib/gen-runner.mjs";
import { shardCards, buildManifest, mergeManifest } from "../lib/shard.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("需要环境变量 GEMINI_API_KEY");

// 模型会被下线（gemini-2.5-flash 已对新用户关闭），所以允许用环境变量覆盖。
// 可用列表：curl -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function callModel(body) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
let wordlist = JSON.parse(readFileSync(join(dataDir, "wordlist.json"), "utf8"));

const only = process.argv.find((a) => a.startsWith("--lvl="));
if (only) wordlist = wordlist.filter((e) => e.lvl === only.slice("--lvl=".length));

const wordBase = loadWordBase(fileURLToPath(new URL("./vendor/words_alpha.txt", import.meta.url)));

const { cards, failed } = await generateCards({
  wordlist, callModel, wordBase,
  onProgress: ({ done, failed }) => process.stdout.write(`\r已生成 ${done} / ${wordlist.length}，失败 ${failed}`),
});
console.log();

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

mkdirSync(dataDir, { recursive: true });
const shards = shardCards(cards);
for (const [file, group] of shards) writeFileSync(join(dataDir, file), JSON.stringify(group));

const manifestPath = join(dataDir, "manifest.json");
const failedPath = join(dataDir, "failed.json");

if (only) {
  // 局部跑：manifest 与 failed 都与已有内容合并，不整份覆盖
  const manifest = mergeManifest(readJson(manifestPath, { shards: [] }), shards, "v1");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const inScope = new Set(wordlist.map((e) => String(e.w).toLowerCase()));
  const kept = readJson(failedPath, []).filter((e) => !inScope.has(String(e.w).toLowerCase()));
  writeFileSync(failedPath, JSON.stringify([...kept, ...failed], null, 2));
  console.log(`写入 ${shards.size} 个分片（${only.slice("--lvl=".length)} 局部跑，manifest 与 failed 已合并），失败 ${failed.length} 条`);
} else {
  writeFileSync(manifestPath, JSON.stringify(buildManifest(shards, "v1"), null, 2));
  writeFileSync(failedPath, JSON.stringify(failed, null, 2));
  console.log(`写入 ${shards.size} 个分片，失败 ${failed.length} 条，明细见 data/failed.json`);
}
