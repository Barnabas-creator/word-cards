import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateFakes, mulberry32 } from "../lib/fake-gen.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

// 固定种子：重新生成必须得到逐字节一致的 fakewords.json
const SEED = 20260920;

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const wordlist = JSON.parse(readFileSync(join(dataDir, "wordlist.json"), "utf8"));
const wordBase = loadWordBase(fileURLToPath(new URL("./vendor/words_alpha.txt", import.meta.url)));

const fakes = generateFakes({ wordlist, wordBase, target: 1200, rng: mulberry32(SEED) });
writeFileSync(join(dataDir, "fakewords.json"), JSON.stringify(fakes));

const byKind = {};
for (const f of fakes) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
console.log(`写入 ${fakes.length} 条假词：`, byKind);
