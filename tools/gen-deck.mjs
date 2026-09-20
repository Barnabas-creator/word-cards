import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateCards } from "../lib/gen-runner.mjs";
import { shardCards, buildManifest } from "../lib/shard.mjs";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("需要环境变量 GEMINI_API_KEY");

const MODEL = "gemini-2.5-flash";
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

const dataDir = new URL("../data/", import.meta.url).pathname;
let wordlist = JSON.parse(readFileSync(join(dataDir, "wordlist.json"), "utf8"));

const only = process.argv.find((a) => a.startsWith("--lvl="));
if (only) wordlist = wordlist.filter((e) => e.lvl === only.slice("--lvl=".length));

const { cards, failed } = await generateCards({
  wordlist, callModel,
  onProgress: ({ done, failed }) => process.stdout.write(`\r已生成 ${done} / ${wordlist.length}，失败 ${failed}`),
});
console.log();

mkdirSync(dataDir, { recursive: true });
const shards = shardCards(cards);
for (const [file, group] of shards) writeFileSync(join(dataDir, file), JSON.stringify(group));
writeFileSync(join(dataDir, "manifest.json"), JSON.stringify(buildManifest(shards, "v1"), null, 2));
writeFileSync(join(dataDir, "failed.json"), JSON.stringify(failed, null, 2));
console.log(`写入 ${shards.size} 个分片，失败 ${failed.length} 条，明细见 data/failed.json`);
