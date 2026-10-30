// player.js — fiche d'un joueur dans le panel admin (#player/<identifiant>).
// Lecture seule : tout vient de admin_player(id) ; aucune action possible sur le joueur.

import { adminPlayer } from "../api.js?v=104";
import { columnChart, barChart, stackedBars, calendar } from "./charts.js?v=104";
import {
  el, fmtDate, fmtDateTime, fmtShortDate, fmtDaysAgo, fmtInt, fmtMinutes, fmtSeconds, fmtNum,
  statusPill, fmtPlatform, fmtScreen, RARITIES, fmtTxKind, DOORS,
} from "./format.js?v=104";

let brandNames = null; // noms des marques lus dans le catalogue du jeu (data/pieces.json)
async function loadBrands() {
  if (brandNames) return brandNames;
  try {
    const cat = await (await fetch("data/pieces.json?v=104")).json();
    brandNames = Object.fromEntries(cat.brands.map((b) => [b.id, b.name]));
  } catch {
    brandNames = {};
  }
  return brandNames;
}

/** Aujourd'hui, jour de Paris, "AAAA-MM-JJ". */
function todayParis() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export async function renderPlayer(container, id) {
  container.replaceChildren(el("p", "muted", "Chargement…"));
  let d;
  try {
    [d] = await Promise.all([adminPlayer(id), loadBrands()]);
  } catch (e) {
    container.replaceChildren(backLink(), el("p", "error-box", e.message));
    return;
  }
  if (location.hash !== `#player/${id}`) return; // l'admin est parti ailleurs pendant le chargement

  const s = d.summary || {};
  const p = d.profile || {};
  const page = el("div", "player");
  page.append(backLink(), header(d, s, p), tiles(d, s), twoCols(
    section("Minutes par jour (90 jours)", (box) => minutesChart(box, d.days || [])),
    section("Jours actifs", (box) => activityCalendar(box, d.days || [])),
  ));
  page.append(twoCols(
    section("Première session", (box) => firstSession(box, d.first_session)),
    section("Temps par écran", (box) => screensChart(box, d.screens || [])),
  ));
  page.append(twoCols(
    section("Collection par rareté", (box) => rarityChart(box, d.collection_by_rarity || {}, d)),
    section("Collection par marque", (box) => brandChart(box, d.collection_by_brand || [])),
  ));
  page.append(
    section(`Sessions (${(d.sessions || []).length} dernières)`, (box) => sessionsTable(box, d.sessions || [])),
    section("Transactions récentes", (box) => transactionsTable(box, d.transactions || [])),
    section("Essais au Videur", (box) => videurTable(box, d.videur_attempts || [])),
  );
  container.replaceChildren(page);
}

function backLink() {
  const a = el("a", "back", "‹ Joueurs");
  a.href = "#players"; // la liste garde sa recherche, ses filtres, son tri et sa page (players.js)
  return a;
}

function section(title, fill) {
  const box = el("section", "card");
  box.append(el("h2", "card-title", title));
  const body = el("div", "card-body");
  box.append(body);
  fill(body);
  return box;
}

function twoCols(a, b) {
  const g = el("div", "two-cols");
  g.append(a, b);
  return g;
}

function empty(box, text = "Aucune donnée.") {
  box.append(el("p", "muted", text));
}

// --- En-tête ------------------------------------------------------------------------------
function header(d, s, p) {
  const h = el("header", "player-head");
  const name = el("h1", "page-title", p.pseudo || "Sans pseudo");
  const line = el("div", "player-meta");
  line.append(statusPill(s.status));
  if (d.is_admin) line.append(el("span", "pill", "Admin"));
  const facts = [
    `Inscrit le ${fmtDate(p.created_at)} (${s.age_days ?? "?"} j)`,
    `Dernière visite : ${fmtDaysAgo(s.days_since_last_active)}`,
    fmtPlatform(s.platform),
  ];
  if (s.favorite_screen) facts.push(`Écran favori : ${fmtScreen(s.favorite_screen)}`);
  for (const f of facts) line.append(el("span", "muted", f));
  h.append(name, line, el("p", "id-line", p.id));
  return h;
}

