// 英语屈折规则的唯一出处：生成形（wordForms）与容忍判定（isRealWord）都放在这里，
// 避免两套规则各自演化出不一致的结论。

const VOWELS = "aeiou";
const isVowel = (ch) => typeof ch === "string" && VOWELS.includes(ch);

// 结尾是辅音就生成双写变体：admit→admitted、begin→beginning、travel→travelled
// 这类多音节动词也要覆盖到。排除 w/x/y 结尾（play 不生成 playyed）。
function endsInConsonant(w) {
  if (w.length < 2) return false;
  const last = w.at(-1);
  if (!/^[a-z]$/.test(last) || "wxy".includes(last)) return false;
  return !isVowel(last);
}

// 给词头生成常规屈折形，用于判定例句里是否出现了这个词。
// 这里故意宽松过头：唯一的调用方 exMentions 只做「例句里出现没出现」的召回判定，
// 生成集合里混入几个不存在的词形是无害的（假词永远不会出现在例句里），
// 但漏生成一个真实存在的派生形会把好卡片误判成「例句未出现词头」。
export function wordForms(word) {
  const w = String(word).toLowerCase();
  const forms = new Set([w, w + "s", w + "ed", w + "ing", w + "es"]);

  // -es 只加在 s/x/z/ch/sh 之后：box→boxes（上面已经无条件加过一次，这里保留只是为了不改动原有逻辑）
  if (/(?:s|x|z|ch|sh)$/.test(w)) forms.add(w + "es");

  // 词尾哑 e：hope→hoped / hoping
  if (w.endsWith("e")) {
    forms.add(w.slice(0, -1) + "ed");
    forms.add(w.slice(0, -1) + "ing");
  }

  // 辅音 + y 才变 i：study→studies/studied，但 play 不生成 plaies/plaied
  if (w.endsWith("y") && w.length >= 2 && !isVowel(w.at(-2))) {
    forms.add(w.slice(0, -1) + "ies");
    forms.add(w.slice(0, -1) + "ied");
  }

  if (endsInConsonant(w)) {
    const last = w.at(-1);
    forms.add(w + last + "ed");
    forms.add(w + last + "ing");
  }
  return forms;
}

const SUFFIXES = ["s", "es", "ed", "ing"];

// 故意宽松：它只用来「否决」假词候选，宽松的方向才是安全的。
// 需要严格的词典成员判定请用 wordbase.mjs 的 isExactWord。
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
