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
