// charts.js — graphiques SVG faits à la main pour le panel admin (aucune bibliothèque : CLAUDE.md, section 4).
//
// Quatre graphiques réutilisables, tous avec une infobulle au toucher (ou au survol de la souris) :
//   columnChart(conteneur, [{ label, value, tip }], options)    colonnes verticales (ex. minutes par jour)
//   lineChart(conteneur, [{ label, value, tip }], options)      courbe avec aire
//   barChart(conteneur, [{ label, value, color, tip }], options) barres horizontales (ex. temps par écran)
//   stackedBars(conteneur, [{ label, segments: [{ label, value, color }] }], options)  barres empilées + légende
//   calendar(conteneur, { "AAAA-MM-JJ": valeur }, options)       calendrier d'activité (une case par jour)
//   multiLineChart(conteneur, étiquettes, [{ label, color, values }], options)   plusieurs courbes
//   stackedColumns(conteneur, étiquettes, [{ label, color, values }], options)   colonnes empilées par jour
// Chaque graphique a une légende : automatique pour les graphiques à plusieurs séries, `legend` sinon
// (un texte ou [{ label, color }]).
//
// Le dessin suit la largeur réelle du conteneur et se refait quand elle change (rotation de l'iPad).

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmtDefault = (v) => Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Légende sous le graphique : [{ label, color }] (un texte seul = une entrée de la couleur par défaut). */
export function legend(container, items, color = "var(--accent)") {
  container.querySelector(".chart-legend")?.remove();
  if (!items) return;
  const list = typeof items === "string" ? [{ label: items, color }] : items;
  const leg = document.createElement("div");
  leg.className = "chart-legend";
  for (const it of list) {
    const item = document.createElement("span");
    const dot = document.createElement("i");
    dot.style.background = it.color;
    item.append(dot, it.label);
    leg.append(item);
  }
  container.append(leg);
}

/** Monte un graphique : `draw(largeur)` renvoie un <svg> ; redessiné si la largeur change. */
function mount(container, draw) {
  container.classList.add("chart");
  container._chartObserver?.disconnect();
  let lastWidth = 0;
  const render = () => {
    const width = Math.floor(container.clientWidth);
    if (!width || width === lastWidth) return;
    lastWidth = width;
    hideTip(container);
    container.querySelector("svg.chart-svg")?.remove();
    const svg = draw(width);
    svg.classList.add("chart-svg");
    container.prepend(svg);
  };
  render();
  const observer = new ResizeObserver(render);
  observer.observe(container);
  container._chartObserver = observer;
  attachTip(container);
}

// --- Infobulle -----------------------------------------------------------------------
// Chaque zone touchable porte data-tip. Toucher (ou survoler) affiche le texte au-dessus du doigt ;
// toucher ailleurs le cache.

function attachTip(container) {
  if (container._tipReady) return;
  container._tipReady = true;
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  container.append(tip);

  const show = (e) => {
    const target = e.target.closest?.("[data-tip]");
    if (!target || !container.contains(target)) { if (e.pointerType !== "mouse") hideTip(container); return; }
    container.querySelectorAll(".is-active").forEach((n) => n.classList.remove("is-active"));
    target.classList.add("is-active");
    tip.textContent = target.getAttribute("data-tip");
    tip.hidden = false;
    const box = container.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - box.left, 8), box.width - 8);
    const y = e.clientY - box.top;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    // Ne déborde ni à gauche ni à droite.
    const w = tip.offsetWidth;
    const left = Math.min(Math.max(x - w / 2, 0), box.width - w);
    tip.style.transform = `translate(${left - x}px, calc(-100% - 12px))`;
  };
  container.addEventListener("pointerdown", show);
  container.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") show(e); });
  container.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideTip(container); });
  document.addEventListener("pointerdown", (e) => { if (!container.contains(e.target)) hideTip(container); });
}

function hideTip(container) {
  const tip = container.querySelector(".chart-tip");
  if (tip) tip.hidden = true;
  container.querySelectorAll(".is-active").forEach((n) => n.classList.remove("is-active"));
}

/** Pas de graduation « rond » (1, 2, 5, 10, 20, 50…) pour 3 à 5 lignes jusqu'au maximum. */
function niceStep(max) {
  if (!(max > 0)) return 1;
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return Math.max(m * p, Number.isInteger(max) && max >= 1 ? 1 : 0);
  return 10 * p;
}

