import { isExactWord } from "./wordbase.mjs";
import { wordForms } from "./inflect.mjs";

const ZH_MAX = 20;

export function words(sentence) {
  return String(sentence).toLowerCase().match(/[a-z']+/g) ?? [];
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

// 单张卡片内部的内容规则。跨卡片、跨词库的检查（重复、与假词库交集等）不在这里。
// wordBase 缺省时跳过真词性检查，其余规则照常。
export function checkCardContent(card, { wordBase, where = `卡片 ${card?.w}` } = {}) {
  const errs = [];

  if (wordBase) {
    for (const m of card?.fam ?? []) {
      if (!isExactWord(wordBase, m)) errs.push(`${where}：fam 成员 ${m} 不在真词基表里`);
    }
    for (const m of card?.conf ?? []) {
      if (!isExactWord(wordBase, m)) errs.push(`${where}：conf 成员 ${m} 不在真词基表里`);
    }
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

  return errs;
}
