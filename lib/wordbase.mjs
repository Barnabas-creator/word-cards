import { readFileSync } from "node:fs";

export function loadWordBase(path) {
  const set = new Set();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const w = line.trim().toLowerCase();
    if (w) set.add(w);
  }
  return set;
}

// 严格的词典成员判定：词族成员／易混词必须是词典里实打实的词，不接受屈折形
export function isExactWord(base, word) {
  const w = String(word).trim().toLowerCase();
  return w !== "" && base.has(w);
}
