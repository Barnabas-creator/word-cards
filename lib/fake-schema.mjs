export const FAKE_KINDS = ["affix", "morph", "combo"];
const KIND_SET = new Set(FAKE_KINDS);

export function validateFake(fake, where) {
  const errs = [];
  for (const f of ["w", "base"]) {
    const v = fake?.[f];
    if (typeof v !== "string" || v.trim() === "") errs.push(`${where}：字段 ${f} 缺失或为空`);
  }
  if (typeof fake?.w === "string" && !/^[a-z]+$/.test(fake.w)) {
    errs.push(`${where}：字段 w 必须是纯小写字母：${fake.w}`);
  }
  if (!KIND_SET.has(fake?.kind)) errs.push(`${where}：字段 kind 取值非法：${fake?.kind}`);
  if (typeof fake?.w === "string" && fake.w === fake?.base) {
    errs.push(`${where}：假词不能等于它的 base`);
  }
  return errs;
}
