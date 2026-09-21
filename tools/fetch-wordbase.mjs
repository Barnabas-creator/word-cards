import { writeFileSync, mkdirSync } from "node:fs";

const URL_ = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";
const OUT = new URL("./vendor/words_alpha.txt", import.meta.url);

const res = await fetch(URL_);
if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
const text = await res.text();
if (text.split("\n").length < 300000) throw new Error("词表行数异常偏少，疑似下载到错误内容");
mkdirSync(new URL("./vendor/", import.meta.url), { recursive: true });
writeFileSync(OUT, text);
console.log(`已写入 ${OUT.pathname}，${text.split("\n").length} 行`);