/** Axe vertical + lignes de repère ; renvoie la fonction valeur → y. */
function yAxis(svg, { left, top, width, height, max, format }) {
  const step = niceStep(max);
  const n = Math.max(1, Math.ceil(max / step - 1e-9));
  const top2 = step * n;
  for (let i = 0; i <= n; i++) {
    const v = step * i;
    const y = top + height - (height * i) / n;
    svg.append(svgEl("line", { x1: left, x2: left + width, y1: y, y2: y, class: "chart-grid" }));
    svg.append(svgEl("text", { x: left - 6, y: y + 4, "text-anchor": "end", class: "chart-label" }, format(v)));
  }
  return (v) => top + height - (height * Math.max(0, v)) / top2;
}

/** Étiquettes de l'axe horizontal : espacées selon leur longueur (~6,5 px par caractère), sans chevauchement. */
function xLabels(svg, points, xOf, y) {
  const n = points.length;
  if (!n) return;
  const longest = Math.max(...points.map((p) => String(p.label).length));
  const room = Math.max(40, longest * 6.5 + 10);
  const span = n > 1 ? (xOf(n - 1) - xOf(0)) / (n - 1) : room;
  const every = Math.max(1, Math.ceil(room / span));
  points.forEach((p, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    if (i !== n - 1 && n - 1 - i < every) return; // laisse la place à la dernière étiquette
    svg.append(svgEl("text", { x: xOf(i), y, "text-anchor": "middle", class: "chart-label" }, p.label));
  });
}

// --- Colonnes verticales ---------------------------------------------------------------
export function columnChart(container, points, { height = 200, color = "var(--accent)", format = fmtDefault, legend: leg } = {}) {
  legend(container, leg, color);
  mount(container, (W) => {
    const left = 40, right = 8, top = 10, bottom = 24;
    const w = W - left - right, h = height - top - bottom;
    const svg = svgEl("svg", { width: W, height, viewBox: `0 0 ${W} ${height}`, role: "img" });
    const max = Math.max(0, ...points.map((p) => Number(p.value) || 0));
    const yOf = yAxis(svg, { left, top, width: w, height: h, max, format });
    const step = w / Math.max(1, points.length);
    const xOf = (i) => left + step * i + step / 2;
    points.forEach((p, i) => {
      const v = Number(p.value) || 0;
      const y = yOf(v);
      const bw = Math.max(1, step * 0.7);
      svg.append(svgEl("rect", { x: xOf(i) - bw / 2, y, width: bw, height: Math.max(0, top + h - y), rx: Math.min(3, bw / 3),
        fill: color, class: "chart-bar" }));
      // Zone touchable sur toute la hauteur (plus facile au doigt qu'une colonne fine).
      svg.append(svgEl("rect", { x: left + step * i, y: top, width: step, height: h, class: "chart-hit",
        "data-tip": p.tip || `${p.label} : ${format(v)}` }));
    });
    xLabels(svg, points, xOf, height - 6);
    return svg;
  });
}

// --- Courbe -------------------------------------------------------------------------------
export function lineChart(container, points, { height = 200, color = "var(--accent)", format = fmtDefault, legend: leg } = {}) {
  legend(container, leg, color);
  mount(container, (W) => {
    const left = 40, right = 12, top = 10, bottom = 24;
    const w = W - left - right, h = height - top - bottom;
    const svg = svgEl("svg", { width: W, height, viewBox: `0 0 ${W} ${height}`, role: "img" });
    const max = Math.max(0, ...points.map((p) => Number(p.value) || 0));
    const yOf = yAxis(svg, { left, top, width: w, height: h, max, format });
    const xOf = (i) => (points.length < 2 ? left + w / 2 : left + (w * i) / (points.length - 1));
    const coords = points.map((p, i) => [xOf(i), yOf(Number(p.value) || 0)]);
    if (coords.length) {
      const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      svg.append(svgEl("polygon", { points: `${coords[0][0]},${top + h} ${line} ${coords.at(-1)[0]},${top + h}`, fill: color, class: "chart-area" }));
      svg.append(svgEl("polyline", { points: line, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }));
    }
    const step = points.length < 2 ? w : w / (points.length - 1);
    coords.forEach(([x, y], i) => {
      svg.append(svgEl("circle", { cx: x, cy: y, r: 3.5, fill: color, class: "chart-dot" }));
      svg.append(svgEl("rect", { x: x - step / 2, y: top, width: step, height: h, class: "chart-hit",
        "data-tip": points[i].tip || `${points[i].label} : ${format(points[i].value)}` }));
    });
    xLabels(svg, points, xOf, height - 6);
    return svg;
  });
}

