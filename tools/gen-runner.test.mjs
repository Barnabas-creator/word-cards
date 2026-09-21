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
  const { cards, failed } = await generateCards({ wordlist: wordlist.slice(0, 1), callModel, batchSize: 1, sleep: async () => {} });
  assert.equal(cards.length, 1);
  assert.deepEqual(failed, []);
});

test("连续失败到上限的词落进 failed，不阻断其他批次", async () => {
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    if (ws[0] === "a") throw new Error("boom");
    return reply(ws.map(good));
  };
  const { cards, failed } = await generateCards({ wordlist, callModel, batchSize: 1, maxRetries: 2, sleep: async () => {} });
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

const wordBase = new Set(["a", "b", "c", "nation", "national", "nature"]);

test("内容规则不合格的卡片落进 failed，不进 cards", async () => {
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    return reply(ws.map((w) => ({ ...good(w), ex: "Too short." })));
  };
  const { cards, failed } = await generateCards({
    wordlist: wordlist.slice(0, 1), callModel, wordBase, batchSize: 1, maxRetries: 1,
  });
  assert.deepEqual(cards, []);
  assert.equal(failed.length, 1);
  assert.match(failed[0].reason, /例句词数/);
});

test("fam 成员不是词典词时落进 failed", async () => {
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    return reply(ws.map((w) => ({ ...good(w), fam: ["nationing"] })));
  };
  const { cards, failed } = await generateCards({
    wordlist: wordlist.slice(0, 1), callModel, wordBase, batchSize: 1, maxRetries: 1,
  });
  assert.deepEqual(cards, []);
  assert.match(failed[0].reason, /fam 成员 nationing/);
});

test("conf 成员不是词典词时落进 failed", async () => {
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    return reply(ws.map((w) => ({ ...good(w), conf: ["natureness"] })));
  };
  const { failed } = await generateCards({
    wordlist: wordlist.slice(0, 1), callModel, wordBase, batchSize: 1, maxRetries: 1,
  });
  assert.match(failed[0].reason, /conf 成员 natureness/);
});

test("不传 wordBase 时跳过内容检查，行为不变", async () => {
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    return reply(ws.map((w) => ({ ...good(w), ex: "Too short." })));
  };
  const { cards, failed } = await generateCards({
    wordlist: wordlist.slice(0, 1), callModel, batchSize: 1, maxRetries: 1,
  });
  assert.equal(cards.length, 1);
  assert.deepEqual(failed, []);
});

test("重试之间按指数退避等待，延迟递增", async () => {
  const delays = [];
  const callModel = async () => { throw new Error("429"); };
  const { failed } = await generateCards({
    wordlist: wordlist.slice(0, 1), callModel, batchSize: 1, maxRetries: 4,
    sleep: async (ms) => { delays.push(ms); },
  });
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.equal(failed.length, 1);
});

test("退避上限 8 秒", async () => {
  const delays = [];
  const callModel = async () => { throw new Error("429"); };
  await generateCards({
    wordlist: wordlist.slice(0, 1), callModel, batchSize: 1, maxRetries: 7,
    sleep: async (ms) => { delays.push(ms); },
  });
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 8000, 8000]);
});

// ---- 每日配额耗尽时立刻停，别把剩下的批次全烧成 failed ----

test("stopOnError 命中时立刻停止，剩余批次不被尝试也不进 failed", async () => {
  let calls = 0;
  const callModel = async () => { calls++; throw new Error("HTTP 429 RESOURCE_EXHAUSTED PerDay"); };
  const wordlist = [
    { w: "a", lvl: "A1", src: "NGSL" }, { w: "b", lvl: "A1", src: "NGSL" },
    { w: "c", lvl: "A1", src: "NGSL" },
  ];
  const { cards, failed, stopped } = await generateCards({
    wordlist, callModel, batchSize: 1, maxRetries: 1,
    stopOnError: (err) => /429/.test(err.message),
  });
  assert.equal(stopped, true);
  assert.equal(calls, 1, "第一批失败后就该停手");
  assert.deepEqual(cards, []);
  assert.deepEqual(failed.map((f) => f.w), ["a"], "只有已尝试的那批进 failed");
});

test("stopOnError 不命中时照常跑完全部批次", async () => {
  const good = (w) => ({ w, ipa: "/x/", pos: "n.", zh: "啊", fam: [],
    ex: "The nation voted for change last autumn without any real protest.",
    exZh: "去年秋天全国投票支持变革。", conf: [], c: ["名词"] });
  const reply = (items) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] });
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    return reply(ws.map(good));
  };
  const wordlist = [{ w: "a", lvl: "A1", src: "NGSL" }, { w: "b", lvl: "A1", src: "NGSL" }];
  const { cards, stopped } = await generateCards({
    wordlist, callModel, batchSize: 1, stopOnError: () => true,
  });
  assert.equal(stopped, false);
  assert.equal(cards.length, 2);
});

test("批次处理中的意外异常不会逃出 generateCards，已生成的卡片不丢", async () => {
  const good = (w) => ({ w, ipa: "/x/", pos: "n.", zh: "啊", fam: [],
    ex: "The nation voted for change last autumn without any real protest.",
    exZh: "去年秋天全国投票支持变革。", conf: [], c: ["名词"] });
  const reply = (items) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] });
  let n = 0;
  const callModel = async (body) => {
    const ws = body.contents[0].parts[0].text.split("这批词：\n")[1].split("\n");
    n++;
    // 第二批返回一个畸形条目：w 不是字符串，下游取 .toLowerCase() 会抛
    if (n === 2) return reply([{ ...good(ws[0]), w: 12345 }]);
    return reply(ws.map(good));
  };
  const wordlist = [
    { w: "a", lvl: "A1", src: "NGSL" }, { w: "b", lvl: "A1", src: "NGSL" },
    { w: "c", lvl: "A1", src: "NGSL" },
  ];
  const { cards, failed } = await generateCards({ wordlist, callModel, batchSize: 1, maxRetries: 1 });
  assert.deepEqual(cards.map((c) => c.w), ["a", "c"], "第一批和第三批的卡片必须保住");
  assert.deepEqual(failed.map((f) => f.w), ["b"]);
});
