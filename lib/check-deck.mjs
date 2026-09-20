import { validateCard } from "./card-schema.mjs";
import { validateFake } from "./fake-schema.mjs";
import { isRealWord } from "./wordbase.mjs";

const MT_PATTERNS = [/进行了一个/, /被认为是/, /的的/, /作出了/];
const ZH_MAX = 20;

function words(sentence) {
  return String(sentence).toLowerCase().match(/[a-z']+/g) ?? [];
}

export function exMentions(ex, w, fam) {
  const stems = [w, ...(fam ?? [])].map((s) => String(s).toLowerCase())
    .map((s) => s.slice(0, Math.max(4, Math.min(s.length, 5))));
  return words(ex).some((tok) => stems.some((stem) => tok.startsWith(stem)));
}

export function checkDeck({ cards = [], fakes = [], wordBase }) {
  const errs = [];
  const fakeSet = new Set(fakes.map((f) => String(f.w).toLowerCase()));
  const seen = new Set();

  for (const f of fakes) {
    const where = `假词 ${f?.w}`;
    errs.push(...validateFake(f, where));
    if (typeof f?.w === "string" && isRealWord(wordBase, f.w)) {
      errs.push(`${where}：它其实是真词`);
    }
  }

  for (const card of cards) {
    const where = `卡片 ${card?.w}`;
    errs.push(...validateCard(card, where));

    const w = String(card?.w ?? "").toLowerCase();
    if (seen.has(w)) errs.push(`${where}：词形重复`);
    seen.add(w);
    if (fakeSet.has(w)) errs.push(`${where}：与假词库有交集`);

    for (const m of card?.fam ?? []) {
      if (!isRealWord(wordBase, m)) errs.push(`${where}：fam 成员 ${m} 不在真词基表里`);
      if (fakeSet.has(String(m).toLowerCase())) errs.push(`${where}：fam 成员 ${m} 出现在假词库里`);
    }

    const n = words(card?.ex).length;
    if (n < 8 || n > 20) errs.push(`${where}：例句词数 ${n}，要求 8–20`);
    if (!exMentions(card?.ex, card?.w, card?.fam)) {
      errs.push(`${where}：例句未出现词头或其派生形`);
    }

    const zh = String(card?.zh ?? "");
    if (zh.length > ZH_MAX) errs.push(`${where}：中文释义过长（${zh.length} 字，上限 ${ZH_MAX}）`);
    if (MT_PATTERNS.some((re) => re.test(zh))) errs.push(`${where}：中文释义疑似机翻腔`);
  }

  return errs;
}
