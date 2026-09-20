import { readFileSync } from "node:fs";

export function loadWordBase(path) {
  const set = new Set();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const w = line.trim().toLowerCase();
    if (w) set.add(w);
  }
  return set;
}

const SUFFIXES = ["s", "es", "ed", "ing"];

export function isRealWord(base, word) {
  const w = String(word).trim().toLowerCase();
  if (!w) return false;
  if (base.has(w)) return true;
  for (const suf of SUFFIXES) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    if (base.has(stem)) return true;
    if (base.has(stem + "e")) return true;            // plant/planting 之外的 hope/hoping
    if (/(.)\1$/.test(stem) && base.has(stem.slice(0, -1))) return true;  // stopped/stopping
    if (stem.endsWith("i") && base.has(stem.slice(0, -1) + "y")) return true;  // studies
  }
  return false;
}
