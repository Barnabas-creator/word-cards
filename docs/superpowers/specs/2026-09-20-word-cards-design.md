# Word Cards · 英语单词卡（DET 备考）设计文档

日期：2026-09-20

## 1. 背景与目标

使用者为非技术用户（用户的妻子），备考 **Duolingo English Test (DET)**。

目标分数：**总分 95，任一小分不低于 85**（DET 量表 10–160，小分为
Literacy / Comprehension / Conversation / Production 四项）。95 分约当 CEFR B2 中段。

DET 中直接由词汇广度决定的题型：

- **Read and Select**：真词 / 假词判断，纯词汇广度题
- **Read and Complete**：c-test 填空
- **Interactive Reading**

因此本项目以词汇为唯一杠杆，聚焦两件事：**背词卡** 与 **真假词速判**。
口语、写作类题型需要评分模型，不在本项目范围内。

### 目标词汇量

受众词汇 4000–5000 词族。选用两个 CC BY-SA 免费词表：

| 来源 | 词数 | 作用 |
|---|---|---|
| NGSL (New General Service List) | 2801 | 覆盖一般文本约 92% |
| NAWL (New Academic Word List) | 963 | 补 DET 偏学术的阅读与写作 |
| DET 高频补充 | ~300 | 题型语料中的高频词与高频派生形 |
| **合计** | **≈ 4064** | |

### 备考节奏

每日新卡 **50 张**，4064 ÷ 50 ≈ **82 天**走完一轮，复习盒叠加在其上。
App 首页显示今日配额与总进度。

## 2. 项目形态

独立新仓库 `~/word-cards`。形态参照既有项目 `~/kartu-kosakata`（印尼语单词卡）：
纯前端、无构建步骤、PWA、可部署 GitHub Pages、手机「添加到主屏幕」后全屏使用。

与 `kartu-kosakata` 的关键差异：**词库外置**。

`kartu-kosakata` 把全部词条内嵌在单个 `index.html`（现已 196 KB）。本项目词条数是其数十倍，
内嵌会使单文件达到 2 MB 级，损害首屏加载、Git diff 可读性与后续维护。

```
index.html          应用本体（HTML + CSS + JS），目标 < 250 KB
dict-core.mjs       纯函数：归一化、索引、分桶、转卡片、提示词与 schema
data/
  manifest.json     分片清单 + 内容版本号
  deck-a1.json      按 CEFR 等级切片，每片约 200 KB
  deck-a2.json
  deck-b1.json
  deck-b2.json
  deck-b2plus.json
  fakewords.json    假词库
sw.js               Service Worker，缓存全部分片，装过一次即完全离线
manifest.json       PWA 清单
tools/
  gen-deck.mjs      离线内容生成脚本
  gen-fakewords.mjs 离线假词生成脚本
  check-data.mjs    词库校验
  *.test.mjs        单元测试
```

分片按需加载：进入某等级牌组才拉对应分片，Service Worker 在首次安装后预缓存全部。

## 3. 数据层

### 3.1 卡片 schema

```js
{
  w:    "nation",                 // 词形
  ipa:  "/ˈneɪʃ(ə)n/",            // 音标
  pos:  "n.",                     // 词性
  zh:   "国家、民族",              // 中文释义
  fam:  ["national","nationality","nationalize","international"],  // 词族派生，最多 4
  ex:   "The nation voted for change.",   // 例句，8–20 词
  exZh: "全国投票支持变革。",              // 例句翻译
  conf: ["nature","notion"],      // 易混词，0–3 个
  lvl:  "B1",                     // CEFR 等级
  src:  "NGSL",                   // 来源词表
  c:    ["名词"]                   // 分类标签，可多个
}
```

`fam` 字段是本设计的核心：DET 的假词题考的正是构词直觉（如「-ize 能否接在 national 后」）。
背词时顺带内化派生形，比单独刷题有效。`conf` 专治形近词误判——假词常由真词改一两个字母造出。

### 3.2 假词库 schema

目标 **1200 条**，对应 DET 干扰项的三种造法：

```js
{ w:"nationize", kind:"affix",  base:"nation"   }   // 词缀错配
{ w:"plaunt",    kind:"morph",  base:"plant"    }   // 真词形变，改 1–2 字母
{ w:"unbrighten",kind:"combo",  base:"brighten" }   // 合法但不存在的组合
```

`kind` 让速判模式在答错时给出错因归类，而非单纯对错。

### 3.3 校验规则（`tools/check-data.mjs`）

