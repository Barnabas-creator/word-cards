import { isRealWord } from "./wordbase.mjs";

const SUFFIXES = ["ize", "ful", "ment", "ness", "able", "ish", "ive", "ation"];
const PREFIXES = ["un", "re", "dis", "mis", "over", "inter"];
const VOWELS = "aeiou";
const CONSONANTS = "bcdfghjklmnprstvw";

// Legal onsets (2–3 letters)
const LEGAL_ONSETS = new Set([
  "bl", "br", "cl", "cr", "dr", "dw", "fl", "fr", "gl", "gr", "pl", "pr",
  "sc", "sk", "sl", "sm", "sn", "sp", "st", "sw", "tr", "tw",
  "ch", "sh", "th", "wh", "ph", "wr", "kn", "gn", "qu",
  "thr", "shr", "scr", "spl", "spr", "squ", "str"
]);

// Legal codas (2–3 letters)
const LEGAL_CODAS = new Set([
  "ct", "ft", "ld", "lf", "lk", "lm", "lp", "lt", "mp", "nd", "nk", "nt", "pt",
  "rd", "rk", "rl", "rm", "rn", "rp", "rt", "sk", "sp", "st", "xt",
  "ng", "sh", "ch", "th", "ck", "ss", "ll", "ff", "zz",
  "nce", "rth", "nth"
]);

// Derivational suffixes to skip
const DERIVATIONAL_SUFFIXES = [
  "tion", "sion", "ment", "ness", "ence", "ance", "ity", "ive",
  "ary", "ible", "able", "ful", "ize", "ical", "ous"
];

export function affixCandidates(word) {
  // Skip if base already ends with a derivational suffix
  if (DERIVATIONAL_SUFFIXES.some((suf) => word.endsWith(suf))) {
    return [];
  }

  // Skip if appending would double a suffix
  return SUFFIXES.filter((s) => !word.endsWith(s)).map((s) => word + s);
}

export function morphCandidates(word) {
  const out = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const pool = VOWELS.includes(ch) ? VOWELS : CONSONANTS;
    for (const r of pool) {
      if (r === ch) continue;
      const candidate = word.slice(0, i) + r + word.slice(i + 1);

      // Check for legal onset (word-initial consonant cluster)
      if (!isLegalOnset(candidate)) continue;

      // Check for legal coda (word-final consonant cluster)
      if (!isLegalCoda(candidate)) continue;

      out.push(candidate);
    }
  }
  return out;
}

function isLegalOnset(word) {
  // Find the first vowel
  let i = 0;
  while (i < word.length && CONSONANTS.includes(word[i])) i++;
  const onset = word.slice(0, i);

  // Single consonant or vowel-initial is always fine
  if (onset.length <= 1) return true;

  // Multi-consonant onset must be in whitelist
  return LEGAL_ONSETS.has(onset);
}

function isLegalCoda(word) {
  // Find the last vowel
  let i = word.length - 1;
  while (i >= 0 && CONSONANTS.includes(word[i])) i--;
  const coda = word.slice(i + 1);

  // Single consonant or no coda is always fine
  if (coda.length <= 1) return true;

  // Multi-consonant coda must be in whitelist
  return LEGAL_CODAS.has(coda);
}

export function comboCandidates(word) {
  // Skip if base already ends with a derivational suffix
  if (DERIVATIONAL_SUFFIXES.some((suf) => word.endsWith(suf))) {
    return [];
  }

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
