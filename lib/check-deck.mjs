import { validateCard } from "./card-schema.mjs";
import { validateFake } from "./fake-schema.mjs";
import { isRealWord } from "./wordbase.mjs";

const ZH_MAX = 20;

function words(sentence) {
  return String(sentence).toLowerCase().match(/[a-z']+/g) ?? [];
}

export function wordForms(word) {
  const w = String(word).toLowerCase();
  const forms = new Set([w, w + "s", w + "es", w + "ed", w + "ing"]);
  if (w.endsWith("e")) { forms.add(w.slice(0, -1) + "ed"); forms.add(w.slice(0, -1) + "ing"); }
  if (w.endsWith("y")) { forms.add(w.slice(0, -1) + "ies"); forms.add(w.slice(0, -1) + "ied"); }
  const last = w.at(-1);
  if (/[bdgklmnprt]/.test(last)) { forms.add(w + last + "ed"); forms.add(w + last + "ing"); }
  return forms;
}

export function exMentions(ex, w, fam) {
  const allForms = new Set();
  for (const word of [w, ...(fam ?? [])]) {
    for (const form of wordForms(word)) {
      allForms.add(form);
    }
  }
  return words(ex).some((tok) => allForms.has(tok));
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
    if (/[A-Za-z]/.test(zh)) errs.push(`${where}：中文释义里混入了拉丁字母`);
    if (/的的/.test(zh)) errs.push(`${where}：中文释义出现叠词「的的」`);
  }

  return errs;
}
