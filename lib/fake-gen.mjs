import { isRealWord } from "./wordbase.mjs";

const SUFFIXES = ["ize", "ful", "ment", "ness", "able", "ish", "ive", "ation"];
const PREFIXES = ["un", "re", "dis", "mis", "over", "inter"];
const VOWELS = "aeiou";
const CONSONANTS = "bcdfghjklmnprstvw";

export function affixCandidates(word) {
  return SUFFIXES.map((s) => word + s);
}

export function morphCandidates(word) {
  const out = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const pool = VOWELS.includes(ch) ? VOWELS : CONSONANTS;
    for (const r of pool) {
      if (r === ch) continue;
      out.push(word.slice(0, i) + r + word.slice(i + 1));
    }
  }
  return out;
}

export function comboCandidates(word) {
  return PREFIXES.map((p) => p + word);
}

const MAKERS = [
  ["affix", affixCandidates],
  ["morph", morphCandidates],
  ["combo", comboCandidates],
];

export function generateFakes({ wordlist, wordBase, target, rng = Math.random }) {
  const out = [];
  const taken = new Set();

  // 三种造法轮流取，保证数量均衡
  const pools = MAKERS.map(([kind, make]) => {
    const items = [];
    for (const e of wordlist) {
      for (const w of make(e.w)) items.push({ w, kind, base: e.w });
    }
    // 用注入的 rng 洗牌，保证可复现
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  });

  let exhausted = 0;
  const cursor = [0, 0, 0];
  while (out.length < target && exhausted < pools.length) {
    exhausted = 0;
    for (let p = 0; p < pools.length; p++) {
      if (out.length >= target) break;
      let picked = false;
      while (cursor[p] < pools[p].length) {
        const cand = pools[p][cursor[p]++];
        if (taken.has(cand.w)) continue;
        if (!/^[a-z]+$/.test(cand.w)) continue;
        if (isRealWord(wordBase, cand.w)) continue;
        taken.add(cand.w);
        out.push(cand);
        picked = true;
        break;
      }
      if (!picked) exhausted++;
    }
  }
  return out;
}
