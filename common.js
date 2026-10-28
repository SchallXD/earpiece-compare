// 一覧ページと比較ページで共通の処理（データ読み込み・選択状態・シルエット・レーダー・詳細ダイアログ）
const MAX_COMPARE = 4;
const COLOR_VARS = ["--c1", "--c2", "--c3", "--c4"];
const STORE_KEY = window.SEL_KEY || "earpiece-compare-selection"; // リケーブルのページは別の保存先を使う
const MY_KEY = "earpiece-compare-my"; // お気に入り・メモ・耳のサイズ（この端末だけに保存）

let data = { axes: [], items: [] };
let selected = []; // [{ id, size }]
let my = { cap: null, notes: {} }; // notes: { id: { fav, owned, memo } }

function loadMy() {
  try { my = { cap: null, notes: {}, ...JSON.parse(localStorage.getItem(MY_KEY) || "{}") }; } catch { /* 読めなくても初期値で動く */ }
}
function saveMy() {
  try { localStorage.setItem(MY_KEY, JSON.stringify(my)); } catch { /* 保存できない環境でも動作は続ける */ }
}
const noteOf = (id) => my.notes[id] || {};
function setNote(id, patch) {
  const n = { ...noteOf(id), ...patch };
  if (!n.fav && !n.owned && !n.memo) delete my.notes[id]; else my.notes[id] = n;
  saveMy();
  document.dispatchEvent(new Event("notechange-app"));
}

const $ = (sel) => document.querySelector(sel);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 価格は販売店の規約上転載できないため載せない。購入先は出典の「購入先：」のリンクだけを出す
const buyLinks = (it) => (it.sources || []).filter((s) => s.label.startsWith("購入先："));

// 素材の大分類（絞り込み用）
function materialGroup(m) {
  if (/コア/.test(m)) return "メタルコア付き";
  if (/^ハイブリッド/.test(m)) return "ハイブリッド（シリコン＋フォーム）";
  if (/^フォーム/.test(m)) return "フォーム";
  if (/TPE|エラストマー/.test(m)) return "TPE・エラストマー";
  return "シリコン";
}

// 寸法の目安（M サイズの分布から：傘径は 12〜13mm、高さは 8〜10mm、内径は 3.8〜4.5mm が中央付近）
const DIM_LEVELS = {
  cap: (v) => (v < 12 ? "小さめ" : v > 13 ? "大きめ" : "標準"),
  height: (v) => (v < 8 ? "短め" : v > 10 ? "長め" : "標準"),
  bore: (v) => (v < 3.8 ? "細め" : v > 4.5 ? "太め" : "標準"),
};
const fmt = (v) => (v == null ? null : Number.isInteger(v) ? `${v}` : `${Math.round(v * 10) / 10}`);
// 一覧カード・詳細で使う「傘の大きさ・軸の長さ・ノズル穴」の 3 項目
function dimStripHtml(it) {
  const s = defaultSize(it);
  const nozzle = it.nozzleFit && it.nozzleFit !== "—" && /\d/.test(it.nozzleFit) && !it.forDevice ? it.nozzleFit.replace(/（.*?）/g, "") : null;
  const cell = (label, v, level, hint) => `<div class="dim${v == null ? " na" : ""}"><span class="dim-label">${label}</span>
    <b>${v == null ? "—" : `${v}<small>mm</small>`}</b>${v != null ? `<span class="lv lv-${level === "標準" ? "mid" : level === "小さめ" || level === "短め" || level === "細め" ? "lo" : "hi"}">${level}</span>` : ""}${hint ? `<span class="dim-hint">${hint}</span>` : ""}</div>`;
  const cap = s.capDiameter, h = s.height, bore = s.boreDiameter;
  return `<div class="dims" title="${esc(s.size || "")}サイズの寸法">
    ${cell("傘の大きさ", fmt(cap), cap != null && DIM_LEVELS.cap(cap))}
    ${cell("軸の長さ", fmt(h), h != null && DIM_LEVELS.height(h))}
    ${cell("ノズル穴", fmt(bore), bore != null && DIM_LEVELS.bore(bore), nozzle ? `対応 ${esc(nozzle)}` : it.forDevice ? esc(it.forDevice) + "用" : "")}
  </div><div class="dims-size">${s.size && s.size !== "—" ? `${esc(s.size)}サイズの寸法${it.sizes.length > 1 ? `（全${it.sizes.length}サイズ）` : ""}` : "寸法未公表"}</div>`;
}

