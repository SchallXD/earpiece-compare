// 一覧ページ：絞り込み・並べ替え・カード表示と、比較ページへのバー
async function init() {
  await loadData();
  loadSelection();
  if (location.hash) history.replaceState(null, "", location.pathname + location.search); // 一覧のURLには選択を残さない
  saveSelection();

  // 素材はまず大分類で選べるようにし、細かい表記は下にまとめる
  const count = (f) => data.items.filter(f).length;
  const groups = ["シリコン", "フォーム", "ハイブリッド（シリコン＋フォーム）", "メタルコア付き", "TPE・エラストマー"].filter((g) => data.items.some((it) => materialGroup(it.material) === g));
  const materials = [...new Set(data.items.map((it) => it.material))].sort((a, b) => a.localeCompare(b, "ja"));
  $("#material").insertAdjacentHTML("beforeend",
    groups.map((g) => `<option value="g:${esc(g)}">${esc(g)}（${count((it) => materialGroup(it.material) === g)}）</option>`).join("") +
    `<optgroup label="細かい素材">${materials.map((m) => `<option value="m:${esc(m)}">${esc(m)}（${count((it) => it.material === m)}）</option>`).join("")}</optgroup>`);
  $("#sort").insertAdjacentHTML("beforeend", data.axes.map((a) => `<option value="score:${a.key}">スコア順：${esc(a.label)}</option>`).join(""));
  fillFooter();

  // 絞り込み・並び順は URL（?use=tws&sort=pair など）に残し、戻る・共有したときに同じ一覧を出す
  const params = new URLSearchParams(location.search);
  FILTERS.forEach((id) => {
    const v = params.get(id);
    if (v != null && (id === "q" || [...$("#" + id).options].some((o) => o.value === v))) $("#" + id).value = v;
  });
  FILTERS.forEach((id) => $("#" + id).addEventListener("input", () => { saveFilters(); renderList(); }));
  updateFilterToggle();
  $("#filter-toggle").addEventListener("click", () => {
    const open = $(".filters").classList.toggle("open");
    $("#filter-toggle").setAttribute("aria-expanded", open);
  });
  document.addEventListener("notechange-app", renderList);

  // 耳のサイズ：入れると各製品で一番近いサイズを選び、±1mm 以内のサイズがある製品だけに絞る
  if (my.cap) $("#cap").value = my.cap;
  $("#cap").addEventListener("input", () => {
    const v = Number($("#cap").value);
    my.cap = v >= 8 && v <= 18 ? v : null;
    saveMy();
    refresh();
  });
  $("#cap-clear").addEventListener("click", () => { $("#cap").value = ""; my.cap = null; saveMy(); refresh(); });
  initQuiz();
  $("#clear").addEventListener("click", () => { selected = []; saveSelection(); refresh(); });
  document.addEventListener("selectionchange-app", refresh);
  // 比較ページから戻ったときに選択を読み直す
  window.addEventListener("pageshow", () => { loadSelection(); refresh(); });
  refresh();
}

const FILTERS = ["q", "use", "material", "bore", "dims", "mine", "sort"];
// スマホでは絞り込みを畳むので、使っている条件の数をボタンに出す
function updateFilterToggle() {
  const n = FILTERS.filter((id) => id !== "q" && id !== "sort" && $("#" + id).value.trim()).length;
  $("#filter-toggle").textContent = `絞り込み・並び順${n ? `（${n}件の条件）` : ""}`;
}
function saveFilters() {
  updateFilterToggle();
  const params = new URLSearchParams();
  FILTERS.forEach((id) => {
    const v = $("#" + id).value.trim();
    if (v && !(id === "sort" && v === "name")) params.set(id, v);
  });
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
}

function refresh() {
  $("#cap-clear").hidden = !my.cap;
  $("#cap-note").hidden = !my.cap;
  if (my.cap) $("#cap-note").textContent = `傘径 ${my.cap}mm の前後1mmのサイズがある製品だけを表示し、カード・比較・シルエットはそのサイズで表示しています（寸法未公表の製品は除外）。`;
  renderList();
  renderBar();
}

