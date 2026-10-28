// 一覧ページの「好みから探す」：答えから音の傾向スコアで製品を並べる
const isTws = (it) => /TWS|ワイヤレス|短尺|軸長[4-7]mm/.test([it.name, it.summary, ...(it.features || [])].join(" "));
const isFoam = (it) => /フォーム|ウレタン/.test(it.material);

function quizRank(a) {
  const label = Object.fromEntries(data.axes.map((x) => [x.key, x.label]));
  const pool = data.items.filter((it) => {
    if (!hasScores(it)) return false;
    if (a.device.startsWith("AirPods") ? it.forDevice !== a.device : it.forDevice) return false;
    if (a.mat === "foam" && !isFoam(it)) return false;
    if (a.mat === "silicone" && isFoam(it)) return false;
    return true;
  });
  return pool.map((it) => {
    const d = (k) => (it.scores[k] ?? 3) - 3; // 付属イヤーピース（3）からの差
    const why = [];
    let score = 0;
    if (a.sound === "neutral") {
      score -= Math.abs(d("bass")) + Math.abs(d("mid")) + Math.abs(d("treble"));
      why.push("音の変化が小さい");
    } else {
      score += 2 * d(a.sound);
      why.push(`${label[a.sound]} ${it.scores[a.sound]}`);
    }
    if (a.iso === "high") { score += 1.5 * d("isolation"); why.push(`遮音性 ${it.scores.isolation}`); }
    if (a.iso === "low") { score -= 2 * d("isolation"); why.push(`遮音性 ${it.scores.isolation}`); }
    if (a.fit === "pain") { score += 1.5 * d("comfort"); why.push(`装着感 ${it.scores.comfort}`); }
    if (a.fit === "fall") score += 0.8 * d("isolation") + 0.6 * d("comfort");
    if (a.device === "tws" && isTws(it)) { score += 0.8; why.push("TWS向け"); }
    if (my.cap) {
      const n = nearestSize(it, my.cap);
      if (n && Math.abs(n.capDiameter - my.cap) <= 1) { score += 0.3; why.push(`${n.size}が耳のサイズに近い`); }
    }
    return { it, score, why };
  }).sort((x, y) => y.score - x.score).slice(0, 6);
}

function initQuiz() {
  const dlg = $("#quiz");
  $("#open-quiz").addEventListener("click", () => { $("#quiz-result").innerHTML = ""; dlg.showModal(); dlg.scrollTop = 0; });
  $("#quiz-close").addEventListener("click", () => dlg.close());
  $("#quiz-x").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("#quiz-run").addEventListener("click", () => {
    const res = quizRank(Object.fromEntries(new FormData($("#quiz-form"))));
    $("#quiz-result").innerHTML = res.length
      ? `<h3>おすすめ ${res.length} 件</h3>${res.map(({ it, why }, i) => `
        <div class="quiz-hit">
          <button type="button" class="mini" data-goto="${esc(it.id)}">
            <span class="mini-photo">${thumbHtml(it, { labels: false })}</span>
            <span class="mini-body"><strong>${i + 1}. ${esc(it.name)}</strong><small>${esc(it.brand)}</small><small>${esc(why.join("・"))}</small></span>
          </button>
          <button type="button" class="ghost small" data-add="${esc(it.id)}">${selected.some((s) => s.id === it.id) ? "比較に追加済み" : "比較に追加"}</button>
        </div>`).join("")}
        <p class="note">スコアはレビューと説明から推定した目安です。耳の形やイヤホンとの相性で変わります。</p>`
      : `<p class="note">条件に合う製品がありません。素材などの条件をゆるめてください。</p>`;
    $("#quiz-result").querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => { dlg.close(); openDetail(b.dataset.goto); }));
    $("#quiz-result").querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
      if (!selected.some((s) => s.id === b.dataset.add)) toggleSelect(b.dataset.add);
      b.textContent = "比較に追加済み";
    }));
    $("#quiz-result").scrollIntoView({ behavior: "smooth" });
  });
}
