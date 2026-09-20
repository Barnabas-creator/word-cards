import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://raw.githubusercontent.com/lpmi-13/machine_readable_wordlists/master";
const FILES = [
  ["ngsl.json", `${BASE}/General/NGSL/NGSL.json`, 2801],
  ["nawl.json", `${BASE}/Academic/NAWL/NAWL.json`, 963],
];

mkdirSync(new URL("./vendor/", import.meta.url), { recursive: true });
for (const [name, url, expect] of FILES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} 下载失败：HTTP ${res.status}`);
  const json = await res.json();
  const count = Object.values(json).reduce(
    (n, v) => n + (Array.isArray(v) ? 1 : Object.keys(v).length), 0);
  if (count !== expect) throw new Error(`${name} 词头数 ${count}，预期 ${expect}`);
  writeFileSync(new URL(`./vendor/${name}`, import.meta.url), JSON.stringify(json));
  console.log(`${name}：${count} 个词头`);
}
