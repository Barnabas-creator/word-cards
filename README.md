# 英语单词卡 · Word Cards

给备考 **Duolingo English Test**（目标总分 95，小分不低于 85）的学习者用的背词 PWA。
纯前端、可离线、手机「添加到主屏幕」后全屏运行。

## 两个模块

- **今日复习**：卡片正面是词 + 音标 + 词性，背面是中文释义、同词族派生词、例句（含中译）、易混词。
  复习节奏用**三盒 Leitner**：新卡进盒1（每天），答对升盒（盒2 隔天、盒3 隔四天），答错退回盒1，
  升出盒3 即视为已掌握。进度存在浏览器本地。
- **真假词速判**：对应 DET 的 Read and Select 题型。真假词混排限时判断，
  答错时告诉你这个假词的造法（词缀错配 / 真词形变 / 非法组合）以及由哪个真词变来。
  轮末给正确率、平均反应时、按错因分类的分布。

## 词库规模

| | |
|---|---|
| 词表 | NGSL 2801 + NAWL 963 = 3764 词 |
| 卡片 | 由 Gemini 生成，逐张过校验闸门 |
| 假词 | 1200 条（三种造法各 400） |

## 生成卡片

```bash
export GEMINI_API_KEY=<你的密钥>
node tools/gen-deck.mjs                 # 从上次断点续跑
node tools/gen-deck.mjs --lvl=A1        # 只跑某个等级
node tools/gen-deck.mjs --batch=50      # 每批词数（免费层按请求数限额，批次越大越省）
GEMINI_MODEL=gemini-3.5-flash node tools/gen-deck.mjs   # 换模型（配额按模型分开算）
```

免费层是**每个模型每天 20 次请求**。脚本会跳过已生成的词，配额用尽时立刻停手，
第二天跑同一条命令即可续上。

加了新卡片之后，再补一次词族释义（查词页显示词族成员的音标和中文用）：

```bash
node tools/gen-famgloss.mjs   # 只给自己没有卡片的词族成员补，写 data/famgloss.json，可续跑
```

## 校验

```bash
node tools/check-data.mjs   # 全库校验：字段、例句、词族真伪、真假词交集、覆盖率
npm test                    # 单元测试
```

生成的数据必须过 `check-data.mjs` 才算数。它同时核对卡片是否覆盖了词表里的每一个词——
中途断掉的生成不会被当成完成。

## 本地预览

```bash
python3 -m http.server 8000
```

## 文件

- `index.html` — 应用本体
- `sw.js` / `manifest.webmanifest` — PWA 离线与安装
- `lib/` — 校验器、分片、屈折规则、生成调度（纯函数，可单测）
- `tools/` — 生成与校验脚本、测试
- `data/` — 词表、卡片分片、假词库
- `docs/superpowers/` — 设计文档与实施计划（含「实施后的架构偏离」一节）

## 词表来源与授权

- **NGSL**（New General Service List，2801 词）与 **NAWL**（New Academic Word List，963 词）
  取自 [lpmi-13/machine_readable_wordlists](https://github.com/lpmi-13/machine_readable_wordlists)，
  原始词表由 Browne, Culligan & Phillips 发布，授权 **CC BY-SA 4.0**。
  本仓库中由这两份词表派生的 `data/wordlist.json` 与卡片分片同样以 CC BY-SA 4.0 提供。
- **words_alpha.txt**（37 万英语词，用于判定真词/假词）取自
  [dwyl/english-words](https://github.com/dwyl/english-words)，Unlicense。
- 卡片的音标、中文释义、词族、例句由 Gemini 生成后经 `tools/check-data.mjs` 校验。