// 情報の確かさ（カードの印）。寸法は出典の書き方から、音の傾向は根拠の種類から分ける
function dimConfidence(it) {
  const src = it.dimSource || "";
  if (!drawable(it) && !(it.sizes || []).some((s) => s.capDiameter != null)) return { label: "未公表", lv: "na" };
  if (/同じ|同形状|同シリーズ|後継|の公称値（|の仕様（Audio46）|Type W/.test(src)) return { label: "同形状品の値", lv: "lo" };
  if (/^傘径|高さは未公表|のみ/.test(src)) return { label: "一部のみ", lv: "mid" };
  if (/メーカー|公称|寸法図|図面|パッケージ/.test(src)) return { label: "メーカー公称", lv: "hi" };
  if (/実測/.test(src)) return { label: "実測", lv: "hi" };
  return { label: "販売店・記事", lv: "mid" };
}
function soundConfidence(it) {
  if (!hasScores(it)) return { label: "未評価", lv: "na" };
  return { web: { label: "海外レビュー中心", lv: "mid" }, desc: { label: "メーカー説明のみ", lv: "lo" }, type: { label: "素材からの推定", lv: "lo" } }[it.scoreBasis]
    || { label: "レビュー多数", lv: "hi" };
}
function confidenceHtml(it) {
  const d = dimConfidence(it), snd = soundConfidence(it);
  const tip = { hi: "確度：高い", mid: "確度：中くらい", lo: "確度：低め", na: "情報なし" };
  return `<div class="conf">
    <span class="cf cf-${d.lv}" title="${esc(tip[d.lv])}（寸法の出典：${esc(it.dimSource || "—")}）"><i></i>寸法：${d.label}</span>
    <span class="cf cf-${snd.lv}" title="${esc(tip[snd.lv])}（${esc(it.scoreBasis ? BASIS[it.scoreBasis] : "レビューをまとめた評価")}）"><i></i>音の傾向：${snd.label}</span>
  </div>`;
}

// 検索：全角半角・大文字小文字・ひらがなカタカナの違いを無視し、英語表記の名前はカナ読みでも探せるようにする
const normText = (s) => (s || "").normalize("NFKC").toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s・\-_.／/]+/g, "");
const READINGS = [
  ["64 audio", "ろくよんおーでぃお シックスティーフォーオーディオ"], ["azla", "アズラ"], ["acoustune", "アコースチューン"], ["artio", "アルティオ"],
  ["crystalline", "クリスタリン"], ["ctm", "シーティーエム"], ["comply", "コンプライ"], ["divinus", "ディヴィナス ディビナス"], ["eloit", "エロイト"],
  ["dunu", "ダヌー ドゥヌー"], ["dekoni", "デコニ"], ["eletech", "エレテック イーレテック"], ["effect audio", "エフェクトオーディオ"], ["sglrty", "シンギュラリティ"],
  ["fsc", "エフエスシー"], ["faudio", "エフオーディオ"], ["fender", "フェンダー"], ["ikko", "イッコー イッコ"], ["juzear", "ジューズイヤー"],
  ["jvc", "ジェイブイシー"], ["victor", "ビクター ビクタ"], ["kz", "ケーゼット"], ["keybudz", "キーバッズ"], ["kiwi ears", "キウイイヤーズ"],
  ["lepic", "レピック"], ["madoo", "マドゥー"], ["moondrop", "ムーンドロップ 水月雨"], ["mandarines", "マンダリンイーエス"], ["nobunaga", "ノブナガ 信長"],
  ["nuarl", "ヌアール"], ["nostalgia", "ノスタルジア"], ["oriolus", "オリオラス"], ["pentaconn", "ペンタコン"], ["qoa", "キューオーエー"],
  ["rha", "アールエイチエー"], ["rhapsodio", "ラプソディオ"], ["rose technics", "ローズテクニクス"], ["shanling", "シャンリン"], ["sony", "ソニー"],
  ["soso.labo", "ソソラボ"], ["softears", "ソフトイヤーズ"], ["spinfit", "スピンフィット"], ["tanchjim", "タンチジム"], ["tangzu", "タンズー"],
  ["twistura", "ツイスチュラ"], ["ultimate ears", "アルティメットイヤーズ"], ["unique melody", "ユニークメロディ"], ["zero audio", "ゼロオーディオ"],
  ["ddhifi", "ディーディーハイファイ"], ["epro", "イープロ"], ["final", "ファイナル"], ["intime", "インタイム"], ["ortofon", "オルトフォン"],
  ["qdc", "キューディーシー"], ["radius", "ラディウス"], ["airpods", "エアーポッズ エアポッズ"], ["sednaearfit", "セドナイヤーフィット セドナ"],
  ["symbio", "シンビオ"], ["bulletz", "バレッツ"], ["velvet", "ベルベット"], ["block ear", "ブロックイヤー"], ["crystal", "クリスタル"],
  ["baroque", "バロック"], ["truegrip", "トゥルーグリップ"], ["coreir", "コレイル"], ["i-planet", "アイプラネット"], ["magic ear", "マジックイヤー"],
  ["xelastec", "ゼラステック"], ["wireless", "ワイヤレス"], ["foamax", "フォーマックス"], ["soundcocoon", "サウンドコクーン"], ["rococo", "ロココ"],
  ["hyperfoam", "ハイパーフォーム"], ["omni", "オムニ"], ["lucent", "ルーセント"], ["spiral dot", "スパイラルドット"], ["double", "ダブル"],
  ["silicone", "シリコン"], ["foam", "フォーム"], ["tws", "完全ワイヤレス"],
].map(([en, kana]) => [normText(en), normText(kana)]);
// 製品ごとの検索用テキスト（初回に作って保存）
function searchText(it) {
  if (it._search) return it._search;
  const base = normText([it.name, it.brand, it.material, it.summary, it.soundChange, it.goodFor, ...(it.features || []), ...(it.reviewPoints || [])].join(" "));
  const kana = READINGS.filter(([en]) => base.includes(en)).map(([, k]) => k).join(" ");
  return (it._search = base + " " + kana);
}
// スペース区切りの語はすべて含むもの（AND）
const matchesQuery = (it, q) => q.split(/[\s　]+/).map(normText).filter(Boolean).every((w) => searchText(it).includes(w));

