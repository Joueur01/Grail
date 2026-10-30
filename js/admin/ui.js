// ui.js — briques communes du panel admin : cartes (avec export CSV), tableau triable, tuiles de chiffres clés.

import { el, fmtNum } from "./format.js?v=105";

/** Télécharge un CSV (point-virgule + BOM : s'ouvre tel quel dans Excel / Numbers en français). */
export function downloadCsv(name, header, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = `grail-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** Bouton « CSV » : `get()` renvoie { name, header, rows } au moment du clic. */
export function csvButton(get) {
  const b = el("button", "chip chip-small", "CSV");
  b.type = "button";
  b.title = "Exporter en CSV";
  b.addEventListener("click", () => { const c = get(); downloadCsv(c.name, c.header, c.rows); });
  return b;
}

/** Carte titrée ; `csv` (facultatif) ajoute un bouton d'export des données du graphique. → corps de la carte */
export function card(parent, title, { csv, note, wide } = {}) {
  const box = el("section", `card${wide ? " card-wide" : ""}`);
  const head = el("div", "card-head");
  head.append(el("h2", "card-title", title));
  if (csv) head.append(csvButton(csv));
  const body = el("div", "card-body");
  box.append(head, body);
  if (note) box.append(el("p", "muted small card-note", note));
  parent.append(box);
  return body;
}

/** Grille de cartes (1 colonne sur téléphone / iPad portrait, 2 au-delà). */
export function grid(parent) {
  const g = el("div", "two-cols");
  parent.append(g);
  return g;
}

/** Message « aucune donnée » dans une carte. */
export function empty(body, text = "Aucune donnée sur la période.") {
  body.append(el("p", "muted", text));
}

/**
 * Tableau triable (tri dans le navigateur : les données sont déjà là) avec export CSV.
 * columns : [{ key, label, num, value(row) → valeur de tri, render(row) → texte ou nœud, csv(row), style(row) → CSS }]
 */
export function dataTable(parent, { columns, rows, sort, dir = "desc", limit = 0, csvName }) {
  const wrap = el("div", "table-wrap");
  const tools = el("div", "table-tools");
  const info = el("span", "muted small", `${fmtNum(rows.length)} ligne${rows.length > 1 ? "s" : ""}`);
  tools.append(info);
  const valueOf = (c, r) => (c.value ? c.value(r) : r[c.key]);
  if (csvName) {
    tools.append(csvButton(() => ({
      name: csvName,
      header: columns.map((c) => c.label),
      rows: sorted().map((r) => columns.map((c) => (c.csv ? c.csv(r) : valueOf(c, r)))),
    })));
  }
  const scroller = el("div", "table-scroll");
  const table = el("table", "data-table");
  const tr = el("tr");
  const state = { sort: sort ?? null, dir, all: !limit };
  for (const c of columns) {
    const th = el("th", c.num ? "num" : "");
    const btn = el("button", "sort", c.label);
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (state.sort === c.key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else { state.sort = c.key; state.dir = c.num ? "desc" : "asc"; }
      draw();
    });
    th.append(btn);
    th.dataset.key = c.key;
    tr.append(th);
  }
  const thead = el("thead");
  thead.append(tr);
  const tbody = el("tbody");
  table.append(thead, tbody);
  scroller.append(table);
  const more = el("button", "chip more");
  more.type = "button";
  more.addEventListener("click", () => { state.all = true; draw(); });
  wrap.append(tools, scroller, more);
  parent.append(wrap);

  function sorted() {
    if (!state.sort) return rows;
    const c = columns.find((x) => x.key === state.sort);
    const k = state.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const u = valueOf(c, a), v = valueOf(c, b);
      if (u === v) return 0;
      if (u === null || u === undefined || u === "") return 1;
      if (v === null || v === undefined || v === "") return -1;
      return (typeof u === "number" && typeof v === "number" ? u - v : String(u).localeCompare(String(v), "fr")) * k;
    });
  }
  function draw() {
    for (const th of tr.children) {
      th.setAttribute("aria-sort", th.dataset.key === state.sort ? (state.dir === "asc" ? "ascending" : "descending") : "none");
    }
    const list = sorted();
    const shown = state.all ? list : list.slice(0, limit);
    tbody.replaceChildren(...shown.map((r) => {
      const line = el("tr");
      for (const c of columns) {
        const td = el("td", c.num ? "num" : "");
        const v = c.render ? c.render(r) : valueOf(c, r);
        if (v instanceof Node) td.append(v); else td.textContent = v ?? "—";
        if (c.style) td.style.cssText = c.style(r) || "";
        line.append(td);
      }
      return line;
    }));
    more.hidden = state.all || list.length <= limit;
    more.textContent = `Tout afficher (${list.length})`;
  }
  draw();
  return wrap;
}

/** Variation par rapport à la période précédente : en % (ou en points si `points`). */
export function delta(cur, prev, { points = false, inverse = false } = {}) {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  const c = Number(cur), p = Number(prev);
  if (points) {
    const d = c - p;
    return { text: `${d >= 0 ? "+" : "−"}${fmtNum(Math.abs(d), 1)} pt`, cls: d === 0 ? "" : (d > 0) !== inverse ? "up" : "down" };
  }
  if (!p) return c ? { text: "nouveau", cls: "up" } : null;
  const d = ((c - p) / p) * 100;
  return { text: `${d >= 0 ? "+" : "−"}${fmtNum(Math.abs(d), 0)} %`, cls: Math.abs(d) < 0.5 ? "" : (d > 0) !== inverse ? "up" : "down" };
}

/** Tuiles : [{ label, value, sub, delta: { text, cls } }] */
export function tiles(parent, list) {
  const g = el("div", "tiles");
  for (const t of list) {
    const box = el("div", "tile");
    box.append(el("span", "tile-label", t.label), el("strong", "tile-value", t.value));
    const sub = el("span", "tile-sub", t.sub || "");
    if (t.delta) {
      const d = el("span", `delta ${t.delta.cls}`, t.delta.text);
      d.title = "par rapport à la période précédente";
      sub.prepend(d, " ");
    }
    box.append(sub);
    g.append(box);
  }
  parent.append(g);
  return g;
}
