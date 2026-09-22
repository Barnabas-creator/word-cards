import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCards } from "../lib/gen-runner.mjs";
import { shardCards, buildManifest } from "../lib/shard.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

// fetch 的连接错误有时在请求结束之后才冒出来，成为未处理的 promise rejection。
// Node 22 默认直接退进程——那会把这一轮已经生成的卡片全部丢掉。记下来，继续跑。
process.on("unhandledRejection", (err) => {
  console.error("\n⚠ 忽略一个未处理的异步错误：", String(err?.message ?? err).slice(0, 200));
});

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
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

let wordlist = JSON.parse(readFileSync(join(dataDir, "wordlist.json"), "utf8"));

const only = process.argv.find((a) => a.startsWith("--lvl="));
const lvl = only ? only.slice("--lvl=".length) : null;
if (lvl) wordlist = wordlist.filter((e) => e.lvl === lvl);

// 续跑：已经有卡片的词跳过。免费层每天配额有限，重做已完成的词等于白烧额度。
// --redo 可以强制重做（改了提示词、想整体刷新时用）。
const redo = process.argv.includes("--redo");
const existingByFile = new Map();
for (const e of readJson(join(dataDir, "manifest.json"), { shards: [] }).shards ?? []) {
  existingByFile.set(e.file, readJson(join(dataDir, e.file), []));
}
const done = new Set(
  [...existingByFile.values()].flat().map((c) => String(c.w).toLowerCase()),
);
const totalInScope = wordlist.length;
if (!redo) wordlist = wordlist.filter((e) => !done.has(String(e.w).toLowerCase()));

if (wordlist.length === 0) {
  console.log(`${lvl ?? "全量"} 范围内 ${totalInScope} 个词已全部生成，无需续跑。`);
  process.exit(0);
}
console.log(`本次待生成 ${wordlist.length} 词（范围内共 ${totalInScope}，已完成 ${totalInScope - wordlist.length}）`);

// 两种情况立刻停手，交给外层换模型：
// - 429 每日配额用尽：再跑也只是刷 429
// - 503 过载：模型忙的时候硬冲，每批退避一秒试两次就判失败，会把几百个词成批打进
//   failed，还白白消耗请求数。换个不忙的模型，过一阵再回来轮
const quotaExhausted = (err) => {
  const m = String(err?.message ?? err);
  if (/HTTP 429/.test(m) && /PerDay|per day|RESOURCE_EXHAUSTED/i.test(m)) return true;
  if (/HTTP 503/.test(m)) return true;
  return false;
};

const wordBase = loadWordBase(fileURLToPath(new URL("./vendor/words_alpha.txt", import.meta.url)));

// 免费层按「请求数」限额，不按词数。批次越大，同样的配额能出越多卡片。
// 但批次太大模型容易漏词，50 是实测过的折中。
const batchArg = process.argv.find((a) => a.startsWith("--batch="));
const batchSize = batchArg ? Number(batchArg.slice("--batch=".length)) : 20;

const { cards, failed, stopped } = await generateCards({
  wordlist, callModel, wordBase, batchSize,
  stopOnError: quotaExhausted,
  onProgress: ({ done, failed }) => process.stdout.write(`\r已生成 ${done} / ${wordlist.length}，失败 ${failed}`),
});
console.log();
if (stopped) console.log("⚠ 模型过载或今日配额已用尽，已停止。换个模型或过一阵再跑同一条命令即可从断点续上。");

mkdirSync(dataDir, { recursive: true });

// 分片必须与已有卡片合并：局部跑只生成了一部分，整份覆盖会抹掉之前几天的成果
const shards = shardCards(cards);
for (const [file, group] of shards) {
  const prev = existingByFile.get(file) ?? readJson(join(dataDir, file), []);
  const merged = new Map(prev.map((c) => [String(c.w).toLowerCase(), c]));
  for (const c of group) merged.set(String(c.w).toLowerCase(), c);
  const out = [...merged.values()];
  shards.set(file, out);
  writeFileSync(join(dataDir, file), JSON.stringify(out));
}
// 本次没碰到的旧分片也要留在 manifest 里
for (const [file, group] of existingByFile) if (!shards.has(file)) shards.set(file, group);

const manifestPath = join(dataDir, "manifest.json");
const failedPath = join(dataDir, "failed.json");

// shards 现在总是承载「全部已知卡片」，所以 manifest 直接按它重建
writeFileSync(manifestPath, JSON.stringify(buildManifest(shards, "v1"), null, 2));

// failed 只替换本次尝试过的词，其余保留
const attempted = new Set(wordlist.map((e) => String(e.w).toLowerCase()));
const kept = readJson(failedPath, []).filter((e) => !attempted.has(String(e.w).toLowerCase()));
writeFileSync(failedPath, JSON.stringify([...kept, ...failed], null, 2));

const total = [...shards.values()].reduce((n, g) => n + g.length, 0);
console.log(`已写入 ${shards.size} 个分片，累计 ${total} 张卡片；本次失败 ${failed.length} 条，明细见 data/failed.json`);