// 使い方：AirPods 専用・完全ワイヤレス向け（短軸・TWS 用）・それ以外
function useOf(it) {
  if (it.forDevice) return "airpods";
  const text = [it.name, it.summary, it.goodFor, ...(it.features || [])].join(" ");
  const m = (it.sizes || []).find((s) => s.size === "M");
  if ((m && m.height != null && m.height <= 8) || /TWS|TWE|ワイヤレス|True ?Wireless|Truly Wireless/i.test(text)) return "tws";
  return "wired";
}
const mm = (v) => (v == null ? "—" : `${v} mm`);

const byId = (id) => data.items.find((it) => it.id === id);
const NO_SIZE = { size: "—" };
// シルエットを描ける（傘径と高さが分かる）サイズかどうか
const hasDims = (s) => s && s.capDiameter != null && s.height != null;
const drawable = (item) => (item.sizes || []).some(hasDims);
// 耳のサイズ（傘径）が設定されていれば一番近いサイズ、なければ M を使う
const nearestSize = (item, cap) => {
  const withCap = item.sizes.filter((s) => s.capDiameter != null);
  if (!withCap.length) return null;
  return withCap.reduce((a, b) => (Math.abs(b.capDiameter - cap) < Math.abs(a.capDiameter - cap) ? b : a));
};
const defaultSize = (item) => {
  if (my.cap) { const n = nearestSize(item, my.cap); if (n) return n; }
  const pool = item.sizes.filter(hasDims).length ? item.sizes.filter(hasDims) : item.sizes;
  return pool.find((s) => s.size === "M") || pool[Math.floor(pool.length / 2)] || NO_SIZE;
};
const sizeOf = (item, size) => item.sizes.find((s) => s.size === size) || defaultSize(item);
const hasScores = (item) => item.scores && Object.values(item.scores).some((v) => v != null);
const BASIS = { web: "海外ショップ・フォーラムのレビューとメーカー説明から推定", desc: "レビューが無いためメーカー説明から推定", type: "情報がほとんど無いため素材・形状の一般的な傾向から推定（参考程度）" };

async function loadData() {
  loadMy();
  const res = await fetch(window.DATA_URL || "data/earpieces.json", { cache: "no-cache" });
  data = await res.json();
}

// ホーム画面に追加したときに電波が弱くても開けるようにする
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ---------- 似ている製品（音の傾向スコアの近さ＋素材） ---------- */

function similarItems(it, n = 4) {
  if (!hasScores(it)) return [];
  const dist = (o) => Math.hypot(...data.axes.map((a) => (it.scores[a.key] ?? 3) - (o.scores[a.key] ?? 3))) + (o.material === it.material ? 0 : 0.6);
  const ranked = data.items.filter((o) => o.id !== it.id && hasScores(o) && (o.forDevice || "") === (it.forDevice || "")).map((o) => ({ o, d: dist(o) })).sort((a, b) => a.d - b.d);
  const near = ranked.slice(0, n).map((x) => x.o);
  return near;
}

function miniCards(items) {
  return `<div class="mini-list">${items.map((o) => `
    <button class="mini" data-goto="${esc(o.id)}">
      <span class="mini-photo">${thumbHtml(o, { labels: false })}</span>
      <span class="mini-body"><strong>${esc(o.name)}</strong><small>${esc(o.brand)}</small></span>
    </button>`).join("")}</div>`;
}

/* ---------- 選択状態（ページ間はブラウザに記憶、共有用に比較ページのURLにも入れる） ---------- */

function loadSelection() {
  const m = location.hash.match(/c=([^&]+)/);
  if (m) {
    selected = decodeURIComponent(m[1]).split(",").map((s) => { const [id, size] = s.split(":"); return { id, size }; });
  } else {
    try { selected = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { selected = []; }
  }
  selected = selected.filter((s) => byId(s.id)).slice(0, MAX_COMPARE);
}

function saveSelection() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(selected)); } catch { /* 保存できない環境でも動作は続ける */ }
}

const selectionHash = () => selected.length ? `#c=${encodeURIComponent(selected.map((s) => `${s.id}:${s.size}`).join(","))}` : "";

function toggleSelect(id) {
  const i = selected.findIndex((s) => s.id === id);
  if (i >= 0) selected.splice(i, 1);
  else if (selected.length < MAX_COMPARE) selected.push({ id, size: defaultSize(byId(id)).size });
  saveSelection();
  document.dispatchEvent(new Event("selectionchange-app"));
}

/* ---------- 写真 ---------- */

// 写真は各社の規約で利用が認められていないため現在は載せていない（images は空）。許可を得た画像だけを直接読み込む（コピーはしない）。Shopify の CDN は幅指定で縮小版を取れる
const imgUrl = (u, w) => (u.includes("cdn.shopify.com") ? `${u}${u.includes("?") ? "&" : "?"}width=${w}` : u);

