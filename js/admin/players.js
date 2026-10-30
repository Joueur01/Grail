// players.js — onglet « Joueurs » du panel admin : tableau triable, recherche, filtres, pages, export CSV.
//
// Tout est fait par le serveur (admin_players : tri, filtres, pages) ; le site ne fait qu'afficher.
// Sur un écran étroit (iPad en portrait, téléphone) seules les colonnes principales sont visibles
// (bouton « Toutes les colonnes ») et c'est le TABLEAU qui défile de côté, jamais la page.

import { adminPlayers } from "../api.js?v=104";
import { el, fmtDate, fmtDaysAgo, fmtInt, fmtMinutes, fmtNum, statusPill, STATUS, PLATFORMS, fmtPlatform } from "./format.js?v=104";

const PAGE = 50;

// Colonnes : key = colonne d'analytics_player_summary (ou « pseudo ») : c'est aussi la clé de tri du serveur.
// main = visible sur écran étroit ; num = nombre (aligné à droite, trié du plus grand au plus petit d'abord).
const COLUMNS = [
  { key: "pseudo", label: "Pseudo", main: true, cell: (r) => r.pseudo || "Sans pseudo", csv: (r) => r.pseudo || "" },
  { key: "status", label: "Statut", main: true, cell: (r) => statusPill(r.status), csv: (r) => STATUS[r.status]?.label || r.status },
  { key: "signup_at", label: "Inscription", cell: (r) => fmtDate(r.signup_at), csv: (r) => String(r.signup_at || "").slice(0, 10) },
  { key: "last_active_day", label: "Dernière visite", main: true, cell: (r) => fmtDaysAgo(r.days_since_last_active),
    title: (r) => fmtDate(r.last_active_day), csv: (r) => r.last_active_day || "" },
  { key: "days_active", label: "Jours actifs", num: true, main: true, cell: (r) => fmtInt(r.days_active) },
  { key: "sessions", label: "Sessions", num: true, cell: (r) => fmtInt(r.sessions) },
  { key: "active_minutes", label: "Temps total", num: true, main: true, cell: (r) => fmtMinutes(r.active_minutes), csv: (r) => r.active_minutes },
  { key: "avg_session_minutes", label: "Moy. / session", num: true, cell: (r) => fmtMinutes(r.avg_session_minutes), csv: (r) => r.avg_session_minutes ?? "" },
  { key: "boosters_opened", label: "Boosters", num: true, main: true, cell: (r) => fmtInt(r.boosters_opened) },
  { key: "videur_level", label: "Videur", num: true, cell: (r) => (r.videur_level ? `Niv. ${r.videur_level}` : "—"), csv: (r) => r.videur_level ?? "" },
  { key: "distinct_cards", label: "Cartes", num: true, cell: (r) => fmtInt(r.distinct_cards) },
  { key: "legendaries", label: "Légendaires", num: true, cell: (r) => fmtInt(r.legendaries) },
  { key: "coins", label: "Pièces", num: true, cell: (r) => fmtInt(r.coins) },
  { key: "friends", label: "Amis", num: true, cell: (r) => fmtInt(r.friends) },
  { key: "outfit_shares", label: "Partages", num: true, cell: (r) => fmtInt(r.outfit_shares) },
  { key: "platform", label: "Plateforme", cell: (r) => fmtPlatform(r.platform), csv: (r) => r.platform || "" },
];

// État de la liste : gardé en mémoire quand on ouvre une fiche puis revient (bouton retour).
const state = { search: "", status: "", platform: "", sort: "last_active_day", dir: "desc", page: 0, allColumns: false };
let root = null;
let requestId = 0;

