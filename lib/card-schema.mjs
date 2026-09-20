export const LEVELS = ["A1", "A2", "B1", "B2", "B2+"];
export const SOURCES = ["NGSL", "NAWL", "DET"];
export const POS_TAGS = ["名词", "动词", "形容词", "副词", "虚词", "其他"];

const LEVEL_SET = new Set(LEVELS);
const SOURCE_SET = new Set(SOURCES);
const POS_SET = new Set(POS_TAGS);

function needText(obj, field, errs, where) {
  const v = obj?.[field];
  if (typeof v !== "string" || v.trim() === "") {
    errs.push(`${where}：字段 ${field} 缺失或为空`);
  }
}

function needStringArray(obj, field, max, errs, where, { minLen = 0 } = {}) {
  const v = obj?.[field];
  if (!Array.isArray(v)) {
    errs.push(`${where}：字段 ${field} 必须是数组`);
    return;
  }
  if (v.length > max) errs.push(`${where}：字段 ${field} 最多 ${max} 项，实际 ${v.length}`);
  if (v.length < minLen) errs.push(`${where}：字段 ${field} 至少 ${minLen} 项`);
  if (v.some((x) => typeof x !== "string" || x.trim() === "")) {
    errs.push(`${where}：字段 ${field} 含空项或非字符串`);
  }
}

export function validateCard(card, where) {
  const errs = [];
  for (const f of ["w", "ipa", "pos", "zh", "ex", "exZh"]) needText(card, f, errs, where);

  if (typeof card?.ipa === "string" && !/^\/.+\/$/.test(card.ipa.trim())) {
    errs.push(`${where}：字段 ipa 必须被斜杠包裹，实际 ${card.ipa}`);
  }
  if (!LEVEL_SET.has(card?.lvl)) errs.push(`${where}：字段 lvl 取值非法：${card?.lvl}`);
  if (!SOURCE_SET.has(card?.src)) errs.push(`${where}：字段 src 取值非法：${card?.src}`);

  needStringArray(card, "fam", 4, errs, where);
  needStringArray(card, "conf", 3, errs, where);
  needStringArray(card, "c", 4, errs, where, { minLen: 1 });

  if (Array.isArray(card?.c)) {
    for (const tag of card.c) {
      if (!POS_SET.has(tag)) errs.push(`${where}：字段 c 含非法标签 ${tag}`);
    }
  }
  return errs;
}