function silhouetteHtml(item) {
  if (!item.sizes) return `<span class="nodims">写真なし</span>`;
  if (!drawable(item)) return `<span class="nodims">寸法未公表</span>`;
  return silhouetteSvg([{ item, s: defaultSize(item), color: css("--muted") }], { grid: false, labels: false });
}

// 読み込めなかった写真は寸法シルエットに差し替える
function photoHtml(img, alt, w, extra = "") {
  return `<img src="${esc(imgUrl(img.url, w))}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" ${extra}
    onerror="this.hidden=true;this.nextElementSibling&&(this.nextElementSibling.hidden=false)">`;
}

/* ---------- 製品のイラスト（写真の代わり） ---------- */

// 色を混ぜる（t=0 で a、1 で b）
const mixHex = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
const isFoamItem = (it) => /^(フォーム|ハイブリッド)/.test(it.material) || /フォーム|ウレタン/.test(it.material);

// 上端（u=0）から下端（u=1）までの半径。図面の輪郭があればそれ、無ければ形状タイプの近似
function radiusFn(item, s) {
  const R = s.capDiameter / 2;
  if (item.outline && drawable(item)) {
    const pts = item.outline.filter(([, w]) => w != null);
    const wmax = Math.max(...pts.map(([, w]) => w));
    return (u) => {
      let j = pts.findIndex(([t]) => t >= u);
      if (j <= 0) return (pts[Math.max(j, 0)][1] / wmax) * R;
      const [t0, w0] = pts[j - 1], [t1, w1] = pts[j];
      return ((w0 + ((w1 - w0) * (u - t0)) / (t1 - t0 || 1)) / wmax) * R;
    };
  }
  const t = Math.min(R * 0.85, s.openingDiameter != null ? s.openingDiameter / 2 + 0.4 : s.boreDiameter != null ? s.boreDiameter / 2 + 1.0 : R * 0.45);
  const U = (s.upperDiameter ?? s.capDiameter * 0.7) / 2;
  const ease = (x) => Math.sin((Math.min(1, Math.max(0, x)) * Math.PI) / 2);
  return {
    dome: (u) => t + (R - t) * ease(u) ** 0.55,
    tapered: (u) => t + (R - t) * ease(u / 0.45) ** 0.5,
    bell: (u) => t + (R - t) * u ** 1.5,
    flat: (u) => R * (0.74 + 0.26 * ease(u / 0.45) ** 0.6),
    straight: () => R,
    sphere: (u) => (u < 0.6 ? t + (R - t) * ease(u / 0.6) : R - R * 0.18 * ((u - 0.6) / 0.4) ** 2),
    double: (u) => (u < 0.5 ? t + (U - t) * ease(u / 0.5) ** 0.6 : u < 0.56 ? U * 0.9 : U * 0.9 + (R - U * 0.9) * ((u - 0.56) / 0.44) ** 0.7),
  }[item.profile] || ((u) => t + (R - t) * ease(u) ** 0.55);
}