- 字段完整性与类型
- `ipa` 符合 IPA 字符集且被 `/.../` 包裹
- `fam` 每个成员都是真词（与总词表和一份英语词典基表比对）
- `fam` 成员不得出现在 `fakewords.json` 中
- `ex` 长度 8–20 词，且包含 `w` 或其某个 `fam` 成员
- `zh` / `exZh` 非空，无明显机翻腔（启发式：长度比、生硬连接词黑名单）
- 全库 `w` 唯一；真词库与假词库无交集
- 分片 `manifest.json` 的词数与版本号同实际文件一致

## 4. 功能模块

| 模块 | 来源 | 说明 |
|---|---|---|
| 牌组 | 沿用 | 翻卡、分类筛选、掌握进度。标签改为 CEFR 等级 + 词性 + 来源词表 |
| 假词速判 | **新增** | 真假词混排，限时 5 秒/词，出成绩单：正确率、平均反应时、错因分布（按 `kind`） |
| 查词 | 沿用 | Gemini 实时查词。命中预置库则直接读库，不调 API |
| 日历 | 沿用 | 按日期倒序列出查过的词；实心=调用了 AI，描边=命中库。增加「当日过卡数 / 速判正确率」 |
| 同步 | 沿用 | 同步码跨设备，同步学习进度与自查词库 |

查词与日历按用户要求完整保留：查到的词照常入库，可一键转成学习卡进入牌组。
Gemini API 密钥仍在底部设置里填，随同步码一起保存。预置的 4064 词开箱即用、无需密钥，
密钥只影响「查预置库以外的词」。

### 4.1 假词速判交互

- 每轮 30 词，真假比例 2:1（20 真 + 10 假），从当前已学范围内抽
- 每词限时 5 秒，超时判错
- 键盘：`←` 假词 / `→` 真词；手机：左右两个大按钮
- 轮末成绩单：正确率、平均反应时、按 `kind` 分组的错因分布、错词列表（可一键加入盒1）

## 5. 学习节奏

**三盒 Leitner**，不使用 SM-2：

```
新卡 → 盒1（每天复习） → 盒2（隔天） → 盒3（每 4 天）
答错 → 退回盒1
```

理由：备考有明确截止日期，SM-2 算出的数月级间隔在此场景无意义；
三盒规则简单、每张卡只多两个字段（`box`、`due`），localStorage 结构与现有实现基本一致。

每日队列 = 盒1/盒2/盒3 中到期的卡 + 补足 50 张新卡。首页显示今日配额、已完成数、总进度条。
「目标日期」可在设置中调整，用于重算每日新卡配额（默认 50）。

## 6. 内容生成流水线

**离线一次性执行，产物提交进仓库。App 侧不含任何生成代码。**

`tools/gen-deck.mjs`：
1. 读入 NGSL / NAWL / 补充词表
2. 分批（每批 20 词）喂 Gemini，结构化输出，schema 同 3.1
3. 写入按等级切分的 `data/deck-*.json`
4. 跑 `tools/check-data.mjs`，失败项自动重生成，连续两次失败则落入人工清单

`tools/gen-fakewords.mjs`：按 3.2 的三种造法生成，每条须通过「不在任何英语词典中」的校验。

人工抽检：每个 CEFR 等级各抽 30 条通读，重点看中文释义是否自然、例句难度是否落在 B2。

## 7. 测试

- `tools/dict-core.test.mjs`：纯函数单测（归一化、索引、分桶、转卡片）
- `tools/check-data.test.mjs`：校验器自身的单测（构造违规样例，断言被捕获）
- `tools/leitner.test.mjs`：三盒调度的单测（晋级、退回、到期队列、配额补足）
- 生成产物入库前必须 `node tools/check-data.mjs` 全绿

## 8. 交付顺序

1. 仓库骨架 + `dict-core.mjs` 迁移 + 测试基线
2. 词表获取与清洗（NGSL / NAWL / 补充），产出纯词形清单
3. `check-data.mjs` 校验器（先于生成器，保证产物一落地就受检）
4. `gen-deck.mjs` 生成流水线，先跑 A1 一片验证质量，再全量
5. `gen-fakewords.mjs` + 假词库
6. App：牌组 + 分片加载 + Leitner 调度
7. App：假词速判模式
8. App：查词 + 日历 + 同步（自 `kartu-kosakata` 迁移）
9. PWA 收尾（Service Worker 预缓存、manifest、图标）、部署 GitHub Pages

## 9. 范围外

- 口语 / 写作题型与自动评分
- 账号系统与内容加密（`kartu-kosakata` 同样没有；本项目内容源自公开词表，无需保护）
- 多语言切换