/** Construit l'onglet une fois ; `load()` relit la page courante. */
export function renderPlayers(container) {
  if (root) { container.replaceChildren(root); load(); return; }
  root = el("div", "players");

  // Barre d'outils : recherche, filtres, colonnes, export.
  const bar = el("div", "toolbar");
  const search = el("input", "field");
  search.type = "search";
  search.placeholder = "Rechercher un pseudo";
  search.value = state.search;
  search.setAttribute("aria-label", "Rechercher un pseudo");
  let timer = 0;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.search = search.value.trim(); state.page = 0; load(); }, 300);
  });

  const status = select("Statut", [["", "Tous les statuts"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])], state.status,
    (v) => { state.status = v; state.page = 0; load(); });
  const platform = select("Plateforme", [["", "Toutes les plateformes"], ...Object.entries(PLATFORMS)], state.platform,
    (v) => { state.platform = v; state.page = 0; load(); });

  const cols = el("button", "chip", "Toutes les colonnes");
  cols.type = "button";
  cols.setAttribute("aria-pressed", String(state.allColumns));
  cols.addEventListener("click", () => {
    state.allColumns = !state.allColumns;
    cols.setAttribute("aria-pressed", String(state.allColumns));
    root.classList.toggle("all-columns", state.allColumns);
  });

  const exportBtn = el("button", "chip", "Exporter en CSV");
  exportBtn.type = "button";
  exportBtn.addEventListener("click", () => exportCsv(exportBtn));

  bar.append(search, status, platform, cols, exportBtn);

  const info = el("p", "muted list-info");
  const error = el("p", "error-box");
  error.hidden = true;

  // Tableau dans une boîte qui défile de côté.
  const scroller = el("div", "table-scroll");
  const table = el("table", "data-table players-table");
  const thead = el("thead");
  const headRow = el("tr");
  for (const c of COLUMNS) {
    const th = el("th", `${c.num ? "num" : ""} ${c.main ? "main" : "extra"}`.trim());
    const btn = el("button", "sort", c.label);
    btn.type = "button";
    btn.dataset.key = c.key;
    btn.addEventListener("click", () => {
      if (state.sort === c.key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else { state.sort = c.key; state.dir = c.num ? "desc" : "asc"; }
      state.page = 0;
      load();
    });
    th.append(btn);
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el("tbody");
  table.append(thead, tbody);
  scroller.append(table);

  const pager = el("div", "pager");
  const prev = el("button", "chip", "‹ Précédent");
  const next = el("button", "chip", "Suivant ›");
  const pageInfo = el("span", "muted");
  prev.type = next.type = "button";
  prev.addEventListener("click", () => { if (state.page > 0) { state.page--; load(); } });
  next.addEventListener("click", () => { state.page++; load(); });
  pager.append(prev, pageInfo, next);

  root.append(el("h1", "page-title", "Joueurs"), bar, info, error, scroller, pager);
  root.classList.toggle("all-columns", state.allColumns);
  container.replaceChildren(root);

  Object.assign(root, { _parts: { info, error, tbody, headRow, prev, next, pageInfo, scroller } });
  load();
}

function select(label, options, value, onChange) {
  const s = el("select", "field");
  s.setAttribute("aria-label", label);
  for (const [v, t] of options) {
    const o = el("option", "", t);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function query(offset, limit) {
  return {
    search: state.search || null, status: state.status || null, platform: state.platform || null,
    sort: state.sort, dir: state.dir, limit, offset,
  };
}

async function load() {
  const { info, error, tbody, headRow, prev, next, pageInfo } = root._parts;
  const id = ++requestId;
  info.textContent = "Chargement…";
  // Flèche de tri sur la colonne active.
  for (const btn of headRow.querySelectorAll(".sort")) {
    const active = btn.dataset.key === state.sort;
    btn.closest("th").setAttribute("aria-sort", active ? (state.dir === "asc" ? "ascending" : "descending") : "none");
  }
  let res;
  try {
    res = await adminPlayers(query(state.page * PAGE, PAGE));
  } catch (e) {
    if (id !== requestId) return;
    info.textContent = "";
    error.hidden = false;
    error.textContent = state.platform && /pas encore activée/.test(e.message)
      ? "Le filtre par plateforme demande la migration 0039 sur le serveur."
      : e.message;
    return;
  }
  if (id !== requestId) return; // une recherche plus récente est partie entre-temps
  error.hidden = true;
  const total = Number(res.total) || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  if (state.page >= pages && total > 0) { state.page = pages - 1; load(); return; }

  info.textContent = total ? `${fmtNum(total)} joueur${total > 1 ? "s" : ""}` : "Aucun joueur ne correspond.";
  tbody.replaceChildren(...(res.items || []).map(row));
  pageInfo.textContent = `Page ${state.page + 1} / ${pages}`;
  prev.disabled = state.page === 0;
  next.disabled = state.page >= pages - 1;
}

/** Une ligne : toucher n'importe où ouvre la fiche (lien sur le pseudo pour le clavier et le clic droit). */
function row(r) {
  const tr = el("tr");
  tr.addEventListener("click", (e) => { if (!e.target.closest("a")) location.hash = `#player/${r.user_id}`; });
  for (const c of COLUMNS) {
    const td = el("td", `${c.num ? "num" : ""} ${c.main ? "main" : "extra"}`.trim());
    if (c.key === "pseudo") {
      const a = el("a", r.pseudo ? "" : "muted", r.pseudo || "Sans pseudo");
      a.href = `#player/${r.user_id}`;
      td.append(a);
    } else {
      const v = c.cell(r);
      if (v instanceof Node) td.append(v); else td.textContent = v;
    }
    if (c.title) td.title = c.title(r);
    tr.append(td);
  }
  return tr;
}

// --- Export CSV : toute la vue (filtres et tri en cours), toutes les pages, toutes les colonnes ---------------
async function exportCsv(btn) {
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "Export…";
  try {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const res = await adminPlayers(query(offset, 200));
      rows.push(...(res.items || []));
      if (rows.length >= Number(res.total) || !(res.items || []).length) break;
    }
    const cols = [{ label: "Identifiant", csv: (r) => r.user_id }, ...COLUMNS];
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Point-virgule et BOM : s'ouvre directement dans Excel / Numbers en français.
    const lines = [cols.map((c) => esc(c.label)).join(";")];
    for (const r of rows) lines.push(cols.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(";"));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = `grail-joueurs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}