// 斜め上から見た立体のイラスト。断面の楕円を下から順に重ねて回転体を描く
function tipSvg(item) {
  const known = drawable(item);
  const s = known ? defaultSize(item) : { capDiameter: 12, height: 9, boreDiameter: 4 };
  const foam = isFoamItem(item);
  const look = item.look || { cap: foam ? "#2a2a2d" : "#9a9ca0", core: foam ? "#2a2a2d" : "#7a7c80", clear: false };
  const { cap, core, clear } = look;
  const id = "tg-" + item.id;
  const h = totalHeightOf(s), R = s.capDiameter / 2;
  const rf = radiusFn(item, s);
  const SIN = 0.45, COS = 0.89, N = 36;
  const dark = mixHex(cap, "#000000", 0.5), light = mixHex(cap, "#ffffff", clear ? 0.6 : foam ? 0.12 : 0.38);
  const r0 = rf(0);
  const bi = (s.boreDiameter ?? Math.min(4, r0 * 1.2)) / 2;
  const hole = Math.min(r0 * 0.92, s.openingDiameter != null ? s.openingDiameter / 2 : bi + 0.7);
  const stemH = Math.min(h * 0.95, s.stemHeight ?? h * 0.85);
  const E = (cy, rx, extra) => `<ellipse cx="0" cy="${cy.toFixed(3)}" rx="${rx.toFixed(3)}" ry="${(rx * SIN).toFixed(3)}" ${extra}/>`;
  const sections = [];
  for (let j = N; j >= 0; j--) { const u = j / N; sections.push([u * h * COS, rf(u)]); }
  const edge = clear ? mixHex(cap, "#000000", 0.4) : mixHex(cap, "#000000", 0.6);
  // 外形：x ごとに、すべての断面の楕円の上端の最小と下端の最大を取る（楕円を重ねた形の輪郭そのもの）
  const Rmax = Math.max(...sections.map(([, r]) => r));
  const xs = Array.from({ length: 61 }, (_, i) => -Rmax + (2 * Rmax * i) / 60);
  const up = [], lo = [];
  for (const x of xs) {
    let a = Infinity, b = -Infinity;
    for (const [y, r] of sections) {
      if (Math.abs(x) > r) continue;
      const dy = r * SIN * Math.sqrt(1 - (x / r) ** 2);
      a = Math.min(a, y - dy); b = Math.max(b, y + dy);
    }
    if (a < Infinity) { up.push([x, a]); lo.push([x, b]); }
  }
  const outline = "M" + [...up, ...lo.reverse()].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" L") + " Z";
  const body = `<path d="${outline}"/>`;
  // 軸（透明な傘のときは外から透けて見える）
  const tube = `<rect x="${-(bi + 0.6)}" y="0" width="${2 * (bi + 0.6)}" height="${(stemH * COS).toFixed(3)}" fill="url(#${id}-c)"/>${E(stemH * COS, bi + 0.6, `fill="${mixHex(core, "#000000", 0.3)}"`)}`;
  const defs = `<defs>
    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${-R}" y1="0" x2="${R}" y2="0">
      <stop offset="0" stop-color="${dark}"/><stop offset=".28" stop-color="${light}"/><stop offset=".5" stop-color="${cap}"/>
      <stop offset=".85" stop-color="${mixHex(cap, "#000000", 0.3)}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="${id}-c" gradientUnits="userSpaceOnUse" x1="${-bi - 0.6}" y1="0" x2="${bi + 0.6}" y2="0">
      <stop offset="0" stop-color="${mixHex(core, "#000000", 0.45)}"/><stop offset=".35" stop-color="${mixHex(core, "#ffffff", 0.3)}"/><stop offset="1" stop-color="${mixHex(core, "#000000", 0.4)}"/></linearGradient>
    ${foam ? `<filter id="${id}-f" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="4" numOctaves="2" seed="3"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.5 -0.6" result="dots"/><feComposite in="dots" in2="SourceAlpha" operator="in" result="d2"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="d2"/></feMerge></filter>` : ""}
  </defs>`;
  const topFace = E(0, r0, `fill="${mixHex(cap, "#ffffff", clear ? 0.45 : foam ? 0.08 : 0.2)}"`);
  const holeEl = E(0, hole, `fill="${mixHex(clear ? core : cap, "#000000", 0.55)}"`);
  const ring = E(0, Math.min(hole, bi + 0.6), `fill="${mixHex(core, "#ffffff", 0.15)}"`) + E(0.12, bi, `fill="#111114"`);
  const g = `
    ${clear ? tube : ""}
    <g fill="url(#${id})" fill-opacity="${clear ? 0.32 : 1}" stroke="${edge}" stroke-width="${(R * 0.035).toFixed(3)}" stroke-linejoin="round" ${foam ? `filter="url(#${id}-f)"` : ""}>${body}</g>
    <g opacity="${clear ? 0.75 : 1}">${topFace}</g>${holeEl}${ring}
    ${clear ? `<path d="M${(-R * 0.55).toFixed(2)},${(h * COS * 0.35).toFixed(2)} q${(-R * 0.25).toFixed(2)},${(h * COS * 0.3).toFixed(2)} ${(-R * 0.15).toFixed(2)},${(h * COS * 0.55).toFixed(2)}" stroke="#ffffff" stroke-opacity=".45" stroke-width="${(R * 0.05).toFixed(2)}" stroke-linecap="round" fill="none"/>` : ""}`;
  // 表示範囲（上の楕円の上端〜下の楕円の下端）
  const top = Math.min(...up.map(([, y]) => y)) - 0.3, bottom = Math.max(...lo.map(([, y]) => y)) + 0.3;
  const span = Math.max(2 * Rmax + 0.6, bottom - top) * 1.32;
  const vb = `${(-span / 2).toFixed(2)} ${((top + bottom) / 2 - span / 2).toFixed(2)} ${span.toFixed(2)} ${span.toFixed(2)}`;
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(item.name)}のイラスト">${defs}${g}</svg>`;
}

function thumbHtml(item, opts) {
  const img = item.images?.[0];
  if (!img) return `<span class="card-sil">${tipSvg(item)}</span>`;
  return `${photoHtml(img, item.name, 480)}<span class="sil" hidden>${silhouetteHtml(item)}</span>`;
}

function galleryHtml(item) {
  const imgs = item.images || [];
  if (!imgs.length) return `<div class="gallery-main"><span class="card-sil">${tipSvg(item)}</span></div>
    <p class="note">イラストは寸法と製品の色をもとに描いた目安です（実物の写真ではありません）。</p>`;
  return `
    <div class="gallery-main">${photoHtml(imgs[0], item.name, 1000, 'id="gmain"')}<span class="sil" hidden>${silhouetteHtml(item)}</span></div>
    <div class="gallery-strip">${imgs.map((g, i) => `
      <button class="gthumb${i === 0 ? " on" : ""}" data-i="${i}" aria-label="写真${i + 1}">${photoHtml(g, item.name, 160)}</button>`).join("")}
    </div>
    <p class="note" id="gcredit"></p>`;
}

function bindGallery(dlg, item) {
  const imgs = item.images || [];
  const main = dlg.querySelector("#gmain");
  const credit = dlg.querySelector("#gcredit");
  const show = (i) => {
    if (!main) return;
    main.hidden = false;
    main.src = imgUrl(imgs[i].url, 1000);
    credit.innerHTML = `写真：<a href="${esc(imgs[i].page)}" target="_blank" rel="noopener">${esc(imgs[i].source)}</a>（${i + 1} / ${imgs.length}）`;
    dlg.querySelectorAll(".gthumb").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
  };
  dlg.querySelectorAll(".gthumb").forEach((b) => b.addEventListener("click", () => show(Number(b.dataset.i))));
  if (imgs.length) show(0);
}

