import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateFakes } from "../lib/fake-gen.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

const dataDir = new URL("../data/", import.meta.url).pathname;
const wordlist = JSON.parse(readFileSync(join(dataDir, "wordlist.json"), "utf8"));
const wordBase = loadWordBase(new URL("./vendor/words_alpha.txt", import.meta.url).pathname);

const fakes = generateFakes({ wordlist, wordBase, target: 1200 });
writeFileSync(join(dataDir, "fakewords.json"), JSON.stringify(fakes));

const byKind = {};
for (const f of fakes) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
console.log(`写入 ${fakes.length} 条假词：`, byKind);