// --- Tuiles de chiffres clés -------------------------------------------------------------
function tiles(d, s) {
  const list = [
    ["Jours actifs", fmtInt(s.days_active), `série ${fmtInt(s.current_streak)} · record ${fmtInt(s.longest_streak)}`],
    ["Sessions", fmtInt(s.sessions), `aujourd'hui ${fmtMinutes(s.today_minutes)}`],
    ["Temps total", fmtMinutes(s.active_minutes), `moy. ${fmtMinutes(s.avg_session_minutes)} · méd. ${fmtMinutes(s.median_session_minutes)}`],
    ["Boosters", fmtInt(s.boosters_opened), s.minutes_to_first_booster != null ? `1er après ${fmtMinutes(s.minutes_to_first_booster)}` : "aucun"],
    ["Videur", s.videur_level ? `Niv. ${s.videur_level}` : "—", `${fmtInt(s.videur_passes)} / ${fmtInt(s.videur_attempts)} essais réussis`],
    ["Cartes", fmtInt(s.distinct_cards), `${fmtInt(s.cards_owned)} exemplaires`],
    ["Légendaires", fmtInt(s.legendaries), `${fmtInt(s.epics)} Épiques`],
    ["Pièces", fmtInt(s.coins), `+${fmtInt(s.coins_earned)} / −${fmtInt(s.coins_spent)}`],
    ["Market", fmtInt((s.market_buys || 0) + (s.market_sales || 0)), `${fmtInt(s.market_buys)} achats · ${fmtInt(s.market_sales)} ventes`],
    ["Amis", fmtInt(d.friends), d.friend_requests_pending ? `${d.friend_requests_pending} en attente` : (s.has_pseudo ? "pseudo choisi" : "sans pseudo")],
    ["Partages", fmtInt(s.outfit_shares), `${fmtInt(d.share_views)} visites`],
    ["Album", fmtInt(d.album_cards), `${(d.ultimates || []).length} Ultime${(d.ultimates || []).length > 1 ? "s" : ""}`],
    ["Kit de départ", s.starter_kit_at ? (brandNames[s.starter_kit_brand] || s.starter_kit_brand || "Pris") : "Non", s.starter_kit_at ? fmtDate(s.starter_kit_at) : ""],
    ["Tenues", fmtInt(s.outfit_pieces), `pièces portées · ${fmtInt(s.saved_outfits)} enregistrées`],
  ];
  const g = el("div", "tiles");
  for (const [label, value, sub] of list) {
    const t = el("div", "tile");
    t.append(el("span", "tile-label", label), el("strong", "tile-value", value), el("span", "tile-sub", sub || ""));
    g.append(t);
  }
  return g;
}

