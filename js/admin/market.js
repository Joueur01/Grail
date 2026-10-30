// market.js (admin) — onglet « Market » : ventes par jour et par rareté, prix par rareté,
// cartes les plus vendues, part de la Boutique Grail, offres en cours.

import { adminMarket, adminMarketDaily } from "../api.js?v=105";
import { stackedColumns, stackedBars, barChart } from "./charts.js?v=105";
import { fmtInt, fmtNum, fmtShortDate, fmtDate, RARITIES } from "./format.js?v=105";
import { card, grid, empty, dataTable, tiles, delta } from "./ui.js?v=105";
import { loadNames, colorwayName } from "./catalog.js?v=105";
import { addDays } from "./period.js?v=105";

const rarityLabel = (id) => RARITIES.find((r) => r.id === id)?.label || id;
const rarityOrder = (id) => RARITIES.findIndex((r) => r.id === id);

export async function renderMarket(view, p) {
  const [mk, prev, daily] = await Promise.all([
    adminMarket(p.from, p.to), adminMarket(p.prev.from, p.prev.to), adminMarketDaily(p.from, p.to).catch((e) => e), loadNames(),
  ]);
  const s = mk.sales || {}, sp = prev.sales || {};
  const offers = (mk.active_offers || []).reduce((a, o) => a + Number(o.offers), 0);
  tiles(view, [
    { label: "Ventes", value: fmtInt(s.total), sub: `${fmtInt(s.players)} entre joueurs · ${fmtInt(s.shop)} Boutique`, delta: delta(s.total, sp.total) },
    { label: "Pièces échangées", value: fmtInt(s.volume), delta: delta(s.volume, sp.volume) },
    { label: "Taxe prélevée", value: fmtInt(s.tax), delta: delta(s.tax, sp.tax) },
    { label: "Acheteurs", value: fmtInt(s.buyers), delta: delta(s.buyers, sp.buyers) },
    { label: "Vendeurs", value: fmtInt(s.sellers), sub: "joueurs (hors Boutique)", delta: delta(s.sellers, sp.sellers) },
    { label: "Offres en cours", value: fmtInt(offers), sub: `${fmtInt(mk.shop?.active_offers)} de la Boutique` },
  ]);

  // Ventes par jour et par rareté
  const g = grid(view);
  const b1 = card(g, "Ventes par jour et par rareté", daily instanceof Error ? {} : { csv: () => ({ name: "ventes-par-jour",
    header: ["Jour", "Rareté", "Ventes", "dont Boutique", "Pièces", "dont Boutique"],
    rows: daily.rows.map((r) => [r.day, rarityLabel(r.rarity), r.sales, r.shop_sales, r.volume, r.shop_volume]) }) });
  let shopSplit = null;
  if (daily instanceof Error) empty(b1, "Demande la migration 0040 sur le serveur.");
  else {
    const days = [];
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) days.push(d);
    const by = {};
    for (const r of daily.rows) (by[r.rarity] ??= {})[r.day] = Number(r.sales);
    stackedColumns(b1, days.map(fmtShortDate), RARITIES.map((r) => ({ label: r.label, color: r.color, values: days.map((d) => by[r.id]?.[d] || 0) })),
      { format: (v) => fmtInt(v), tipLabels: days.map(fmtDate) });
    shopSplit = daily.rows.reduce((a, r) => {
      a.n += Number(r.sales) - Number(r.shop_sales); a.ns += Number(r.shop_sales);
      a.v += Number(r.volume) - Number(r.shop_volume); a.vs += Number(r.shop_volume);
      return a;
    }, { n: 0, ns: 0, v: 0, vs: 0 });
  }

  // Part de la Boutique Grail
  const split = shopSplit || { n: Number(s.players) || 0, ns: Number(s.shop) || 0, v: null, vs: null };
  const b2 = card(g, "Part de la Boutique Grail", { note: "Les pièces dépensées à la Boutique disparaissent du jeu (aucun vendeur ne les reçoit).",
    csv: () => ({ name: "part-boutique", header: ["", "Entre joueurs", "Boutique Grail"], rows: [["Ventes", split.n, split.ns], ["Pièces", split.v ?? "", split.vs ?? ""]] }) });
  if (!split.n && !split.ns) empty(b2);
  else stackedBars(b2, [
    { label: "Ventes", segments: [{ label: "Entre joueurs", value: split.n, color: "var(--rarity-rare)" }, { label: "Boutique Grail", value: split.ns, color: "var(--ok)" }] },
    ...(split.v === null ? [] : [{ label: "Pièces", segments: [{ label: "Entre joueurs", value: split.v, color: "var(--rarity-rare)" }, { label: "Boutique Grail", value: split.vs, color: "var(--ok)" }] }]),
  ], { format: (v) => fmtInt(v), labelWidth: 80 });

  // Prix par rareté
  const prices = (mk.prices || []).map((r) => ({ ...r, seller: r.shop ? "Boutique" : "Joueurs" }));
  const g2 = grid(view);
  const b3 = card(g2, "Prix médian par rareté (ventes entre joueurs)");
  const pl = prices.filter((r) => !r.shop).sort((a, b) => rarityOrder(a.rarity) - rarityOrder(b.rarity));
  if (!pl.length) empty(b3);
  else barChart(b3, pl.map((r) => ({ label: rarityLabel(r.rarity), value: Number(r.median), color: RARITIES[rarityOrder(r.rarity)]?.color,
    tip: `${rarityLabel(r.rarity)} : médian ${fmtInt(r.median)} · moyen ${fmtNum(r.average, 1)} · ${fmtInt(r.sales)} ventes` })),
    { format: (v) => fmtInt(v), legend: "Prix médian en pièces (moyen dans l'infobulle)", labelWidth: 100 });
  const b4 = card(g2, "Prix par rareté");
  if (!prices.length) empty(b4);
  else dataTable(b4, { csvName: "prix-par-rarete", sort: "rarity", dir: "asc", rows: prices, columns: [
    { key: "rarity", label: "Rareté", value: (r) => rarityOrder(r.rarity), render: (r) => rarityLabel(r.rarity), csv: (r) => rarityLabel(r.rarity) },
    { key: "seller", label: "Vendeur" },
    { key: "sales", label: "Ventes", num: true, value: (r) => Number(r.sales), render: (r) => fmtInt(r.sales) },
    { key: "average", label: "Moyen", num: true, value: (r) => Number(r.average), render: (r) => fmtNum(r.average, 1) },
    { key: "median", label: "Médian", num: true, value: (r) => Number(r.median), render: (r) => fmtNum(r.median, 1) },
    { key: "min", label: "Min", num: true, value: (r) => Number(r.min), render: (r) => fmtInt(r.min) },
    { key: "max", label: "Max", num: true, value: (r) => Number(r.max), render: (r) => fmtInt(r.max) },
  ] });

  // Cartes les plus vendues + offres en cours
  const g3 = grid(view);
  const b5 = card(g3, "Cartes les plus vendues");
  if (!(mk.top_cards || []).length) empty(b5);
  else dataTable(b5, { csvName: "cartes-plus-vendues", sort: "sales", rows: mk.top_cards, limit: 10, columns: [
    { key: "colorway_id", label: "Carte", value: (r) => colorwayName(r.colorway_id), csv: (r) => colorwayName(r.colorway_id) },
    { key: "rarity", label: "Rareté", value: (r) => rarityOrder(r.rarity), render: (r) => rarityLabel(r.rarity), csv: (r) => rarityLabel(r.rarity) },
    { key: "sales", label: "Ventes", num: true, value: (r) => Number(r.sales), render: (r) => fmtInt(r.sales) },
    { key: "shop_sales", label: "dont Boutique", num: true, value: (r) => Number(r.shop_sales), render: (r) => fmtInt(r.shop_sales) },
    { key: "average", label: "Prix moyen", num: true, value: (r) => Number(r.average), render: (r) => fmtNum(r.average, 1) },
  ] });
  const b6 = card(g3, "Offres en cours");
  if (!(mk.active_offers || []).length) empty(b6, "Aucune offre en cours.");
  else dataTable(b6, { csvName: "offres-en-cours", sort: "rarity", dir: "asc", rows: mk.active_offers.map((r) => ({ ...r, seller: r.shop ? "Boutique" : "Joueurs" })), columns: [
    { key: "rarity", label: "Rareté", value: (r) => rarityOrder(r.rarity), render: (r) => rarityLabel(r.rarity), csv: (r) => rarityLabel(r.rarity) },
    { key: "seller", label: "Vendeur" },
    { key: "offers", label: "Offres", num: true, value: (r) => Number(r.offers), render: (r) => fmtInt(r.offers) },
    { key: "min_price", label: "Prix min", num: true, value: (r) => Number(r.min_price), render: (r) => fmtInt(r.min_price) },
    { key: "average", label: "Prix moyen", num: true, value: (r) => Number(r.average), render: (r) => fmtNum(r.average, 1) },
  ] });
}
