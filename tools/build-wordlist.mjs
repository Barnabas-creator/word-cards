import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseBands, parseFlat, mergeSources } from "../lib/wordlist.mjs";

const read = (u) => JSON.parse(readFileSync(new URL(u, import.meta.url), "utf8"));

const ngsl = parseBands(read("./vendor/ngsl.json"));
const nawl = parseFlat(read("./vendor/nawl.json"));
const detUrl = new URL("./det-supplement.txt", import.meta.url);
const det = existsSync(detUrl)
  ? readFileSync(detUrl, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
  : [];

const list = mergeSources({ ngsl, nawl, det });
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../data/wordlist.json", import.meta.url), JSON.stringify(list));

const byLvl = {};
for (const e of list) byLvl[e.lvl] = (byLvl[e.lvl] ?? 0) + 1;
console.log(`共 ${list.length} 词：`, byLvl);
