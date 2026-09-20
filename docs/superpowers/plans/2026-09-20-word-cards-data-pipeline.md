# Word Cards 数据层与内容流水线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出并校验 Word Cards 的全部离线内容——4064 条真词卡分片与 1200 条假词——以及生成它们的可重跑流水线。

**Architecture:** 纯 Node ESM，无框架。校验器先于生成器落地，保证任何产物一写盘就受检。所有涉及网络的代码（Gemini 调用）都把 `fetch` 作为参数注入，纯函数与调度逻辑可离线单测。生成脚本只在本机跑，产物提交进仓库，应用层不含任何生成代码。

**Tech Stack:** Node 22 (`node:test` + `node:assert/strict`)、ESM、Gemini structured output、无第三方运行时依赖。

## Global Constraints

- 目标词库：NGSL 2801 + NAWL 963 + DET 补充 ~300 ≈ **4064** 真词；假词 **1200** 条
- 卡片 schema 字段固定为：`w` `ipa` `pos` `zh` `fam` `ex` `exZh` `conf` `lvl` `src` `c`
- `lvl` 取值只能是 `A1` `A2` `B1` `B2` `B2+`；`src` 只能是 `NGSL` `NAWL` `DET`
- `fam` 最多 4 个成员，`conf` 最多 3 个
- 例句 `ex` 长度 8–20 词
- 真词库与假词库**不得有交集**，`fam` 成员**不得**出现在假词库中
- 假词 `kind` 只能是 `affix` `morph` `combo`
- 分片按 `lvl` 切分，文件名 `data/deck-<lvl 小写，B2+ 写作 b2plus>.json`
- 无第三方运行时依赖；测试一律 `node --test`
- 提交信息用中文，结尾附 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: 卡片 schema 校验器

