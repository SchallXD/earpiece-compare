// 比較ページ：選んだイヤーピースの評価レーダー・サイズ・仕様を並べる
async function init() {
  await loadData();
  loadSelection();
  saveSelection();
  fillFooter();
  $("#rating-note").textContent = data.scoreNote || "";
  $("#clear").addEventListener("click", () => { selected = []; saveSelection(); render(); });
  document.addEventListener("selectionchange-app", render);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  render();
}

function render() {
  history.replaceState(null, "", location.pathname + selectionHash());
  const empty = selected.length === 0;
  $("#empty").hidden = !empty;
  $("#compare").hidden = empty;
  if (empty) return;

  const rows = selected.map((sel, i) => {
    const item = byId(sel.id);
    return { item, s: sizeOf(item, sel.size), color: css(COLOR_VARS[i]) };
  });

  $("#chips").innerHTML = rows.map(({ item, s, color }, i) => `
    <span class="chip">
      <span class="dot" style="background:${color}"></span>
      <button class="linklike" data-detail="${esc(item.id)}">${esc(item.name)}</button>
      ${item.sizes.length ? `<select data-size="${i}" aria-label="サイズ">
        ${item.sizes.map((x) => `<option ${x.size === s.size ? "selected" : ""}>${esc(x.size)}</option>`).join("")}
      </select>` : ""}
      <button data-remove="${esc(item.id)}" aria-label="外す">×</button>
    </span>`).join("");
  $("#chips").querySelectorAll("[data-size]").forEach((el) => el.addEventListener("change", () => {
    selected[Number(el.dataset.size)].size = el.value;
    saveSelection();
    render();
  }));
  $("#chips").querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => toggleSelect(b.dataset.remove)));
  $("#chips").querySelectorAll("[data-detail]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.detail)));

  const rated = rows.filter((x) => hasScores(x.item));
  const unrated = rows.filter((x) => !hasScores(x.item)).map((x) => x.item.name);
  $("#radar").innerHTML = (rated.length ? radarSvg(rated.map((x) => ({ values: x.item.scores, color: x.color })), { size: 320, labels: true }) : "")
    + `<div class="legend">${rated.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.item.name)}</span>`).join("")}</div>`
    + (unrated.length ? `<p class="note">音の傾向が未評価のため表示していません：${unrated.map(esc).join("、")}</p>` : "");

  const drawn = rows.filter((x) => hasDims(x.s));
  const skipped = rows.filter((x) => !hasDims(x.s)).map((x) => x.item.name);
  $("#size-svg").innerHTML = (drawn.length ? silhouetteSvg(drawn, { grid: true, labels: true }) : "")
    + (skipped.length ? `<p class="note">寸法が公表されていないため表示していません：${skipped.map(esc).join("、")}</p>` : "");

  renderSpecTable(rows);
}

function renderSpecTable(rows) {
  const r = (label, fn) => `<tr><th>${label}</th>${rows.map((x) => `<td>${fn(x)}</td>`).join("")}</tr>`;
  $("#spec").innerHTML = `
    <tr><th></th>${rows.map(({ item, color }) => `<td><strong style="color:${color}">${esc(item.name)}</strong><br><small>${esc(item.brand)}</small></td>`).join("")}</tr>
    ${r("形", ({ item }) => `<div class="spec-photo">${thumbHtml(item)}</div>`)}
    ${data.axes.map((a) => r(esc(a.label), ({ item }) => item.scores?.[a.key] != null ? item.scores[a.key].toFixed(1) : "—")).join("")}
    ${r("ひとこと", ({ item }) => esc(item.summary || "—"))}
    ${r("総合評価", ({ item }) => esc(item.soundChange || "—"))}
    ${r("向いている人", ({ item }) => esc(item.goodFor || "—"))}
    ${r("素材", ({ item }) => esc(item.material))}
    ${r("サイズ", ({ s }) => esc(s.size))}
    ${r("傘径", ({ s }) => mm(s.capDiameter) + (s.minorDiameter != null ? `（短軸 ${s.minorDiameter}）` : ""))}
    ${r("高さ", ({ s }) => mm(s.height))}
    ${r("軸の内径", ({ s }) => mm(s.boreDiameter))}
    ${r("開口部の径", ({ s }) => mm(s.openingDiameter))}
    ${r("対応ノズル径", ({ item }) => esc(item.nozzleFit || "—"))}
    ${r("寸法の出典", ({ item }) => esc(item.dimSource || "—"))}
    ${r("購入", ({ item }) => buyLinks(item)[0] ? `<a href="${esc(buyLinks(item)[0].url)}" target="_blank" rel="noopener">${esc(buyLinks(item)[0].label.slice(4))} ↗</a>` : "—")}`;
}

init().catch((err) => {
  $("#empty").hidden = false;
  $("#empty").textContent = `データを読み込めませんでした：${err.message}`;
});