// --- Graphiques -----------------------------------------------------------------------------
/** 90 jours jusqu'à aujourd'hui, 0 les jours sans activité. */
function lastDays(days, n) {
  const byDay = Object.fromEntries(days.map((x) => [x.day, x]));
  const out = [];
  const end = new Date(`${todayParis()}T12:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(end);
    dt.setUTCDate(end.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    out.push({ day: key, row: byDay[key] });
  }
  return out;
}

function minutesChart(box, days) {
  if (!days.length) return empty(box, "Aucune activité enregistrée.");
  // Commence au premier jour actif (au plus 90 jours) pour ne pas écraser le graphique.
  const first = days.reduce((m, x) => (x.day < m ? x.day : m), days[0].day);
  const span = Math.min(90, Math.max(7, Math.round((Date.parse(todayParis()) - Date.parse(first)) / 864e5) + 1));
  const pts = lastDays(days, span).map(({ day, row }) => ({
    label: fmtShortDate(day),
    value: row ? row.active_seconds / 60 : 0,
    tip: `${fmtDate(day)} : ${row ? `${fmtSeconds(row.active_seconds)} · ${row.sessions} session${row.sessions > 1 ? "s" : ""}` : "inactif"}`,
  }));
  const wrap = el("div");
  box.append(wrap);
  columnChart(wrap, pts, { format: (v) => `${Math.round(v)}`, color: "var(--accent)" });
  box.append(el("p", "muted small", "Minutes de jeu (jeu affiché à l'écran). Touche une colonne pour le détail."));
}

function activityCalendar(box, days) {
  const values = Object.fromEntries(days.map((x) => [x.day, Math.round(x.active_seconds / 60)]));
  const wrap = el("div");
  box.append(wrap);
  calendar(wrap, values, { weeks: 13, today: todayParis(), format: (v) => fmtMinutes(v), unit: "" });
  const legend = el("div", "cal-legend muted small");
  legend.append("Moins");
  for (let i = 0; i <= 4; i++) legend.append(el("i", `chart-cal-${i}`));
  legend.append("Plus");
  box.append(legend);
}

function screensChart(box, screens) {
  if (!screens.length) return empty(box, "Pas encore de temps par écran (migration 0037).");
  const wrap = el("div");
  box.append(wrap);
  barChart(wrap, screens.map((x) => ({
    label: fmtScreen(x.screen), value: Number(x.minutes),
    tip: `${fmtScreen(x.screen)} : ${fmtMinutes(x.minutes)} sur ${x.days} jour${x.days > 1 ? "s" : ""}`,
  })), { format: (v) => fmtMinutes(v), labelWidth: 92 });
}

function rarityChart(box, byRarity, d) {
  const segs = RARITIES.map((r) => ({ label: r.label, value: Number(byRarity[r.id]?.copies || 0), color: r.color }));
  const distinct = RARITIES.map((r) => ({ label: r.label, value: Number(byRarity[r.id]?.distinct || 0), color: r.color }));
  if (!segs.some((x) => x.value)) return empty(box, "Collection vide.");
  const wrap = el("div");
  box.append(wrap);
  stackedBars(wrap, [
    { label: "Exemplaires", segments: segs },
    { label: "Différentes", segments: distinct },
  ], { format: (v) => fmtInt(v), labelWidth: 100 });
  if (d.album_cards) box.append(el("p", "muted small", `+ ${fmtInt(d.album_cards)} carte${d.album_cards > 1 ? "s" : ""} placée${d.album_cards > 1 ? "s" : ""} dans l'album.`));
}

function brandChart(box, byBrand) {
  if (!byBrand.length) return empty(box, "Collection vide.");
  const wrap = el("div");
  box.append(wrap);
  barChart(wrap, byBrand.map((b) => ({
    label: brandNames[b.brand] || b.brand, value: Number(b.copies),
    color: `var(--brand-${b.brand}, var(--accent))`,
    tip: `${brandNames[b.brand] || b.brand} : ${fmtInt(b.copies)} exemplaires, ${fmtInt(b.distinct)} cartes différentes`,
  })), { format: (v) => fmtInt(v), labelWidth: 140 });
}

// --- Première session ------------------------------------------------------------------------
function firstSession(box, f) {
  if (!f) return empty(box, "Première session inconnue (avant la mesure des sessions).");
  const yes = (v) => (v === null || v === undefined ? "trop tôt" : v ? "oui" : "non");
  const rows = [
    ["Début", fmtDateTime(f.started_at)],
    ["Durée", `${fmtMinutes(f.duration_minutes)} (dont ${fmtMinutes(f.active_minutes)} actives)`],
    ["Plateforme", fmtPlatform(f.platform)],
    ["Boosters ouverts", fmtInt(f.boosters_opened)],
    ["Tenue changée", yes(f.outfit_changed)],
    ["Videur tenté", yes(f.videur_tried)],
    ["Market vu", yes(f.market_seen)],
    ["Premier écran", fmtScreen(f.first_screen)],
    ["Dernier écran avant de partir", fmtScreen(f.last_screen_before_leaving)],
    ["Revenu le lendemain", yes(f.came_back_next_day)],
  ];
  const dl = el("dl", "kv");
  for (const [k, v] of rows) dl.append(el("dt", "", k), el("dd", "", v));
  box.append(dl);
  if (f.screens?.length) box.append(chips(f.screens));
}

function chips(screens) {
  const c = el("div", "chips");
  for (const s of screens) c.append(el("span", "chip-static", fmtScreen(s)));
  return c;
}

// --- Tableaux ----------------------------------------------------------------------------------
function table(box, headers, rows) {
  const scroller = el("div", "table-scroll");
  const t = el("table", "data-table");
  const tr = el("tr");
  for (const h of headers) tr.append(el("th", h.num ? "num" : "", h.label));
  const thead = el("thead");
  thead.append(tr);
  const tbody = el("tbody");
  for (const r of rows) {
    const line = el("tr");
    r.forEach((v, i) => {
      const td = el("td", headers[i].num ? "num" : "");
      if (v instanceof Node) td.append(v); else td.textContent = v;
      line.append(td);
    });
    tbody.append(line);
  }
  t.append(thead, tbody);
  scroller.append(t);
  box.append(scroller);
  // Au-delà de 10 lignes : les autres sont repliées derrière « Tout afficher » (fiche moins longue sur iPad).
  if (rows.length > SHOWN) {
    const extra = [...tbody.children].slice(SHOWN);
    extra.forEach((r) => { r.hidden = true; });
    const more = el("button", "chip more", `Tout afficher (${rows.length})`);
    more.type = "button";
    more.addEventListener("click", () => { extra.forEach((r) => { r.hidden = false; }); more.remove(); });
    box.append(more);
  }
}
const SHOWN = 10;

function sessionsTable(box, sessions) {
  if (!sessions.length) return empty(box, "Aucune session enregistrée.");
  table(box, [
    { label: "Début" }, { label: "Durée", num: true }, { label: "Active", num: true }, { label: "Écrans" }, { label: "Dernier écran" },
  ], sessions.map((x) => {
    const lengthMin = (Date.parse(x.ended_at) - Date.parse(x.started_at)) / 60000;
    const start = el("span", "", fmtDateTime(x.started_at));
    if (x.is_first_session) start.append(el("span", "pill tiny", "1re"));
    return [start, fmtMinutes(lengthMin), fmtSeconds(x.active_seconds), chips(x.screens || []), fmtScreen(x.last_screen)];
  }));
}

function transactionsTable(box, txs) {
  if (!txs.length) return empty(box, "Aucune transaction.");
  table(box, [{ label: "Date" }, { label: "Type" }, { label: "Pièces", num: true }, { label: "Détail" }], txs.map((t) => {
    const delta = Number(t.coins_delta || 0);
    const coins = el("span", delta > 0 ? "pos" : delta < 0 ? "neg" : "muted", delta ? `${delta > 0 ? "+" : "−"}${fmtInt(Math.abs(delta))}` : "0");
    const det = t.details || {};
    const parts = [];
    if (det.colorway_id) parts.push(`${det.colorway_id}${det.rarity ? ` · ${det.rarity}` : ""}`);
    if (Array.isArray(det.cards)) parts.push(`${det.cards.length} carte${det.cards.length > 1 ? "s" : ""}`);
    if (det.signature) parts.push("Signature");
    if (det.shop) parts.push("Boutique Grail");
    if (det.signup) parts.push("bonus d'inscription");
    if (det.price !== undefined) parts.push(`prix ${fmtInt(det.price)}`);
    if (det.tax) parts.push(`taxe ${fmtInt(det.tax)}`);
    return [fmtDateTime(t.created_at), fmtTxKind(t.kind), coins, parts.join(" · ") || "—"];
  }));
}

function videurTable(box, attempts) {
  if (!attempts.length) return empty(box, "Aucun essai au Videur.");
  table(box, [
    { label: "Date" }, { label: "Niveau", num: true }, { label: "Porte" }, { label: "Résultat" }, { label: "Critères", num: true }, { label: "Boosters", num: true },
  ], attempts.map((a) => [
    fmtDateTime(a.created_at),
    a.level ? fmtInt(a.level) : "ancien",
    DOORS[a.door] || a.door,
    el("span", a.passed ? "pos" : "neg", a.passed ? "✔ Entré" : "✖ Refusé"),
    a.total ? `${fmtNum(a.matched)} / ${fmtNum(a.total)}` : "—",
    a.boosters_gained ? `+${a.boosters_gained}` : "—",
  ]));
}
