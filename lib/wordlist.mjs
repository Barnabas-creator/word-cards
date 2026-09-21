const NGSL_BAND_LEVEL = { 1000: "A1", 2000: "A2", 3000: "B1" };

export function parseBands(json) {
  const out = [];
  for (const [band, words] of Object.entries(json)) {
    for (const w of Object.keys(words)) out.push({ w: w.toLowerCase(), band: Number(band) });
  }
  return out;
}

export function parseFlat(json) {
  return Object.keys(json).map((w) => ({ w: w.toLowerCase(), band: 0 }));
}

export function assignLevel(band, src) {
  if (src === "NAWL") return "B2";
  if (src === "DET") return "B2+";
  if (src !== "NGSL") throw new Error(`未知的词表来源：${src}`);
  const lvl = NGSL_BAND_LEVEL[band];
  if (!lvl) throw new Error(`未知的 NGSL 频段：${band}`);
  return lvl;
}

export function mergeSources({ ngsl = [], nawl = [], det = [] }) {
  const seen = new Set();
  const out = [];
  const push = (w, band, src) => {
    const key = String(w).trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ w: key, lvl: assignLevel(band, src), src });
  };
  for (const e of ngsl) push(e.w, e.band, "NGSL");
  for (const e of nawl) push(e.w, e.band, "NAWL");
  for (const w of det) push(w, 0, "DET");
  return out;
}