// --- Barres horizontales -----------------------------------------------------------------
export function barChart(container, items, { color = "var(--accent)", format = fmtDefault, labelWidth = 96, legend: leg } = {}) {
  legend(container, leg, color);
  mount(container, (W) => {
    const rowH = 30, gap = 8, top = 4;
    const height = top + items.length * (rowH + gap);
    const svg = svgEl("svg", { width: W, height, viewBox: `0 0 ${W} ${height}`, role: "img" });
    const max = Math.max(0, ...items.map((it) => Number(it.value) || 0)) || 1;
    const valueW = 70;
    const lw = Math.min(labelWidth, Math.floor(W * 0.42)); // étiquettes plus courtes sur téléphone
    const barW = Math.max(20, W - lw - valueW - 8);
    items.forEach((it, i) => {
      const y = top + i * (rowH + gap);
      const v = Number(it.value) || 0;
      svg.append(svgEl("text", { x: 0, y: y + rowH / 2 + 5, class: "chart-label chart-label-strong" }, cut(it.label, lw)));
      svg.append(svgEl("rect", { x: lw, y, width: barW, height: rowH, rx: 6, class: "chart-track" }));
      svg.append(svgEl("rect", { x: lw, y, width: Math.max(v > 0 ? 3 : 0, (barW * v) / max), height: rowH, rx: 6,
        fill: it.color || color, class: "chart-bar" }));
      svg.append(svgEl("text", { x: lw + barW + 8, y: y + rowH / 2 + 5, class: "chart-label" }, format(v)));
      svg.append(svgEl("rect", { x: 0, y, width: W, height: rowH, class: "chart-hit",
        "data-tip": it.tip || `${it.label} : ${format(v)}` }));
    });
    return svg;
  });
}

// --- Barres empilées (une ligne par groupe) + légende ---------------------------------------
export function stackedBars(container, rows, { format = fmtDefault, labelWidth = 96 } = {}) {
  // Légende : tous les segments rencontrés, dans l'ordre.
  const seen = new Map();
  rows.forEach((r) => r.segments.forEach((s) => seen.set(s.label, s.color)));
  legend(container, [...seen].map(([label, color]) => ({ label, color })));

  mount(container, (W) => {
    const rowH = 30, gap = 8, top = 4;
    const height = top + rows.length * (rowH + gap);
    const svg = svgEl("svg", { width: W, height, viewBox: `0 0 ${W} ${height}`, role: "img" });
    const max = Math.max(1, ...rows.map((r) => r.segments.reduce((a, s) => a + (Number(s.value) || 0), 0)));
    const lw = rows.some((r) => r.label) ? Math.min(labelWidth, Math.floor(W * 0.38)) : 0;
    const valueW = 60;
    const barW = Math.max(20, W - lw - valueW - 8);
    rows.forEach((r, i) => {
      const y = top + i * (rowH + gap);
      const total = r.segments.reduce((a, s) => a + (Number(s.value) || 0), 0);
      if (r.label) svg.append(svgEl("text", { x: 0, y: y + rowH / 2 + 5, class: "chart-label chart-label-strong" }, cut(r.label, lw)));
      svg.append(svgEl("rect", { x: lw, y, width: barW, height: rowH, rx: 6, class: "chart-track" }));
      let x = lw;
      for (const s of r.segments) {
        const v = Number(s.value) || 0;
        if (!v) continue;
        const sw = (barW * v) / max;
        svg.append(svgEl("rect", { x, y, width: Math.max(1, sw - 1), height: rowH, fill: s.color, class: "chart-bar",
          "data-tip": s.tip || `${r.label ? `${r.label} · ` : ""}${s.label} : ${format(v)} (${Math.round((100 * v) / (total || 1))} %)` }));
        x += sw;
      }
      svg.append(svgEl("text", { x: lw + barW + 8, y: y + rowH / 2 + 5, class: "chart-label" }, format(total)));
    });
    return svg;
  });
}

