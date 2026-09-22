// 对已生成的卡片做确定性清理：只改那些无需模型判断、规则上必然是错的地方。
//
// 目前只有一条：易混词 conf 不能跟词族 fam 重复（一个词不可能既同族又是需要区分的易混词）。
// 从 conf 里删掉，fam 保持不动。
//
// 词族里混入屈折形（make → making）不在这里处理：规则分不清「只是变了时态」
// 和「已经独立成词」（find → finding 作「研究发现」、thought 作名词），
// 一刀切会删掉好数据。那种要让模型重新生成。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const manifest = JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8"));

let touched = 0, removed = 0;
for (const { file } of manifest.shards) {
  const path = join(dataDir, file);
  const deck = JSON.parse(readFileSync(path, "utf8"));
  for (const c of deck) {
    const famSet = new Set((c.fam ?? []).map((x) => x.toLowerCase()));
    const before = c.conf.length;
    c.conf = c.conf.filter((x) => !famSet.has(x.toLowerCase()));
    if (c.conf.length !== before) { touched++; removed += before - c.conf.length; }
  }
  writeFileSync(path, JSON.stringify(deck));
}
console.log(`清理完成：${touched} 张卡，从易混里删掉 ${removed} 个与词族重复的词`);