function filtered() {
  const q = $("#q").value.trim().toLowerCase();
  const material = $("#material").value;
  const use = $("#use").value;
  const bore = $("#bore").value;
  const dims = $("#dims").value;
  const mine = $("#mine").value;
  const sort = $("#sort").value;

  let items = data.items.filter((it) => {
    if (material.startsWith("g:") && materialGroup(it.material) !== material.slice(2)) return false;
    if (material.startsWith("m:") && it.material !== material.slice(2)) return false;
    if (use && useOf(it) !== use) return false;
    if (dims && drawable(it) !== (dims === "yes")) return false;
    if (mine && !noteOf(it.id)[mine]) return false;
    if (my.cap) {
      const n = nearestSize(it, my.cap);
      if (!n || Math.abs(n.capDiameter - my.cap) > 1) return false;
    }
    if (bore) {
      const [lo, hi] = bore.split("-").map(Number);
      const b = defaultSize(it).boreDiameter;
      if (b == null || b < lo || b > hi + 0.0001) return false;
    }
    if (q) {
      if (!matchesQuery(it, q)) return false;
    }
    return true;
  });

  const by = (f) => items.sort((a, b) => (f(b) ?? -1) - (f(a) ?? -1));
  if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  else if (sort.startsWith("score:")) by((it) => it.scores?.[sort.slice(6)]);
  return items;
}

function sizeTag(s) {
  const parts = [];
  if (s.capDiameter != null) parts.push(`傘${s.capDiameter}`);
  if (s.height != null) parts.push(`高さ${s.height}`);
  if (s.boreDiameter != null) parts.push(`内径${s.boreDiameter}`);
  return parts.length ? `${esc(s.size)}：${parts.join(" / ")}mm` : "寸法未公表";
}

function cardRadar(it) {
  if (!hasScores(it)) return `<div class="card-radar empty">傾向は未評価</div>`;
  const tip = data.axes.map((a) => `${a.label} ${it.scores[a.key] ?? "—"}`).join(" / ");
  const flag = it.scoreBasis === "type" ? `<span class="radar-flag">参考値</span>` : it.scoreBasis ? `<span class="radar-flag">推定</span>` : "";
  return `<div class="card-radar" title="音の傾向スコア：${esc(tip)}">${radarSvg([{ values: it.scores, color: css("--accent") }], { size: 112, labels: "short" })}${flag}</div>`;
}

function renderList() {
  const items = filtered();
  $("#count").textContent = `${items.length} / ${data.items.length} 件`;
  const full = selected.length >= MAX_COMPARE;

  $("#list").innerHTML = items.map((it) => {
    const on = selected.some((s) => s.id === it.id);
    return `
      <article class="card${on ? " selected" : ""}">
        <div class="thumbs">
          <button class="thumb" data-detail="${esc(it.id)}" aria-label="${esc(it.name)}の詳細">${thumbHtml(it)}</button>
          ${cardRadar(it)}
        </div>
        <div class="body">
          <h3>${esc(it.name)}<button class="fav${noteOf(it.id).fav ? " on" : ""}" data-fav="${esc(it.id)}" aria-label="お気に入り" aria-pressed="${!!noteOf(it.id).fav}">♥</button></h3>
          <div class="brand">${esc(it.brand)}</div>
          ${noteOf(it.id).owned ? `<div class="meta"><span class="tag owned">持っている</span></div>` : ""}
          ${noteOf(it.id).memo ? `<p class="card-memo">📝 ${esc(noteOf(it.id).memo)}</p>` : ""}
          ${it.summary ? `<p class="card-summary">${esc(it.summary)}</p>` : ""}
          <div class="tags"><span class="tag">${esc(it.material)}</span></div>
          ${dimStripHtml(it)}
          ${confidenceHtml(it)}
          <div class="actions">
            <button data-toggle="${esc(it.id)}" ${!on && full ? "disabled" : ""} class="${on ? "ghost" : ""}">${on ? "比較から外す" : "比較に追加"}</button>
            <button class="ghost" data-detail="${esc(it.id)}">詳細</button>
          </div>
        </div>
      </article>`;
  }).join("") || `<p class="note">条件に合うイヤーピースがありません。</p>`;

  $("#list").querySelectorAll("[data-fav]").forEach((b) => b.addEventListener("click", () => setNote(b.dataset.fav, { fav: !noteOf(b.dataset.fav).fav })));
  $("#list").querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => toggleSelect(b.dataset.toggle)));
  $("#list").querySelectorAll("[data-detail]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.detail)));
}

function renderBar() {
  const bar = $("#compare-bar");
  bar.hidden = selected.length === 0;
  $("#bar-items").innerHTML = selected.map((s, i) => `
    <span class="chip"><span class="dot" style="background:${css(COLOR_VARS[i])}"></span>${esc(byId(s.id).name)}
      <button data-remove="${esc(s.id)}" aria-label="外す">×</button></span>`).join("");
  $("#bar-items").querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => toggleSelect(b.dataset.remove)));
  $("#bar-count").textContent = `${selected.length} / ${MAX_COMPARE}`;
  $("#go-compare").href = `compare.html${selectionHash()}`;
}

init().catch((err) => {
  $("#list").innerHTML = `<p class="note">データを読み込めませんでした：${esc(err.message)}</p>`;
});
