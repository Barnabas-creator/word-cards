import { validateCard } from "./card-schema.mjs";
import { validateFake } from "./fake-schema.mjs";
import { isRealWord } from "./inflect.mjs";
import { checkCardContent } from "./card-content.mjs";

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

    errs.push(...checkCardContent(card, { wordBase, where }));

    for (const m of card?.fam ?? []) {
      if (fakeSet.has(String(m).toLowerCase())) errs.push(`${where}：fam 成员 ${m} 出现在假词库里`);
    }
    for (const m of card?.conf ?? []) {
      if (fakeSet.has(String(m).toLowerCase())) errs.push(`${where}：conf 成员 ${m} 出现在假词库里`);
    }
  }

  return errs;
}
