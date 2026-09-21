// 英语屈折规则的唯一出处：生成形（wordForms）与容忍判定（isRealWord）都放在这里，
// 避免两套规则各自演化出不一致的结论。

const VOWELS = "aeiou";
const isVowel = (ch) => typeof ch === "string" && VOWELS.includes(ch);

// 短元音闭音节才双写尾辅音：单音节（只有一组元音）+ 辅-元-辅，且结尾不是 w/x/y。
// stop→stopped；visit / travel 这类多音节不双写（它们的 -ed 形由 w + "ed" 覆盖）。
function isShortCVC(w) {
  if (w.length < 3) return false;
  if ((w.match(/[aeiou]+/g) ?? []).length !== 1) return false;
  const c1 = w.at(-3), v = w.at(-2), c2 = w.at(-1);
  if (!/^[a-z]$/.test(c2) || "wxy".includes(c2)) return false;
  return !isVowel(c1) && isVowel(v) && !isVowel(c2);
}

// 给词头生成常规屈折形，用于判定例句里是否出现了这个词
export function wordForms(word) {
  const w = String(word).toLowerCase();
  const forms = new Set([w, w + "s", w + "ed", w + "ing"]);

  // -es 只加在 s/x/z/ch/sh 之后：box→boxes，但 travel 不生成 traveles
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

  if (isShortCVC(w)) {
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
