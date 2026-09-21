
## 词表来源与授权

- **NGSL**（New General Service List，2801 词）与 **NAWL**（New Academic Word List，963 词）
  取自 [lpmi-13/machine_readable_wordlists](https://github.com/lpmi-13/machine_readable_wordlists)，
  原始词表由 Browne, Culligan & Phillips 发布，授权 **CC BY-SA 4.0**。
  本仓库中由这两份词表派生的 `data/wordlist.json` 与卡片分片同样以 CC BY-SA 4.0 提供。
- **words_alpha.txt**（37 万英语词，用于判定真词/假词）取自
  [dwyl/english-words](https://github.com/dwyl/english-words)，Unlicense。
- 卡片的音标、中文释义、词族、例句由 Gemini 生成后经 `tools/check-data.mjs` 校验。
