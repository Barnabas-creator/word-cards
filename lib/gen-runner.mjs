import { buildDeckRequest, parseDeckResponse, cardsFromResponse } from "./gen-core.mjs";
import { validateCard } from "./card-schema.mjs";
import { checkCardContent } from "./card-content.mjs";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 8000;

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  wordlist, callModel, wordBase, batchSize = 20,
  // maxRetries 指总尝试次数（含第一次），不是首次失败之后再重试的次数
  maxRetries = 2,
  onProgress = () => {}, sleep = realSleep,
  // 返回 true 表示这个错误没必要再跑下去（典型场景：当天免费配额已耗尽）。
  // 剩余批次既不尝试也不记进 failed，留给下次续跑。
  stopOnError = () => false,
}) {
  const cards = [];
  const failed = [];
  let stopped = false;

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
        // 指数退避：1s、2s、4s…上限 8s，别让一次 429 在毫秒内烧光所有尝试
        if (attempt < maxRetries) {
          await sleep(Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS));
        }
      }
    }

    if (lastErr) {
      for (const e of batch) failed.push({ w: e.w, reason: String(lastErr.message ?? lastErr) });
      onProgress({ done: cards.length, failed: failed.length });
      if (stopOnError(lastErr)) { stopped = true; break; }
      continue;
    }

    const byWord = new Map(got.map((c) => [c.w.toLowerCase(), c]));
    for (const e of batch) {
      const card = byWord.get(e.w.toLowerCase());
      if (!card) {
        failed.push({ w: e.w, reason: "模型没有返回这个词" });
        continue;
      }
      // 校验器自己出 bug 也只能算这一张失败，不能把整轮带崩、丢掉已生成的卡片
      let errs;
      try {
        errs = [
          ...validateCard(card, e.w),
          ...(wordBase ? checkCardContent(card, { wordBase, where: e.w }) : []),
        ];
      } catch (err) {
        errs = [`校验时出错：${String(err?.message ?? err)}`];
      }
      if (errs.length) {
        failed.push({ w: e.w, reason: errs.join("；") });
        continue;
      }
      cards.push(card);
    }
    onProgress({ done: cards.length, failed: failed.length });
  }

  return { cards, failed, stopped };
}