**Files:**
- Create: `package.json`
- Create: `lib/card-schema.mjs`
- Test: `tools/card-schema.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `LEVELS: string[]`、`SOURCES: string[]`、`POS_TAGS: string[]`
  - `validateCard(card: object, where: string) => string[]`（返回错误描述数组，空数组代表合法）

- [ ] **Step 1: 建仓库骨架**

`package.json`：

```json
{
  "name": "word-cards",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tools/*.test.mjs",
    "check": "node tools/check-data.mjs"
  }
}
```

- [ ] **Step 2: 写失败的测试**

`tools/card-schema.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateCard, LEVELS, SOURCES } from "../lib/card-schema.mjs";

const ok = {
  w: "nation", ipa: "/ˈneɪʃ(ə)n/", pos: "n.", zh: "国家、民族",
  fam: ["national", "nationality", "nationalize", "international"],
  ex: "The nation voted for change last autumn without any real protest.",
  exZh: "去年秋天全国投票支持变革，没有出现真正的抗议。",
  conf: ["nature", "notion"], lvl: "B1", src: "NGSL", c: ["名词"],
};

test("合法卡片零错误", () => {
  assert.deepEqual(validateCard(ok, "nation"), []);
});

test("缺必填字段报错", () => {
  const { zh, ...bad } = ok;
  const errs = validateCard(bad, "x");
  assert.equal(errs.length, 1);
  assert.match(errs[0], /zh/);
});

test("lvl 与 src 取值受限", () => {
  assert.match(validateCard({ ...ok, lvl: "C1" }, "x")[0], /lvl/);
  assert.match(validateCard({ ...ok, src: "COCA" }, "x")[0], /src/);
  assert.deepEqual(LEVELS, ["A1", "A2", "B1", "B2", "B2+"]);
  assert.deepEqual(SOURCES, ["NGSL", "NAWL", "DET"]);
});

test("ipa 必须被斜杠包裹", () => {
  assert.match(validateCard({ ...ok, ipa: "ˈneɪʃən" }, "x")[0], /ipa/);
});

test("fam 最多 4 个、conf 最多 3 个、都不能为空串", () => {
  assert.match(validateCard({ ...ok, fam: [...ok.fam, "nationhood"] }, "x")[0], /fam/);
  assert.match(validateCard({ ...ok, conf: ["a", "b", "c", "d"] }, "x")[0], /conf/);
  assert.match(validateCard({ ...ok, fam: ["national", ""] }, "x")[0], /fam/);
});

test("fam 为空数组是合法的（有些词没有派生形）", () => {
  assert.deepEqual(validateCard({ ...ok, fam: [] }, "x"), []);
});

test("c 至少一个标签且取值受限", () => {
  assert.match(validateCard({ ...ok, c: [] }, "x")[0], /c/);
  assert.match(validateCard({ ...ok, c: ["拟声词"] }, "x")[0], /c/);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/card-schema.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/card-schema.mjs'`

- [ ] **Step 4: 实现**

`lib/card-schema.mjs`：

```js
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/card-schema.test.mjs`
Expected: PASS，7 个测试全绿

- [ ] **Step 6: 提交**

```bash
cd ~/word-cards
git add package.json lib/card-schema.mjs tools/card-schema.test.mjs
git commit -m "$(printf 'feat: 卡片 schema 校验器\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: 假词 schema 校验器

**Files:**
- Create: `lib/fake-schema.mjs`
- Test: `tools/fake-schema.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `FAKE_KINDS: string[]`、`validateFake(fake: object, where: string) => string[]`

- [ ] **Step 1: 写失败的测试**

`tools/fake-schema.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateFake, FAKE_KINDS } from "../lib/fake-schema.mjs";

const ok = { w: "nationize", kind: "affix", base: "nation" };

test("合法假词零错误", () => {
  assert.deepEqual(validateFake(ok, "nationize"), []);
});

test("kind 取值受限", () => {
  assert.deepEqual(FAKE_KINDS, ["affix", "morph", "combo"]);
  assert.match(validateFake({ ...ok, kind: "random" }, "x")[0], /kind/);
});

test("缺 base 报错", () => {
  const { base, ...bad } = ok;
  assert.match(validateFake(bad, "x")[0], /base/);
});

test("w 必须是纯小写字母", () => {
  assert.match(validateFake({ ...ok, w: "Nationize" }, "x")[0], /w/);
  assert.match(validateFake({ ...ok, w: "nation ize" }, "x")[0], /w/);
});

test("w 不能等于 base", () => {
  assert.match(validateFake({ ...ok, w: "nation" }, "x")[0], /base/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/fake-schema.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/fake-schema.mjs'`

- [ ] **Step 3: 实现**

`lib/fake-schema.mjs`：

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/fake-schema.test.mjs`
Expected: PASS，5 个测试全绿

- [ ] **Step 5: 提交**

```bash
cd ~/word-cards
git add lib/fake-schema.mjs tools/fake-schema.test.mjs
git commit -m "$(printf 'feat: 假词 schema 校验器\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: 英语真词基表

假词必须确实不是英语词，`fam` 成员必须确实是英语词。两项都需要一份离线词表兜底。

**Files:**
- Create: `tools/fetch-wordbase.mjs`
- Create: `lib/wordbase.mjs`
- Test: `tools/wordbase.test.mjs`
-产物: `tools/vendor/words_alpha.txt`（约 4 MB，提交进仓库）

**Interfaces:**
- Consumes: 无
- Produces:
  - `loadWordBase(path: string) => Set<string>`
  - `isRealWord(base: Set<string>, word: string) => boolean`（小写归一，允许常规屈折：`-s` `-es` `-ed` `-ing`）

- [ ] **Step 1: 下载词表**

`tools/fetch-wordbase.mjs`：

```js
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
```

Run: `cd ~/word-cards && node tools/fetch-wordbase.mjs`
Expected: 打印约 37 万行。若网络不可达，手动从 https://github.com/dwyl/english-words 下载 `words_alpha.txt` 放到 `tools/vendor/`。

- [ ] **Step 2: 写失败的测试**

`tools/wordbase.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWordBase, isRealWord } from "../lib/wordbase.mjs";

const p = join(tmpdir(), `wb-${process.pid}.txt`);
writeFileSync(p, "nation\nnational\nplant\nbrighten\n");
const base = loadWordBase(p);

test("loadWordBase 读成小写集合", () => {
  assert.equal(base.size, 4);
  assert.ok(base.has("nation"));
});

test("isRealWord 命中原形，忽略大小写与空白", () => {
  assert.ok(isRealWord(base, " Nation "));
  assert.ok(isRealWord(base, "plant"));
});

test("isRealWord 容忍常规屈折", () => {
  assert.ok(isRealWord(base, "nations"));
  assert.ok(isRealWord(base, "planted"));
  assert.ok(isRealWord(base, "planting"));
});

test("isRealWord 对造出来的假词返回 false", () => {
  assert.equal(isRealWord(base, "nationize"), false);
  assert.equal(isRealWord(base, "plaunt"), false);
  assert.equal(isRealWord(base, "unbrighten"), false);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/wordbase.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/wordbase.mjs'`

- [ ] **Step 4: 实现**

`lib/wordbase.mjs`：

```js
import { readFileSync } from "node:fs";

export function loadWordBase(path) {
  const set = new Set();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const w = line.trim().toLowerCase();
    if (w) set.add(w);
  }
  return set;
}

const SUFFIXES = ["s", "es", "ed", "ing"];

export function isRealWord(base, word) {
  const w = String(word).trim().toLowerCase();
  if (!w) return false;
  if (base.has(w)) return true;
  for (const suf of SUFFIXES) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    if (base.has(stem)) return true;
    if (base.has(stem + "e")) return true;            // plant/planting 之外的 hope/hoping
    if (/(.)\1$/.test(stem) && base.has(stem.slice(0, -1))) return true;  // stopped/stopping
    if (stem.endsWith("i") && base.has(stem.slice(0, -1) + "y")) return true;  // studies
  }
  return false;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/wordbase.test.mjs`
Expected: PASS，4 个测试全绿

- [ ] **Step 6: 提交**

```bash
cd ~/word-cards
git add tools/fetch-wordbase.mjs tools/vendor/words_alpha.txt lib/wordbase.mjs tools/wordbase.test.mjs
git commit -m "$(printf 'feat: 英语真词基表与屈折容忍判定\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: 全库交叉校验

逐条 schema 合法不代表整库合法。本任务做跨条目、跨库的检查。

**Files:**
- Create: `lib/check-deck.mjs`
- Test: `tools/check-deck.test.mjs`

**Interfaces:**
- Consumes: `validateCard`（Task 1）、`validateFake`（Task 2）、`isRealWord`（Task 3）
- Produces: `checkDeck({ cards, fakes, wordBase }) => string[]`

- [ ] **Step 1: 写失败的测试**

`tools/check-deck.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { checkDeck } from "../lib/check-deck.mjs";

const wordBase = new Set(["nation", "national", "nature", "plant", "run", "brighten"]);

const card = {
  w: "nation", ipa: "/ˈneɪʃ(ə)n/", pos: "n.", zh: "国家、民族",
  fam: ["national"],
  ex: "The nation voted for change last autumn without any real protest.",
  exZh: "去年秋天全国投票支持变革，没有出现真正的抗议。",
  conf: ["nature"], lvl: "B1", src: "NGSL", c: ["名词"],
};
const fake = { w: "nationize", kind: "affix", base: "nation" };

test("合法组合零错误", () => {
  assert.deepEqual(checkDeck({ cards: [card], fakes: [fake], wordBase }), []);
});

test("真词重复报错", () => {
  const errs = checkDeck({ cards: [card, card], fakes: [], wordBase });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /重复/);
});

test("真词库与假词库相交报错", () => {
  const errs = checkDeck({ cards: [card], fakes: [{ w: "nation", kind: "affix", base: "nations" }], wordBase });
  assert.ok(errs.some((e) => /交集/.test(e)));
});

test("fam 成员不是真词报错", () => {
  const errs = checkDeck({ cards: [{ ...card, fam: ["nationhood"] }], fakes: [], wordBase });
  assert.ok(errs.some((e) => /fam.*nationhood/.test(e)));
});

test("fam 成员出现在假词库报错", () => {
  const errs = checkDeck({ cards: [{ ...card, fam: ["national"] }],
                           fakes: [{ w: "national", kind: "affix", base: "nation" }], wordBase });
  assert.ok(errs.some((e) => /假词/.test(e)));
});

test("假词其实是真词报错", () => {
  const errs = checkDeck({ cards: [], fakes: [{ w: "plant", kind: "morph", base: "plan" }], wordBase });
  assert.ok(errs.some((e) => /真词/.test(e)));
});

test("例句词数越界报错", () => {
  const short = { ...card, ex: "The nation voted." };
  assert.ok(checkDeck({ cards: [short], fakes: [], wordBase }).some((e) => /词数/.test(e)));
});

test("例句没提到词头或其派生形报错", () => {
  const off = { ...card, ex: "They walked along the river bank for nearly two hours." };
  assert.ok(checkDeck({ cards: [off], fakes: [], wordBase }).some((e) => /例句未出现/.test(e)));
});

test("例句用派生形也算提到", () => {
  const der = { ...card, ex: "The national team trained hard before the final match began." };
  assert.deepEqual(checkDeck({ cards: [der], fakes: [], wordBase }), []);
});

test("中文释义过长或含机翻腔报错", () => {
  assert.ok(checkDeck({ cards: [{ ...card, zh: "进行了一个国家的行为" }], fakes: [], wordBase })
    .some((e) => /机翻/.test(e)));
});

test("逐条 schema 错误一并带出", () => {
  assert.ok(checkDeck({ cards: [{ ...card, lvl: "C1" }], fakes: [], wordBase }).some((e) => /lvl/.test(e)));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/check-deck.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/check-deck.mjs'`

- [ ] **Step 3: 实现**

`lib/check-deck.mjs`：

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/check-deck.test.mjs`
Expected: PASS，11 个测试全绿

- [ ] **Step 5: 提交**

```bash
cd ~/word-cards
git add lib/check-deck.mjs tools/check-deck.test.mjs
git commit -m "$(printf 'feat: 全库交叉校验（重复、交集、fam 真伪、例句、机翻腔）\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 5: 分片与 manifest

**Files:**
- Create: `lib/shard.mjs`
- Test: `tools/shard.test.mjs`

**Interfaces:**
- Consumes: `LEVELS`（Task 1）
- Produces:
  - `shardName(lvl: string) => string`（`"B2+"` → `"deck-b2plus.json"`）
  - `shardCards(cards: object[]) => Map<string, object[]>`（键为文件名）
  - `buildManifest(shards: Map<string, object[]>, version: string) => object`
  - `validateManifest(manifest: object, shards: Map<string, object[]>) => string[]`

- [ ] **Step 1: 写失败的测试**

`tools/shard.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { shardName, shardCards, buildManifest, validateManifest } from "../lib/shard.mjs";

const mk = (w, lvl) => ({ w, lvl });

test("shardName 把 B2+ 写成 b2plus，其余转小写", () => {
  assert.equal(shardName("A1"), "deck-a1.json");
  assert.equal(shardName("B2+"), "deck-b2plus.json");
});

test("shardCards 按等级分组，组内保持原顺序", () => {
  const shards = shardCards([mk("a", "A1"), mk("b", "B2+"), mk("c", "A1")]);
  assert.deepEqual([...shards.keys()], ["deck-a1.json", "deck-b2plus.json"]);
  assert.deepEqual(shards.get("deck-a1.json").map((c) => c.w), ["a", "c"]);
});

test("buildManifest 记录每片词数与总数", () => {
  const shards = shardCards([mk("a", "A1"), mk("b", "A1"), mk("c", "B1")]);
  const m = buildManifest(shards, "v1");
  assert.equal(m.version, "v1");
  assert.equal(m.total, 3);
  assert.deepEqual(m.shards, [
    { file: "deck-a1.json", lvl: "A1", count: 2 },
    { file: "deck-b1.json", lvl: "B1", count: 1 },
  ]);
});

test("validateManifest 抓词数对不上", () => {
  const shards = shardCards([mk("a", "A1")]);
  const m = buildManifest(shards, "v1");
  m.shards[0].count = 99;
  assert.match(validateManifest(m, shards)[0], /count/);
});

test("validateManifest 抓分片文件缺失", () => {
  const shards = shardCards([mk("a", "A1"), mk("c", "B1")]);
  const m = buildManifest(shards, "v1");
  shards.delete("deck-b1.json");
  assert.ok(validateManifest(m, shards).some((e) => /deck-b1\.json/.test(e)));
});

test("合法 manifest 零错误", () => {
  const shards = shardCards([mk("a", "A1"), mk("c", "B1")]);
  assert.deepEqual(validateManifest(buildManifest(shards, "v1"), shards), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/shard.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/shard.mjs'`

- [ ] **Step 3: 实现**

`lib/shard.mjs`：

```js
import { LEVELS } from "./card-schema.mjs";

export function shardName(lvl) {
  return `deck-${String(lvl).toLowerCase().replace("+", "plus")}.json`;
}

export function shardCards(cards) {
  const out = new Map();
  for (const lvl of LEVELS) {
    const group = cards.filter((c) => c.lvl === lvl);
    if (group.length) out.set(shardName(lvl), group);
  }
  return out;
}

export function buildManifest(shards, version) {
  const entries = [];
  for (const lvl of LEVELS) {
    const file = shardName(lvl);
    if (shards.has(file)) entries.push({ file, lvl, count: shards.get(file).length });
  }
  return {
    version,
    total: entries.reduce((n, e) => n + e.count, 0),
    shards: entries,
  };
}

export function validateManifest(manifest, shards) {
  const errs = [];
  let total = 0;
  for (const e of manifest?.shards ?? []) {
    const actual = shards.get(e.file);
    if (!actual) {
      errs.push(`manifest 列了 ${e.file}，但分片不存在`);
      continue;
    }
    if (actual.length !== e.count) {
      errs.push(`${e.file}：manifest 的 count 是 ${e.count}，实际 ${actual.length}`);
    }
    total += actual.length;
  }
  for (const file of shards.keys()) {
    if (!(manifest?.shards ?? []).some((e) => e.file === file)) {
      errs.push(`分片 ${file} 没有登记进 manifest`);
    }
  }
  if (manifest?.total !== total) {
    errs.push(`manifest 的 total 是 ${manifest?.total}，实际 ${total}`);
  }
  return errs;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/shard.test.mjs`
Expected: PASS，6 个测试全绿

- [ ] **Step 5: 提交**

```bash
cd ~/word-cards
git add lib/shard.mjs tools/shard.test.mjs
git commit -m "$(printf 'feat: 按 CEFR 等级分片与 manifest 构建校验\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 6: 校验 CLI

把前五个任务串成一条能对着 `data/` 跑的命令。此后任何产物落盘都必须过这一关。

**Files:**
- Create: `tools/check-data.mjs`
- Test: `tools/check-data.test.mjs`

**Interfaces:**
- Consumes: `checkDeck`（Task 4）、`shardCards`/`validateManifest`（Task 5）、`loadWordBase`（Task 3）
- Produces: `collectErrors({ dataDir, wordBasePath }) => string[]`；CLI 有错退出码 1，无错退出码 0

- [ ] **Step 1: 写失败的测试**

`tools/check-data.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectErrors } from "./check-data.mjs";

const card = {
  w: "nation", ipa: "/ˈneɪʃ(ə)n/", pos: "n.", zh: "国家、民族", fam: ["national"],
  ex: "The nation voted for change last autumn without any real protest.",
  exZh: "去年秋天全国投票支持变革，没有出现真正的抗议。",
  conf: ["nature"], lvl: "B1", src: "NGSL", c: ["名词"],
};

function fixture({ cards = [card], fakes = [{ w: "nationize", kind: "affix", base: "nation" }], manifest } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wc-"));
  writeFileSync(join(dir, "deck-b1.json"), JSON.stringify(cards));
  writeFileSync(join(dir, "fakewords.json"), JSON.stringify(fakes));
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest ?? {
    version: "v1", total: cards.length,
    shards: [{ file: "deck-b1.json", lvl: "B1", count: cards.length }],
  }));
  const wb = join(dir, "wb.txt");
  writeFileSync(wb, "nation\nnational\nnature\n");
  return { dataDir: dir, wordBasePath: wb };
}

test("干净的数据目录零错误", () => {
  assert.deepEqual(collectErrors(fixture()), []);
});

test("卡片有问题时报出来", () => {
  const errs = collectErrors(fixture({ cards: [{ ...card, lvl: "C1" }] }));
  assert.ok(errs.some((e) => /lvl/.test(e)));
});

test("manifest 对不上时报出来", () => {
  const errs = collectErrors(fixture({
    manifest: { version: "v1", total: 9, shards: [{ file: "deck-b1.json", lvl: "B1", count: 9 }] },
  }));
  assert.ok(errs.some((e) => /count/.test(e)));
});

test("卡片落在错误的分片里报出来", () => {
  const errs = collectErrors(fixture({ cards: [{ ...card, lvl: "A1" }] }));
  assert.ok(errs.some((e) => /分片/.test(e)));
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/check-data.test.mjs`
Expected: FAIL，报 `collectErrors is not a function` 或模块不存在

- [ ] **Step 3: 实现**

`tools/check-data.mjs`：

```js
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkDeck } from "../lib/check-deck.mjs";
import { validateManifest, shardName } from "../lib/shard.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function collectErrors({ dataDir, wordBasePath }) {
  const errs = [];
  const manifest = readJson(join(dataDir, "manifest.json"));
  const fakes = existsSync(join(dataDir, "fakewords.json"))
    ? readJson(join(dataDir, "fakewords.json"))
    : [];

  const files = readdirSync(dataDir).filter((f) => f.startsWith("deck-") && f.endsWith(".json"));
  const onDisk = new Map();
  const cards = [];
  for (const f of files.sort()) {
    const group = readJson(join(dataDir, f));
    onDisk.set(f, group);
    for (const c of group) {
      cards.push(c);
      if (shardName(c.lvl) !== f) errs.push(`卡片 ${c.w}（${c.lvl}）落在了错误的分片 ${f}`);
    }
  }

  errs.push(...validateManifest(manifest, onDisk));
  errs.push(...checkDeck({ cards, fakes, wordBase: loadWordBase(wordBasePath) }));
  return errs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errs = collectErrors({
    dataDir: new URL("../data/", import.meta.url).pathname,
    wordBasePath: new URL("./vendor/words_alpha.txt", import.meta.url).pathname,
  });
  if (errs.length) {
    for (const e of errs) console.error(e);
    console.error(`\n共 ${errs.length} 个问题`);
    process.exit(1);
  }
  console.log("校验通过");
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/check-data.test.mjs`
Expected: PASS，4 个测试全绿

- [ ] **Step 5: 跑全部测试**

Run: `cd ~/word-cards && npm test`
Expected: 全绿，累计 37 个测试

- [ ] **Step 6: 提交**

```bash
cd ~/word-cards
git add tools/check-data.mjs tools/check-data.test.mjs
git commit -m "$(printf 'feat: 数据校验 CLI\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 7: 词表获取与清洗

**Files:**
- Create: `tools/build-wordlist.mjs`
- Create: `lib/wordlist.mjs`
- Create: `tools/det-supplement.txt`（人工维护的 DET 补充词，每行一词）
- Test: `tools/wordlist.test.mjs`
- 产物: `data/wordlist.json`

**Interfaces:**
- Consumes: `LEVELS`（Task 1）
- Produces:
  - `parseNgslCsv(text: string) => { w: string, rank: number }[]`
  - `assignLevel(rank: number, src: string) => string`
  - `mergeSources({ ngsl, nawl, det }) => { w, lvl, src }[]`

- [ ] **Step 1: 人工取词表**

NGSL 与 NAWL 从 https://www.newgeneralservicelist.com/ 下载 CSV（均为 CC BY-SA 4.0），
存为 `tools/vendor/ngsl.csv`、`tools/vendor/nawl.csv`。CSV 至少含词形列与排名列。

`tools/det-supplement.txt` 先留空文件，Task 11 抽检后再补。

- [ ] **Step 2: 写失败的测试**

`tools/wordlist.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseNgslCsv, assignLevel, mergeSources } from "../lib/wordlist.mjs";

test("parseNgslCsv 取词形与排名，跳过表头与空行", () => {
  const csv = "Lemma,Rank\nthe,1\nbe,2\n\nnation,850\n";
  assert.deepEqual(parseNgslCsv(csv), [
    { w: "the", rank: 1 }, { w: "be", rank: 2 }, { w: "nation", rank: 850 },
  ]);
});

test("parseNgslCsv 归一化大小写并去掉引号", () => {
  assert.deepEqual(parseNgslCsv('Lemma,Rank\n"Nation",5\n'), [{ w: "nation", rank: 5 }]);
});

test("assignLevel 按 NGSL 排名分档", () => {
  assert.equal(assignLevel(1, "NGSL"), "A1");
  assert.equal(assignLevel(800, "NGSL"), "A1");
  assert.equal(assignLevel(801, "NGSL"), "A2");
  assert.equal(assignLevel(1600, "NGSL"), "A2");
  assert.equal(assignLevel(1601, "NGSL"), "B1");
  assert.equal(assignLevel(2801, "NGSL"), "B1");
});

test("assignLevel 把 NAWL 归到 B2、DET 补充归到 B2+", () => {
  assert.equal(assignLevel(1, "NAWL"), "B2");
  assert.equal(assignLevel(1, "DET"), "B2+");
});

test("mergeSources 去重：同一个词优先保留排名靠前的来源", () => {
  const out = mergeSources({
    ngsl: [{ w: "nation", rank: 850 }],
    nawl: [{ w: "nation", rank: 3 }, { w: "cognitive", rank: 4 }],
    det: ["nation", "bespoke"],
  });
  assert.deepEqual(out, [
    { w: "nation", lvl: "A2", src: "NGSL" },
    { w: "cognitive", lvl: "B2", src: "NAWL" },
    { w: "bespoke", lvl: "B2+", src: "DET" },
  ]);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/wordlist.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/wordlist.mjs'`

- [ ] **Step 4: 实现**

`lib/wordlist.mjs`：

```js
export function parseNgslCsv(text) {
  const out = [];
  const lines = text.split("\n").slice(1);
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    const [wRaw, rankRaw] = raw.split(",");
    const w = String(wRaw).trim().replace(/^"|"$/g, "").toLowerCase();
    const rank = Number(String(rankRaw).trim().replace(/^"|"$/g, ""));
    if (!w || !Number.isFinite(rank)) continue;
    out.push({ w, rank });
  }
  return out;
}

export function assignLevel(rank, src) {
  if (src === "NAWL") return "B2";
  if (src === "DET") return "B2+";
  if (rank <= 800) return "A1";
  if (rank <= 1600) return "A2";
  return "B1";
}

export function mergeSources({ ngsl = [], nawl = [], det = [] }) {
  const seen = new Set();
  const out = [];
  const push = (w, rank, src) => {
    const key = w.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ w: key, lvl: assignLevel(rank, src), src });
  };
  for (const e of ngsl) push(e.w, e.rank, "NGSL");
  for (const e of nawl) push(e.w, e.rank, "NAWL");
  for (const w of det) push(String(w).trim(), 0, "DET");
  return out;
}
```

`tools/build-wordlist.mjs`：

```js
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseNgslCsv, mergeSources } from "../lib/wordlist.mjs";

const v = (f) => new URL(`./vendor/${f}`, import.meta.url).pathname;
const read = (p) => readFileSync(p, "utf8");

const ngsl = parseNgslCsv(read(v("ngsl.csv")));
const nawl = parseNgslCsv(read(v("nawl.csv")));
const detPath = new URL("./det-supplement.txt", import.meta.url).pathname;
const det = existsSync(detPath)
  ? read(detPath).split("\n").map((s) => s.trim()).filter(Boolean)
  : [];

const list = mergeSources({ ngsl, nawl, det });
const out = new URL("../data/wordlist.json", import.meta.url).pathname;
writeFileSync(out, JSON.stringify(list, null, 0));

const byLvl = {};
for (const e of list) byLvl[e.lvl] = (byLvl[e.lvl] ?? 0) + 1;
console.log(`共 ${list.length} 词：`, byLvl);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/wordlist.test.mjs`
Expected: PASS，5 个测试全绿

- [ ] **Step 6: 跑一次生成，核对总数**

Run: `cd ~/word-cards && mkdir -p data && node tools/build-wordlist.mjs`
Expected: 打印总数落在 3700–4100 之间。偏离超出这个区间就停下来查 CSV 列名是否对得上，不要继续。

- [ ] **Step 7: 提交**

```bash
cd ~/word-cards
git add lib/wordlist.mjs tools/build-wordlist.mjs tools/det-supplement.txt tools/wordlist.test.mjs tools/vendor/ngsl.csv tools/vendor/nawl.csv data/wordlist.json
git commit -m "$(printf 'feat: NGSL/NAWL 词表清洗与等级分档\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 8: 生成器纯函数（提示词、schema、解析）

**Files:**
- Create: `lib/gen-core.mjs`
- Test: `tools/gen-core.test.mjs`

**Interfaces:**
- Consumes: `LEVELS`、`POS_TAGS`（Task 1）
- Produces:
  - `DECK_PROMPT: string`
  - `DECK_SCHEMA: object`（Gemini responseSchema）
  - `buildDeckRequest(batch: {w,lvl,src}[]) => object`（HTTP body）
  - `parseDeckResponse(json: object) => object[]`
  - `cardsFromResponse(items: object[], batch: {w,lvl,src}[]) => object[]`（回填 `lvl`/`src`，模型不负责这两个字段）

- [ ] **Step 1: 写失败的测试**

`tools/gen-core.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { DECK_PROMPT, DECK_SCHEMA, buildDeckRequest, parseDeckResponse, cardsFromResponse }
  from "../lib/gen-core.mjs";

test("DECK_PROMPT 写死硬性规则", () => {
  assert.match(DECK_PROMPT, /8[–-]20/);
  assert.match(DECK_PROMPT, /最多 4 个/);
  assert.match(DECK_PROMPT, /B2/);
});

test("DECK_SCHEMA 把内容字段全列进 required，且不含 lvl 与 src", () => {
  const req = DECK_SCHEMA.items.required;
  assert.deepEqual(req, ["w", "ipa", "pos", "zh", "fam", "ex", "exZh", "conf", "c"]);
  assert.equal("lvl" in DECK_SCHEMA.items.properties, false);
  assert.equal("src" in DECK_SCHEMA.items.properties, false);
});

test("buildDeckRequest 把整批词放进 contents 并要求 JSON 输出", () => {
  const body = buildDeckRequest([{ w: "nation", lvl: "B1", src: "NGSL" }]);
  const text = body.contents[0].parts[0].text;
  assert.match(text, /nation/);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseSchema, DECK_SCHEMA);
});

test("parseDeckResponse 剥出模型返回的 JSON 数组", () => {
  const json = { candidates: [{ content: { parts: [{ text: '[{"w":"nation"}]' }] } }] };
  assert.deepEqual(parseDeckResponse(json), [{ w: "nation" }]);
});

test("parseDeckResponse 在结构不对或不是 JSON 时报错", () => {
  assert.throws(() => parseDeckResponse({}), /结构/);
  assert.throws(() => parseDeckResponse({ candidates: [{ content: { parts: [{ text: "oops" }] } }] }), /JSON/);
});

test("cardsFromResponse 按词形回填 lvl 与 src", () => {
  const items = [{ w: "nation", ipa: "/x/", pos: "n.", zh: "国家", fam: [], ex: "a", exZh: "啊", conf: [], c: ["名词"] }];
  const out = cardsFromResponse(items, [{ w: "nation", lvl: "B1", src: "NGSL" }]);
  assert.equal(out[0].lvl, "B1");
  assert.equal(out[0].src, "NGSL");
});

test("cardsFromResponse 丢掉批次里没点过的词", () => {
  const items = [{ w: "ghost", ipa: "/x/", pos: "n.", zh: "鬼", fam: [], ex: "a", exZh: "啊", conf: [], c: ["名词"] }];
  assert.deepEqual(cardsFromResponse(items, [{ w: "nation", lvl: "B1", src: "NGSL" }]), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/gen-core.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/gen-core.mjs'`

- [ ] **Step 3: 实现**

`lib/gen-core.mjs`：

```js
import { POS_TAGS } from "./card-schema.mjs";

export const DECK_PROMPT = `你是一个英语—中文双语词典编辑，为备考 Duolingo English Test 的中文母语学习者编写单词卡。

给定一批英语词，为每个词输出一条卡片，严格遵守：

- ipa：英式或美式音标均可，必须用斜杠包裹，例如 /ˈneɪʃ(ə)n/
- pos：英文缩写词性，例如 n. / v. / adj. / adv. / prep.
- zh：中文释义，不超过 20 个汉字，用顿号分隔多个义项。写地道中文，不要机翻腔
- fam：同一词族的派生词，最多 4 个，按常用度排序。必须是真实存在的英语词。没有派生词就给空数组
- ex：一个英语例句，长度 8–20 个词，难度控制在 CEFR B2，必须包含该词或它的某个派生形
- exZh：例句的中文翻译，自然流畅
- conf：形近或义近的易混词，最多 3 个，必须是真实英语词。没有就给空数组
- c：中文词性标签，只能从这些里选：${POS_TAGS.join(" / ")}

只输出 JSON 数组，不要任何解释文字。`;

export const DECK_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      w: { type: "string" },
      ipa: { type: "string" },
      pos: { type: "string" },
      zh: { type: "string" },
      fam: { type: "array", items: { type: "string" } },
      ex: { type: "string" },
      exZh: { type: "string" },
      conf: { type: "array", items: { type: "string" } },
      c: { type: "array", items: { type: "string" } },
    },
    required: ["w", "ipa", "pos", "zh", "fam", "ex", "exZh", "conf", "c"],
  },
};

export function buildDeckRequest(batch) {
  const words = batch.map((e) => e.w).join("\n");
  return {
    contents: [{ parts: [{ text: `${DECK_PROMPT}\n\n这批词：\n${words}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DECK_SCHEMA,
      temperature: 0.4,
    },
  };
}

export function parseDeckResponse(json) {
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new Error("Gemini 响应结构不对：找不到 text");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Gemini 返回的不是合法 JSON");
  }
  if (!Array.isArray(data)) throw new Error("Gemini 返回的 JSON 不是数组");
  return data;
}

export function cardsFromResponse(items, batch) {
  const meta = new Map(batch.map((e) => [e.w.toLowerCase(), e]));
  const out = [];
  for (const item of items) {
    const m = meta.get(String(item?.w ?? "").toLowerCase());
    if (!m) continue;
    out.push({ ...item, w: m.w, lvl: m.lvl, src: m.src });
  }
  return out;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/gen-core.test.mjs`
Expected: PASS，7 个测试全绿

- [ ] **Step 5: 提交**

```bash
cd ~/word-cards
git add lib/gen-core.mjs tools/gen-core.test.mjs
git commit -m "$(printf 'feat: 卡片生成的提示词、schema 与响应解析\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 9: 生成调度器（分批、重试、落盘）

**Files:**
- Create: `lib/gen-runner.mjs`
- Create: `tools/gen-deck.mjs`
- Test: `tools/gen-runner.test.mjs`

**Interfaces:**
- Consumes: `buildDeckRequest`/`parseDeckResponse`/`cardsFromResponse`（Task 8）、`validateCard`（Task 1）
- Produces: `generateCards({ wordlist, callModel, batchSize, maxRetries, onProgress }) => Promise<{ cards, failed }>`
  - `callModel: (body: object) => Promise<object>`，由调用方注入，测试里用假实现
  - `failed: { w, reason }[]`，连续失败两次的词落这里

- [ ] **Step 1: 写失败的测试**

`tools/gen-runner.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { generateCards } from "../lib/gen-runner.mjs";

const good = (w) => ({
  w, ipa: "/ˈneɪʃ(ə)n/", pos: "n.", zh: "国家", fam: [],
  ex: "The nation voted for change last autumn without any real protest.",
  exZh: "去年秋天全国投票支持变革。", conf: [], c: ["名词"],
});
const reply = (items) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] }}] });
const wordlist = [
  { w: "a", lvl: "A1", src: "NGSL" }, { w: "b", lvl: "A1", src: "NGSL" },
  { w: "c", lvl: "B1", src: "NGSL" },
];

test("按 batchSize 分批调用，产出回填了 lvl 的卡片", async () => {
  const seen = [];
  const callModel = async (body) => {
    const text = body.contents[0].parts[0].text;
    const ws = text.split("这批词：\n")[1].split("\n");
    seen.push(ws);
    return reply(ws.map(good));
  };
  const { cards, failed } = await generateCards({ wordlist, callModel, batchSize: 2 });
  assert.deepEqual(seen, [["a", "b"], ["c"]]);
  assert.deepEqual(cards.map((c) => c.w), ["a", "b", "c"]);
  assert.deepEqual(cards.map((c) => c.lvl), ["A1", "A1", "B1"]);
  assert.deepEqual(failed, []);
});

test("批次报错时重试，重试成功不计入 failed", async () => {
  let n = 0;
  const callModel = async (body) => {
    if (n++ === 0) throw new Error("503");
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    return reply(ws.map(good));
  };
  const { cards, failed } = await generateCards({ wordlist: wordlist.slice(0, 1), callModel, batchSize: 1 });
  assert.equal(cards.length, 1);
  assert.deepEqual(failed, []);
});

test("连续失败到上限的词落进 failed，不阻断其他批次", async () => {
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    if (ws[0] === "a") throw new Error("boom");
    return reply(ws.map(good));
  };
  const { cards, failed } = await generateCards({ wordlist, callModel, batchSize: 1, maxRetries: 2 });
  assert.deepEqual(cards.map((c) => c.w), ["b", "c"]);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].w, "a");
  assert.match(failed[0].reason, /boom/);
});

test("schema 不合法的卡片落进 failed，不进 cards", async () => {
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    return reply(ws.map((w) => ({ ...good(w), ipa: "没有斜杠" })));
  };
  const { cards, failed } = await generateCards({ wordlist: wordlist.slice(0, 1), callModel, batchSize: 1, maxRetries: 1 });
  assert.deepEqual(cards, []);
  assert.match(failed[0].reason, /ipa/);
});

test("模型漏词时，漏掉的那个落进 failed", async () => {
  const callModel = async () => reply([good("a")]);
  const { cards, failed } = await generateCards({
    wordlist: [{ w: "a", lvl: "A1", src: "NGSL" }, { w: "b", lvl: "A1", src: "NGSL" }],
    callModel, batchSize: 2, maxRetries: 1,
  });
  assert.deepEqual(cards.map((c) => c.w), ["a"]);
  assert.deepEqual(failed.map((f) => f.w), ["b"]);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/gen-runner.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/gen-runner.mjs'`

- [ ] **Step 3: 实现**

`lib/gen-runner.mjs`：

```js
import { buildDeckRequest, parseDeckResponse, cardsFromResponse } from "./gen-core.mjs";
import { validateCard } from "./card-schema.mjs";

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function runBatch(batch, callModel) {
  const items = parseDeckResponse(await callModel(buildDeckRequest(batch)));
  return cardsFromResponse(items, batch);
}

export async function generateCards({
  wordlist, callModel, batchSize = 20, maxRetries = 2, onProgress = () => {},
}) {
  const cards = [];
  const failed = [];

  for (const batch of chunk(wordlist, batchSize)) {
    let got = [];
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        got = await runBatch(batch, callModel);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr) {
      for (const e of batch) failed.push({ w: e.w, reason: String(lastErr.message ?? lastErr) });
      onProgress({ done: cards.length, failed: failed.length });
      continue;
    }

    const byWord = new Map(got.map((c) => [c.w.toLowerCase(), c]));
    for (const e of batch) {
      const card = byWord.get(e.w.toLowerCase());
      if (!card) {
        failed.push({ w: e.w, reason: "模型没有返回这个词" });
        continue;
      }
      const errs = validateCard(card, e.w);
      if (errs.length) {
        failed.push({ w: e.w, reason: errs.join("；") });
        continue;
      }
      cards.push(card);
    }
    onProgress({ done: cards.length, failed: failed.length });
  }

  return { cards, failed };
}
```

`tools/gen-deck.mjs`：

```js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generateCards } from "../lib/gen-runner.mjs";
import { shardCards, buildManifest } from "../lib/shard.mjs";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("需要环境变量 GEMINI_API_KEY");

const MODEL = "gemini-2.5-flash";
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function callModel(body) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const dataDir = new URL("../data/", import.meta.url).pathname;
let wordlist = JSON.parse(readFileSync(join(dataDir, "wordlist.json"), "utf8"));

const only = process.argv.find((a) => a.startsWith("--lvl="));
if (only) wordlist = wordlist.filter((e) => e.lvl === only.slice("--lvl=".length));

const { cards, failed } = await generateCards({
  wordlist, callModel,
  onProgress: ({ done, failed }) => process.stdout.write(`\r已生成 ${done} / ${wordlist.length}，失败 ${failed}`),
});
console.log();

mkdirSync(dataDir, { recursive: true });
const shards = shardCards(cards);
for (const [file, group] of shards) writeFileSync(join(dataDir, file), JSON.stringify(group));
writeFileSync(join(dataDir, "manifest.json"), JSON.stringify(buildManifest(shards, "v1"), null, 2));
writeFileSync(join(dataDir, "failed.json"), JSON.stringify(failed, null, 2));
console.log(`写入 ${shards.size} 个分片，失败 ${failed.length} 条，明细见 data/failed.json`);
```

注意：`--lvl=` 只生成单个等级时，`shardCards` 只会写该等级的分片，`manifest.json` 也只覆盖该等级。
全量生成前的试跑要用单独的输出目录或事后重跑全量，别把试跑的 manifest 留下。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/gen-runner.test.mjs`
Expected: PASS，5 个测试全绿

- [ ] **Step 5: 提交**

```bash
cd ~/word-cards
git add lib/gen-runner.mjs tools/gen-deck.mjs tools/gen-runner.test.mjs
git commit -m "$(printf 'feat: 卡片生成调度器与 gen-deck 脚本\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 10: 假词生成

**Files:**
- Create: `lib/fake-gen.mjs`
- Create: `tools/gen-fakewords.mjs`
- Test: `tools/fake-gen.test.mjs`

**Interfaces:**
- Consumes: `isRealWord`（Task 3）、`validateFake`（Task 2）
- Produces:
  - `affixCandidates(word: string) => string[]`
  - `morphCandidates(word: string) => string[]`
  - `comboCandidates(word: string) => string[]`
  - `generateFakes({ wordlist, wordBase, target, rng }) => { w, kind, base }[]`

- [ ] **Step 1: 写失败的测试**

`tools/fake-gen.test.mjs`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { affixCandidates, morphCandidates, comboCandidates, generateFakes } from "../lib/fake-gen.mjs";

test("affixCandidates 挂常见词缀", () => {
  const out = affixCandidates("nation");
  assert.ok(out.includes("nationize"));
  assert.ok(out.includes("nationful"));
  assert.ok(out.every((w) => w.startsWith("nation") || w.endsWith("nation")));
});

test("morphCandidates 只改一两个字母，长度不变", () => {
  const out = morphCandidates("plant");
  assert.ok(out.length > 0);
  assert.ok(out.every((w) => w.length === 5 && w !== "plant" && /^[a-z]+$/.test(w)));
});

test("comboCandidates 加前缀", () => {
  const out = comboCandidates("brighten");
  assert.ok(out.includes("unbrighten"));
});

test("generateFakes 产出的词都不是真词、不重复、带 kind 与 base", () => {
  const wordBase = new Set(["nation", "plant", "brighten", "nations", "planted"]);
  const wordlist = [{ w: "nation" }, { w: "plant" }, { w: "brighten" }];
  const out = generateFakes({ wordlist, wordBase, target: 9, rng: mulberry(1) });
  assert.equal(out.length, 9);
  assert.equal(new Set(out.map((f) => f.w)).size, 9);
  assert.ok(out.every((f) => !wordBase.has(f.w)));
  assert.ok(out.every((f) => ["affix", "morph", "combo"].includes(f.kind)));
  assert.ok(out.every((f) => wordlist.some((e) => e.w === f.base)));
});

test("generateFakes 三种造法数量大致均衡", () => {
  const wordBase = new Set(["nation", "plant", "brighten"]);
  const wordlist = [{ w: "nation" }, { w: "plant" }, { w: "brighten" }];
  const out = generateFakes({ wordlist, wordBase, target: 30, rng: mulberry(2) });
  const n = (k) => out.filter((f) => f.kind === k).length;
  for (const k of ["affix", "morph", "combo"]) {
    assert.ok(n(k) >= 6, `${k} 只有 ${n(k)} 条`);
  }
});

test("目标数超过可产出的上限时，返回能产出的全部", () => {
  const wordBase = new Set(["nation"]);
  const out = generateFakes({ wordlist: [{ w: "nation" }], wordBase, target: 100000, rng: mulberry(3) });
  assert.ok(out.length > 0 && out.length < 100000);
});

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ~/word-cards && node --test tools/fake-gen.test.mjs`
Expected: FAIL，报 `Cannot find module '../lib/fake-gen.mjs'`

- [ ] **Step 3: 实现**

`lib/fake-gen.mjs`：

```js
import { isRealWord } from "./wordbase.mjs";

const SUFFIXES = ["ize", "ful", "ment", "ness", "able", "ish", "ive", "ation"];
const PREFIXES = ["un", "re", "dis", "mis", "over", "inter"];
const VOWELS = "aeiou";
const CONSONANTS = "bcdfghjklmnprstvw";

export function affixCandidates(word) {
  return SUFFIXES.map((s) => word + s);
}

export function morphCandidates(word) {
  const out = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const pool = VOWELS.includes(ch) ? VOWELS : CONSONANTS;
    for (const r of pool) {
      if (r === ch) continue;
      out.push(word.slice(0, i) + r + word.slice(i + 1));
    }
  }
  return out;
}

export function comboCandidates(word) {
  return PREFIXES.map((p) => p + word);
}

const MAKERS = [
  ["affix", affixCandidates],
  ["morph", morphCandidates],
  ["combo", comboCandidates],
];

export function generateFakes({ wordlist, wordBase, target, rng = Math.random }) {
  const out = [];
  const taken = new Set();

  // 三种造法轮流取，保证数量均衡
  const pools = MAKERS.map(([kind, make]) => {
    const items = [];
    for (const e of wordlist) {
      for (const w of make(e.w)) items.push({ w, kind, base: e.w });
    }
    // 用注入的 rng 洗牌，保证可复现
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  });

  let exhausted = 0;
  const cursor = [0, 0, 0];
  while (out.length < target && exhausted < pools.length) {
    exhausted = 0;
    for (let p = 0; p < pools.length; p++) {
      if (out.length >= target) break;
      let picked = false;
      while (cursor[p] < pools[p].length) {
        const cand = pools[p][cursor[p]++];
        if (taken.has(cand.w)) continue;
        if (!/^[a-z]+$/.test(cand.w)) continue;
        if (isRealWord(wordBase, cand.w)) continue;
        taken.add(cand.w);
        out.push(cand);
        picked = true;
        break;
      }
      if (!picked) exhausted++;
    }
  }
  return out;
}
```

`tools/gen-fakewords.mjs`：

```js
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateFakes } from "../lib/fake-gen.mjs";
import { loadWordBase } from "../lib/wordbase.mjs";

const dataDir = new URL("../data/", import.meta.url).pathname;
const wordlist = JSON.parse(readFileSync(join(dataDir, "wordlist.json"), "utf8"));
const wordBase = loadWordBase(new URL("./vendor/words_alpha.txt", import.meta.url).pathname);

const fakes = generateFakes({ wordlist, wordBase, target: 1200 });
writeFileSync(join(dataDir, "fakewords.json"), JSON.stringify(fakes));

const byKind = {};
for (const f of fakes) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
console.log(`写入 ${fakes.length} 条假词：`, byKind);
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ~/word-cards && node --test tools/fake-gen.test.mjs`
Expected: PASS，6 个测试全绿

- [ ] **Step 5: 真跑一次**

Run: `cd ~/word-cards && node tools/gen-fakewords.mjs`
Expected: 打印 1200 条，三种 kind 各 300–500 条

- [ ] **Step 6: 人工抽检 30 条**

Run: `cd ~/word-cards && node -e "const f=require('fs');const a=JSON.parse(f.readFileSync('data/fakewords.json'));for(let i=0;i<30;i++)console.log(a[Math.floor(i*a.length/30)])"`

逐条看：这些词是不是确实不存在、但看起来像英语词。若出现明显读不通的（如三个辅音连缀），
调 `morphCandidates` 的替换池后重跑。

- [ ] **Step 7: 提交**

```bash
cd ~/word-cards
git add lib/fake-gen.mjs tools/gen-fakewords.mjs tools/fake-gen.test.mjs data/fakewords.json
git commit -m "$(printf 'feat: 假词生成器与 1200 条假词库\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 11: 全量生成与人工抽检

**Files:**
- Modify: `tools/det-supplement.txt`
- 产物: `data/deck-*.json`、`data/manifest.json`

**Interfaces:**
- Consumes: 前十个任务的全部产出
- Produces: 完整的 `data/` 目录，`node tools/check-data.mjs` 全绿

- [ ] **Step 1: 先只跑 A1 一片验证质量**

```bash
cd ~/word-cards
export GEMINI_API_KEY=<你的密钥>
node tools/gen-deck.mjs --lvl=A1
```

Expected: 写入 `data/deck-a1.json`，失败条数低于总数的 3%。高于 3% 就停下来读 `data/failed.json`，
按失败原因调 `DECK_PROMPT`（Task 8）后重跑，不要带着高失败率往下走。

- [ ] **Step 2: 人工通读 A1 的 30 条**

```bash
cd ~/word-cards
node -e "const a=require('./data/deck-a1.json');for(let i=0;i<30;i++){const c=a[Math.floor(i*a.length/30)];console.log(c.w,c.ipa,c.zh,'|',c.fam.join(','),'|',c.ex,'|',c.exZh)}"
```

逐条看三件事：中文释义是否自然（不是机翻）、例句难度是否落在 B2（不能太幼稚也不能太难）、
词族成员是否确实同族。有系统性问题就改提示词重跑 A1，直到这 30 条读着舒服。

- [ ] **Step 3: 全量生成**

```bash
cd ~/word-cards
node tools/gen-deck.mjs
```

Expected: 打印约 4064 条，写入 5 个分片 + `manifest.json`。按每批 20 词算约 200 次调用。

- [ ] **Step 4: 跑校验**

Run: `cd ~/word-cards && node tools/check-data.mjs`
Expected: 打印「校验通过」，退出码 0

校验不过时按报错逐条处理：`fam` 成员不在基表里多半是模型编了派生词，把那批词加进
`data/failed.json` 重跑；例句词数越界则改提示词后只重跑受影响的等级。

- [ ] **Step 5: 补 DET 高频词**

抽检中若发现 DET 常见但词表没收的词，逐行追加进 `tools/det-supplement.txt`，然后：

```bash
cd ~/word-cards
node tools/build-wordlist.mjs && node tools/gen-deck.mjs && node tools/check-data.mjs
```

- [ ] **Step 6: 每个等级各抽检 30 条**

对 `deck-a2.json`、`deck-b1.json`、`deck-b2.json`、`deck-b2plus.json` 重复 Step 2 的命令与判断。

- [ ] **Step 7: 跑全部测试**

Run: `cd ~/word-cards && npm test && node tools/check-data.mjs`
Expected: 测试全绿，校验通过

- [ ] **Step 8: 提交**

```bash
cd ~/word-cards
git add data/ tools/det-supplement.txt
git commit -m "$(printf 'feat: 全量生成 4064 条真词卡与分片 manifest\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

## 完成标准

- `npm test` 全绿（约 60 个单测）
- `node tools/check-data.mjs` 退出码 0
- `data/` 含 5 个真词分片（合计约 4064 条）、`fakewords.json`（1200 条）、`manifest.json`、`wordlist.json`
- 每个 CEFR 等级各 30 条人工抽检通过

## 下一份计划

应用层（`index.html`、Leitner 调度、假词速判、查词与日历迁移、PWA 收尾）在本计划完成后另写，
届时分片的真实体积已知，加载策略可以按实测定。
