// 英语屈折规则的唯一出处：生成形（wordForms）与容忍判定（isRealWord）都放在这里，
// 避免两套规则各自演化出不一致的结论。

const VOWELS = "aeiou";
const isVowel = (ch) => typeof ch === "string" && VOWELS.includes(ch);

// 结尾是辅音就生成双写变体：admit→admitted、begin→beginning、travel→travelled
// 这类多音节动词也要覆盖到。排除 w/x/y 结尾（play 不生成 playyed）。
function endsInConsonant(w) {
  if (w.length < 2) return false;
  const last = w.at(-1);
  if (!/^[a-z]$/.test(last) || "wxy".includes(last)) return false;
  return !isVowel(last);
}

// 不规则变形规则生成不出来，只能列表。收的是 NGSL/NAWL 里出现的高频词：
// 例句写 "She gave him the book" 时，词头 give 必须算作出现过，否则好卡片会被误判。
const IRREGULAR = {
  be: ["am", "is", "are", "was", "were", "been", "being"],
  have: ["has", "had", "having"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
  say: ["says", "said"],
  get: ["gets", "got", "gotten", "getting"],
  make: ["makes", "made", "making"],
  know: ["knows", "knew", "known"],
  think: ["thinks", "thought"],
  take: ["takes", "took", "taken", "taking"],
  see: ["sees", "saw", "seen", "seeing"],
  come: ["comes", "came", "coming"],
  give: ["gives", "gave", "given", "giving"],
  find: ["finds", "found"],
  tell: ["tells", "told"],
  become: ["becomes", "became", "becoming"],
  leave: ["leaves", "left", "leaving"],
  feel: ["feels", "felt"],
  put: ["puts", "putting"],
  bring: ["brings", "brought"],
  begin: ["begins", "began", "begun", "beginning"],
  keep: ["keeps", "kept", "keeping"],
  hold: ["holds", "held"],
  write: ["writes", "wrote", "written", "writing"],
  stand: ["stands", "stood"],
  hear: ["hears", "heard"],
  let: ["lets", "letting"],
  mean: ["means", "meant"],
  set: ["sets", "setting"],
  meet: ["meets", "met", "meeting"],
  run: ["runs", "ran", "running"],
  pay: ["pays", "paid", "paying"],
  sit: ["sits", "sat", "sitting"],
  speak: ["speaks", "spoke", "spoken"],
  lie: ["lies", "lay", "lain", "lying"],
  lead: ["leads", "led", "leading"],
  read: ["reads", "reading"],
  grow: ["grows", "grew", "grown"],
  lose: ["loses", "lost", "losing"],
  fall: ["falls", "fell", "fallen", "falling"],
  send: ["sends", "sent"],
  build: ["builds", "built", "building"],
  understand: ["understands", "understood"],
  draw: ["draws", "drew", "drawn"],
  break: ["breaks", "broke", "broken", "breaking"],
  spend: ["spends", "spent", "spending"],
  cut: ["cuts", "cutting"],
  rise: ["rises", "rose", "risen", "rising"],
  drive: ["drives", "drove", "driven", "driving"],
  buy: ["buys", "bought", "buying"],
  wear: ["wears", "wore", "worn"],
  choose: ["chooses", "chose", "chosen", "choosing"],
  seek: ["seeks", "sought"],
  throw: ["throws", "threw", "thrown"],
  catch: ["catches", "caught", "catching"],
  deal: ["deals", "dealt", "dealing"],
  win: ["wins", "won", "winning"],
  teach: ["teaches", "taught", "teaching"],
  fight: ["fights", "fought"],
  sell: ["sells", "sold", "selling"],
  eat: ["eats", "ate", "eaten", "eating"],
  sleep: ["sleeps", "slept", "sleeping"],
  drink: ["drinks", "drank", "drunk", "drinking"],
  sing: ["sings", "sang", "sung", "singing"],
  hit: ["hits", "hitting"],
  arise: ["arises", "arose", "arisen", "arising"],
  // 不规则名词复数
  child: ["children"],
  person: ["people", "persons"],
  man: ["men"],
  woman: ["women"],
  foot: ["feet"],
  tooth: ["teeth"],
  mouse: ["mice"],
  life: ["lives"],
  wife: ["wives"],
  knife: ["knives"],
  leaf: ["leaves"],
  half: ["halves"],
  shelf: ["shelves"],
  wolf: ["wolves"],
  analysis: ["analyses"],
  basis: ["bases"],
  crisis: ["crises"],
  thesis: ["theses"],
  hypothesis: ["hypotheses"],
  criterion: ["criteria"],
  phenomenon: ["phenomena"],
  datum: ["data"],
  medium: ["media"],
  index: ["indices", "indexes"],
  matrix: ["matrices"],
  // 不规则比较级
  good: ["better", "best"],
  bad: ["worse", "worst"],
  far: ["further", "farther", "furthest", "farthest"],
  little: ["less", "least"],
  much: ["more", "most"],
  many: ["more", "most"],
};

// 给词头生成常规屈折形，用于判定例句里是否出现了这个词。
// 这里故意宽松过头：唯一的调用方 exMentions 只做「例句里出现没出现」的召回判定，
// 生成集合里混入几个不存在的词形是无害的（假词永远不会出现在例句里），
// 但漏生成一个真实存在的派生形会把好卡片误判成「例句未出现词头」。
export function wordForms(word) {
  const w = String(word).toLowerCase();
  const forms = new Set([w, w + "s", w + "ed", w + "ing", w + "es"]);

  // -es 只加在 s/x/z/ch/sh 之后：box→boxes（上面已经无条件加过一次，这里保留只是为了不改动原有逻辑）
  if (/(?:s|x|z|ch|sh)$/.test(w)) forms.add(w + "es");

  // 词尾哑 e：hope→hoped / hoping
  if (w.endsWith("e")) {
    forms.add(w.slice(0, -1) + "ed");
    forms.add(w.slice(0, -1) + "ing");
  }

  // 辅音 + y 才变 i：study→studies/studied，但 play 不生成 plaies/plaied
  if (w.endsWith("y") && w.length >= 2 && !isVowel(w.at(-2))) {
    forms.add(w.slice(0, -1) + "ies");
    forms.add(w.slice(0, -1) + "ied");
  }

  if (endsInConsonant(w)) {
    const last = w.at(-1);
    forms.add(w + last + "ed");
    forms.add(w + last + "ing");
  }

  // 规则生成不出来的那些，查表补上
  // 必须用 Object.hasOwn：IRREGULAR 是普通对象，继承了 Object.prototype。
  // 否则词恰好是 constructor / toString 时取到的是函数，for…of 一迭代就崩。
  // constructor 正好是 NAWL 里 construct 的词族成员。
  if (Object.hasOwn(IRREGULAR, w)) for (const f of IRREGULAR[w]) forms.add(f);

  return forms;
}

const SUFFIXES = ["s", "es", "ed", "ing"];

// 故意宽松：它只用来「否决」假词候选，宽松的方向才是安全的。
// 需要严格的词典成员判定请用 wordbase.mjs 的 isExactWord。
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