/* ---------- レーダー（SVG。サムネイル用は小さく、詳細用は軸名つき） ---------- */

// axes を省略すると音の傾向スコア（data.axes）
function radarSvg(series, { size = 120, labels = false, axes = data.axes, title = "音の傾向スコア" } = {}) {
  const n = axes.length;
  const pad = labels === "short" ? 15 : labels ? 34 : 6;
  const R = size / 2 - pad;
  const cx = size / 2, cy = size / 2;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * R * (v / 5), cy + Math.sin(a) * R * (v / 5)];
  };
  const line = css("--line"), muted = css("--muted"), text = css("--text");
  let g = "";
  for (let lv = 1; lv <= 5; lv++) {
    g += `<polygon points="${axes.map((_, i) => pt(i, lv).join(",")).join(" ")}" fill="none" stroke="${line}" stroke-width="${lv === 5 ? 1 : 0.6}"/>`;
  }
  axes.forEach((a, i) => {
    const [x, y] = pt(i, 5);
    g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${line}" stroke-width="0.6"/>`;
    if (labels) {
      const short = labels === "short";
      const [lx, ly] = pt(i, short ? 6.4 : 6.3);
      g += `<text x="${lx}" y="${ly}" font-size="${short ? 8 : 10}" text-anchor="middle" dominant-baseline="middle" fill="${short ? muted : text}">${esc(short ? a.short || a.label : a.label)}</text>`;
    }
  });
  series.forEach(({ values, color }) => {
    const ps = axes.map((a, i) => pt(i, values[a.key] ?? 0).join(",")).join(" ");
    g += `<polygon points="${ps}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="${labels === true ? 2 : 1.5}" stroke-linejoin="round"/>`;
  });
  if (labels === true) g += `<text x="${cx + 3}" y="${pt(0, 5)[1] + 9}" font-size="8" fill="${muted}">5</text>`;
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">${g}</svg>`;
}


/* ---------- サイズのシルエット（単位は mm） ---------- */

// 寸法（傘径・高さ・開口部・内径・軸長）は数値どおり。輪郭は図面から読み取った outline、無ければ形状タイプの模式形。
const capHeightOf = (s) => s.capHeight ?? s.height;
const totalHeightOf = (s) => Math.max(s.height, s.stemHeight ?? 0);

function capOutline(s, profile) {
  const r = s.capDiameter / 2;
  const ch = capHeightOf(s);
  const t = Math.min(
    r * 0.85,
    s.openingDiameter != null ? s.openingDiameter / 2 + 0.4 : s.boreDiameter != null ? s.boreDiameter / 2 + 1.0 : r * 0.45
  );
  const u = (s.upperDiameter ?? s.capDiameter * 0.7) / 2;
  // 左半分（上端→下端）の輪郭。右側は x を反転して使う
  const left = {
    dome: `M${-t},0 C${-r * 0.95},0 ${-r},${ch * 0.55} ${-r * 0.96},${ch}`,
    tapered: `M${-t},0 C${-r * 0.9},0 ${-r},${ch * 0.25} ${-r},${ch * 0.55} L${-r * 0.97},${ch}`,
    bell: `M${-t},0 C${-t - 0.6},${ch * 0.15} ${-r},${ch * 0.35} ${-r * 0.98},${ch}`,
    flat: `M${-t},0 L${-r * 0.72},0 Q${-r},0 ${-r},${ch * 0.45} L${-r},${ch}`,
    straight: `M${-r + 0.8},0 Q${-r},0 ${-r},0.8 L${-r},${ch}`,
    sphere: `M${-t},0 C${-r},0 ${-r * 1.08},${ch * 0.6} ${-r * 0.82},${ch}`,
    double: `M${-t},0 C${-u},0 ${-u},${ch * 0.3} ${-u * 0.9},${ch * 0.5} C${-r * 0.7},${ch * 0.55} ${-r},${ch * 0.75} ${-r},${ch}`,
  }[profile] || "";
  const right = left.replace(/(-?\d*\.?\d+(?:e-?\d+)?),(-?\d*\.?\d+)/g, (_, x, y) => `${-Number(x)},${y}`);
  const top = profile === "straight" ? `M${-r + 0.8},0 L${r - 0.8},0` : `M${-t},0 L${t},0`;
  return `${left} ${right} ${top}`;
}