// --- Calendrier d'activité -----------------------------------------------------------------
// Une colonne par semaine (lundi en haut), une case par jour ; la couleur suit la valeur (ex. minutes).
export function calendar(container, values, { weeks = 13, today, format = fmtDefault, unit = "" } = {}) {
  const end = new Date(`${today}T12:00:00Z`);
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "short" });
  // Premier jour affiché : le lundi de la semaine la plus ancienne.
  const endDow = (end.getUTCDay() + 6) % 7; // 0 = lundi
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - endDow - (weeks - 1) * 7);
  const max = Math.max(0, ...Object.values(values).map(Number));

  mount(container, (W) => {
    const left = 22, top = 16;
    const cell = Math.max(10, Math.min(26, Math.floor((W - left) / weeks) - 3));
    const gap = 3;
    const height = top + 7 * (cell + gap);
    const svg = svgEl("svg", { width: W, height, viewBox: `0 0 ${W} ${height}`, role: "img" });
    ["L", "", "M", "", "V", "", "D"].forEach((d, i) => {
      if (d) svg.append(svgEl("text", { x: 0, y: top + i * (cell + gap) + cell * 0.75, class: "chart-label" }, d));
    });
    let lastMonth = -1;
    const d = new Date(start);
    for (let w = 0; w < weeks; w++) {
      for (let dow = 0; dow < 7; dow++) {
        if (d > end) break;
        const key = d.toISOString().slice(0, 10);
        const v = Number(values[key] || 0);
        const x = left + w * (cell + gap);
        const y = top + dow * (cell + gap);
        if (dow === 0 && d.getUTCMonth() !== lastMonth) {
          lastMonth = d.getUTCMonth();
          svg.append(svgEl("text", { x, y: 11, class: "chart-label" }, monthFmt.format(d)));
        }
        const level = v <= 0 ? 0 : Math.min(4, 1 + Math.floor((3.999 * v) / (max || 1)));
        svg.append(svgEl("rect", { x, y, width: cell, height: cell, rx: 3, class: `chart-cal chart-cal-${level}`,
          "data-tip": `${dayFmt.format(d)} : ${v > 0 ? `${format(v)}${unit}` : "inactif"}` }));
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    return svg;
  });
}

/** Coupe une étiquette trop longue pour sa place (~7 px par caractère à 13 px). */
function cut(text, width) {
  const max = Math.max(4, Math.floor((width - 6) / 7));
  const t = String(text ?? "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// --- Plusieurs courbes --------------------------------------------------------------------
export function multiLineChart(container, labels, series, { height = 220, format = fmtDefault, tipLabels } = {}) {
  legend(container, series.map((s) => ({ label: s.label, color: s.color })));
  mount(container, (W) => {
    const left = 40, right = 12, top = 10, bottom = 24;
    const w = W - left - right, h = height - top - bottom;
    const svg = svgEl("svg", { width: W, height, viewBox: `0 0 ${W} ${height}`, role: "img" });
    const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => Number(v) || 0)));
    const yOf = yAxis(svg, { left, top, width: w, height: h, max, format });
    const n = labels.length;
    const xOf = (i) => (n < 2 ? left + w / 2 : left + (w * i) / (n - 1));
    for (const s of series) {
      const pts = s.values.map((v, i) => `${xOf(i).toFixed(1)},${yOf(Number(v) || 0).toFixed(1)}`).join(" ");
      svg.append(svgEl("polyline", { points: pts, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round",
        "stroke-dasharray": s.dashed ? "5 4" : "none" }));
      if (n <= 40) s.values.forEach((v, i) => svg.append(svgEl("circle", { cx: xOf(i), cy: yOf(Number(v) || 0), r: 2.5, fill: s.color })));
    }
    const step = n < 2 ? w : w / (n - 1);
    labels.forEach((label, i) => {
      const tip = `${(tipLabels || labels)[i]} — ${series.map((s) => `${s.label} : ${s.values[i] == null ? "—" : format(s.values[i])}`).join(" · ")}`;
      svg.append(svgEl("rect", { x: xOf(i) - step / 2, y: top, width: step, height: h, class: "chart-hit", "data-tip": tip }));
    });
    xLabels(svg, labels.map((label) => ({ label })), xOf, height - 6);
    return svg;
  });
}

// --- Colonnes empilées -------------------------------------------------------------------
export function stackedColumns(container, labels, series, { height = 220, format = fmtDefault, tipLabels } = {}) {
  legend(container, series.map((s) => ({ label: s.label, color: s.color })));
  mount(container, (W) => {
    const left = 44, right = 8, top = 10, bottom = 24;
    const w = W - left - right, h = height - top - bottom;
    const svg = svgEl("svg", { width: W, height, viewBox: `0 0 ${W} ${height}`, role: "img" });
    const totals = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, Number(s.values[i]) || 0), 0));
    const yOf = yAxis(svg, { left, top, width: w, height: h, max: Math.max(0, ...totals), format });
    const step = w / Math.max(1, labels.length);
    const xOf = (i) => left + step * i + step / 2;
    const bw = Math.max(1, step * 0.7);
    labels.forEach((label, i) => {
      let base = top + h;
      for (const s of series) {
        const v = Math.max(0, Number(s.values[i]) || 0);
        if (!v) continue;
        const y = yOf(v) - (top + h - base);
        svg.append(svgEl("rect", { x: xOf(i) - bw / 2, y, width: bw, height: Math.max(0, base - y - (bw > 4 ? 1 : 0)), fill: s.color, class: "chart-bar" }));
        base = y;
      }
      const tip = `${(tipLabels || labels)[i]} — ${series.map((s) => `${s.label} : ${format(Number(s.values[i]) || 0)}`).join(" · ")} · total ${format(totals[i])}`;
      svg.append(svgEl("rect", { x: left + step * i, y: top, width: step, height: h, class: "chart-hit", "data-tip": tip }));
    });
    xLabels(svg, labels.map((label) => ({ label })), xOf, height - 6);
    return svg;
  });
}
