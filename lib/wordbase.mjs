import { readFileSync, existsSync } from "node:fs";

// 可以传多个文件合并成一个词基：主词表之外，还有一份人工核实过的现代词补充表
// （主词表源自老词典，收不到 sustainability、outsource 这类词）。
// 不存在的文件跳过，# 开头的行是注释。
export function loadWordBase(...paths) {
  const set = new Set();
  for (const path of paths) {
    if (!path || !existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const w = line.trim().toLowerCase();
      if (w && !w.startsWith("#")) set.add(w);
    }
  }
  return set;
}

// 严格的词典成员判定：词族成员／易混词必须是词典里实打实的词，不接受屈折形
export function isExactWord(base, word) {
  const w = String(word).trim().toLowerCase();
  return w !== "" && base.has(w);
}