// outline は図面から読み取った [上端からの位置 0〜1, 半幅 / 最大半幅] の列。寸法の数値で縦横に伸縮して閉じた輪郭にする
function outlinePath(s, outline) {
  const r = s.capDiameter / 2;
  const h = totalHeightOf(s);
  const pts0 = outline.filter(([, w]) => w != null);
  const wmax = Math.max(...pts0.map(([, w]) => w)); // 最大幅がちょうど傘径になるように正規化
  const left = pts0.map(([t, w]) => [(-w / wmax) * r, t * h]);
  const clampX = (x) => Math.max(-r, Math.min(r, x));
  const pts = [...left, ...left.slice().reverse().map(([x, y]) => [-x, y])];
  // Catmull-Rom で滑らかにつなぐ（左側は上→下、右側は下→上）
  let d = `M${pts[0][0].toFixed(3)},${pts[0][1].toFixed(3)}`;
  const n = left.length;
  for (let i = 0; i < pts.length - 1; i++) {
    // 左右それぞれの辺の中だけで補間し、底辺をまたいで隣の点を参照しない（はみ出し防止）
    const sameSide = (j) => (i < n ? j < n : j >= n);
    const p1 = pts[i], p2 = pts[i + 1];
    const p0 = i - 1 >= 0 && sameSide(i - 1) ? pts[i - 1] : p1;
    const p3 = i + 2 < pts.length && sameSide(i + 2) ? pts[i + 2] : p2;
    const jump = i === n - 1; // 底辺は直線
    if (jump) { d += ` L${p2[0].toFixed(3)},${p2[1].toFixed(3)}`; continue; }
    const c1 = [clampX(p1[0] + (p2[0] - p0[0]) / 6), p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [clampX(p2[0] - (p3[0] - p1[0]) / 6), p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(3)},${c1[1].toFixed(3)} ${c2[0].toFixed(3)},${c2[1].toFixed(3)} ${p2[0].toFixed(3)},${p2[1].toFixed(3)}`;
  }
  return d + " Z";
}

function sideShape(s, profile, color, outline) {
  const stemH = s.stemHeight ?? capHeightOf(s) * 0.85;
  const d = outline ? outlinePath(s, outline) : capOutline(s, profile);
  let g = `<path d="${d}" stroke-width="0.2" stroke-linejoin="round" fill="${color}" fill-opacity="0.06"/>`;
  if (s.boreDiameter != null) {
    const bi = s.boreDiameter / 2;
    const bo = bi + 0.6;
    g += `<path d="M${-bo},0 L${-bo},${stemH} L${bo},${stemH} L${bo},0" stroke-width="0.12"/>`;
    g += `<line x1="${-bi}" y1="0" x2="${-bi}" y2="${stemH}" stroke-width="0.1" stroke-dasharray="0.4 0.3"/>`;
    g += `<line x1="${bi}" y1="0" x2="${bi}" y2="${stemH}" stroke-width="0.1" stroke-dasharray="0.4 0.3"/>`;
  }
  return g;
}

function topShape(s, color) {
  // 楕円形の傘は minorDiameter（短軸）を持つ
  let g = s.minorDiameter != null
    ? `<ellipse rx="${s.capDiameter / 2}" ry="${s.minorDiameter / 2}" stroke-width="0.2" fill="${color}" fill-opacity="0.06"/>`
    : `<circle r="${s.capDiameter / 2}" stroke-width="0.2" fill="${color}" fill-opacity="0.06"/>`;
  if (s.upperDiameter != null) g += `<circle r="${s.upperDiameter / 2}" stroke-width="0.12"/>`;
  if (s.openingDiameter != null) g += `<circle r="${s.openingDiameter / 2}" stroke-width="0.12" stroke-dasharray="0.15 0.25"/>`;
  if (s.boreDiameter != null) g += `<circle r="${s.boreDiameter / 2}" stroke-width="0.15" stroke-dasharray="0.4 0.3"/>`;
  return g;
}

function silhouetteSvg(rows, { grid, labels }) {
  const maxD = Math.max(...rows.map((x) => x.s.capDiameter));
  const maxH = Math.max(...rows.map((x) => totalHeightOf(x.s)));
  const pad = 2;
  const colW = maxD + pad * 2;
  const W = colW * 2;
  const H = Math.max(maxH, maxD) + pad * 2 + (labels ? 2 : 0);
  const sideX = colW / 2, sideY = pad;
  const topX = colW * 1.5, topY = pad + maxD / 2;
  const muted = css("--muted"), line = css("--line");

  let g = "";
  if (grid) {
    for (let x = 0; x <= W; x += 1) g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${line}" stroke-width="${x % 5 ? 0.04 : 0.1}"/>`;
    for (let y = 0; y <= H; y += 1) g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${line}" stroke-width="${y % 5 ? 0.04 : 0.1}"/>`;
  }

  const shapes = rows.map(({ item, s, color }) => `
    <g transform="translate(${sideX},${sideY})" fill="none" stroke="${color}">${sideShape(s, item.profile || "dome", color, item.outline)}</g>
    <g transform="translate(${topX},${topY})" fill="none" stroke="${color}">${topShape(s, color)}</g>`).join("");

  const text = labels
    ? `<text x="${sideX}" y="${H - 0.6}" font-size="1.1" text-anchor="middle" fill="${muted}">側面</text>
       <text x="${topX}" y="${H - 0.6}" font-size="1.1" text-anchor="middle" fill="${muted}">上面</text>`
    : "";

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="サイズ比較">${g}${shapes}${text}</svg>`;
}

/* ---------- 詳細ダイアログ ---------- */

function scoreSection(it) {
  if (!hasScores(it)) return `<p class="note">レビュー・説明が少なく、音の傾向は未評価です。</p>`;
  const sc = it.scores;
  return `
    <div class="detail-rating">
      <div class="detail-radar">${radarSvg([{ values: sc, color: css("--accent") }], { size: 240, labels: true })}</div>
      <div>
        <table class="bands">${data.axes.map((a) => `<tr><th>${esc(a.label)}</th><td>${sc[a.key] != null ? sc[a.key].toFixed(1) : "—"}</td></tr>`).join("")}</table>
        <p class="note">${it.scoreBasis ? `${esc(BASIS[it.scoreBasis] || "")}。` : ""}${esc(data.scoreNote || "")}</p>
      </div>
    </div>`;
}


function openDetail(id) {
  const it = byId(id);
  const dlg = $("#detail");
  const on = selected.some((s) => s.id === id);
  const full = selected.length >= MAX_COMPARE;
  dlg.innerHTML = `
    <div class="dlg-top"><h2>${esc(it.name)}</h2><button class="dlg-x" data-close aria-label="閉じる">×</button></div>
    <div class="brand">${esc(it.brand)}・${esc(it.material)}</div>
    <div class="gallery">${galleryHtml(it)}</div>
    <div class="my-box">
      <label><input type="checkbox" data-my="fav" ${noteOf(id).fav ? "checked" : ""}> ♥ お気に入り</label>
      <label><input type="checkbox" data-my="owned" ${noteOf(id).owned ? "checked" : ""}> 持っている</label>
      <textarea data-my="memo" rows="2" placeholder="自分用メモ（この端末だけに保存。例：IE200にはSが合う）">${esc(noteOf(id).memo || "")}</textarea>
    </div>
    ${it.summary ? `<p class="summary">${esc(it.summary)}</p>` : ""}
    <h3>音の傾向スコア</h3>
    ${scoreSection(it)}
    <h3>総合評価</h3>
    <p>${esc(it.soundChange || "情報を収集中です。")}</p>
    ${it.reviewPoints?.length ? `<h3>よく挙がる点</h3>
    <ul>${it.reviewPoints.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${it.features?.length ? `<h3>特徴</h3>
    <ul>${it.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    <dl>
      <dt>向いている人</dt><dd>${esc(it.goodFor || "—")}</dd>
      <dt>対応ノズル径</dt><dd>${esc(it.nozzleFit || "—")}</dd>
      <dt>購入先</dt><dd>${buyLinks(it).length ? buyLinks(it).map((b) => `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.label.slice(4))} ↗</a>`).join("　") + `<br><small class="note">価格・在庫はリンク先でご確認ください</small>` : "—"}</dd>
    </dl>
    ${drawable(it) ? `<h3>寸法シルエット（${esc(defaultSize(it).size)}）</h3>
    <div class="detail-sil">${silhouetteSvg([{ item: it, s: defaultSize(it), color: css("--accent") }], { grid: true, labels: true })}</div>` : ""}
    ${similarItems(it).length ? `<h3>似ている製品</h3>
    <p class="note">音の傾向スコアと素材が近い順です。</p>
    ${miniCards(similarItems(it))}` : ""}
    <h3>サイズ（mm）</h3>
    ${dimStripHtml(it)}
    <div class="table-wrap"><table>
      <tr><th>サイズ</th><th>傘の大きさ</th><th>軸の長さ<br><small>（全高）</small></th><th>ノズル穴</th><th>開口部</th></tr>
      ${(it.sizes.length ? it.sizes : [NO_SIZE]).map((s) => `<tr${my.cap && s === defaultSize(it) ? ' class="mine"' : ""}><td>${esc(s.size)}${my.cap && s === defaultSize(it) ? "（あなたのサイズに近い）" : ""}</td><td>${s.capDiameter ?? "—"}${s.minorDiameter != null ? ` × ${s.minorDiameter}` : ""}</td><td>${s.height ?? "—"}${s.stemHeight != null && s.stemHeight !== s.height ? `<br><small>うち軸部 ${s.stemHeight}</small>` : ""}</td><td>${s.boreDiameter ?? "—"}</td><td>${s.openingDiameter ?? "—"}</td></tr>`).join("")}
    </table></div>
    <p class="note">寸法の出典：${esc(it.dimSource || "—")}${drawable(it) ? `<br>シルエット輪郭の出典：${esc(it.outlineSource || "形状タイプの模式形")}` : ""}</p>
    <h3>出典</h3>
    <ul>${(it.sources || []).map((src) => `<li>${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label)}</a>` : esc(src.label)}</li>`).join("")}</ul>
    <div class="dialog-actions">
      ${buyLinks(it)[0] ? `<a href="${esc(buyLinks(it)[0].url)}" target="_blank" rel="noopener">購入ページ ↗</a>` : ""}
      <button data-toggle ${!on && full ? "disabled" : ""}>${on ? "比較から外す" : "比較に追加"}</button>
      <button class="ghost" data-close>閉じる</button>
    </div>`;
  dlg.querySelector("[data-toggle]").addEventListener("click", () => { toggleSelect(id); dlg.close(); });
  dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
  dlg.querySelectorAll("[data-my]").forEach((el) => el.addEventListener(el.type === "checkbox" ? "change" : "input", () =>
    setNote(id, { [el.dataset.my]: el.type === "checkbox" ? el.checked : el.value.trim() })));
  dlg.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.goto)));
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
  bindGallery(dlg, it);
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

function fillFooter() {
  const el = $("#updated");
  if (el && data.updated) el.textContent = `データ更新日：${data.updated}`;
}
