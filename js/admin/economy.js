// economy.js — onglet « Économie » : pièces reçues par source et détruites par puits (par jour),
// pièces en circulation, répartition des soldes, détail par type de transaction, plus gros soldes.

import { adminEconomy, adminEconomyFlows } from "../api.js?v=105";
import { stackedColumns, lineChart, columnChart } from "./charts.js?v=105";
import { el, fmtInt, fmtShortDate, fmtDate, fmtTxKind } from "./format.js?v=105";
import { card, grid, empty, dataTable, tiles, delta } from "./ui.js?v=105";

export async function renderEconomy(view, p) {
  const [eco, prev, flows] = await Promise.all([
    adminEconomy(p.from, p.to), adminEconomy(p.prev.from, p.prev.to), adminEconomyFlows(p.from, p.to).catch((e) => e),
  ]);
  const t = eco.totals || {}, tp = prev.totals || {};
  const c = eco.circulation || {};
  tiles(view, [
    { label: "En circulation", value: fmtInt(c.total), sub: `${fmtInt(c.players)} joueurs · médiane ${fmtInt(c.median)}` },
    { label: "Pièces créées", value: fmtInt(t.created), sub: "bonus, défausse…", delta: delta(t.created, tp.created) },
    { label: "Pièces détruites", value: fmtInt(t.destroyed), sub: "taxe, Boutique…", delta: delta(t.destroyed, tp.destroyed) },
    { label: "Variation nette", value: `${Number(t.net) >= 0 ? "+" : "−"}${fmtInt(Math.abs(Number(t.net) || 0))}`, sub: "créées − détruites" },
    { label: "Taxe du Market", value: fmtInt(eco.market_tax), sub: "5 % des ventes", delta: delta(eco.market_tax, prev.market_tax) },
    { label: "Dépensé à la Boutique", value: fmtInt(eco.shop_spent), sub: "pièces retirées", delta: delta(eco.shop_spent, prev.shop_spent) },
    { label: "Boosters en attente", value: fmtInt(eco.boosters_waiting?.bonus_stock), sub: "offerts, pas encore ouverts" },
  ]);

  if (flows instanceof Error) {
    empty(card(view, "Flux de pièces par jour"), "Ces graphiques demandent la migration 0040 sur le serveur.");
  } else {
    const d = flows.daily || [];
    const labels = d.map((x) => fmtShortDate(x.day));
    const tips = d.map((x) => fmtDate(x.day));
    const g = grid(view);
    const b1 = card(g, "Pièces reçues par source", {
      note: "Seuls le bonus, la défausse et les autres gains créent des pièces : une vente au Market est un transfert entre joueurs (prix − taxe).",
      csv: () => ({ name: "pieces-recues", header: ["Jour", "Bonus", "Défausse", "Ventes au Market", "Autres gains", "Créées"],
        rows: d.map((x) => [x.day, x.bonus, x.discard, x.sales, x.other_in, x.created]) }) });
    stackedColumns(b1, labels, [
      { label: "Bonus", color: "var(--ok)", values: d.map((x) => x.bonus) },
      { label: "Défausse", color: "var(--rarity-epique)", values: d.map((x) => x.discard) },
      { label: "Ventes (transfert)", color: "var(--rarity-rare)", values: d.map((x) => x.sales) },
      { label: "Autres", color: "var(--muted)", values: d.map((x) => x.other_in) },
    ], { format: (v) => fmtInt(v), tipLabels: tips });
    const b2 = card(g, "Pièces détruites par puits", { csv: () => ({ name: "pieces-detruites",
      header: ["Jour", "Taxe", "Boutique Grail", "Autres", "Détruites"], rows: d.map((x) => [x.day, x.tax, x.shop, x.other_out, x.destroyed]) }) });
    stackedColumns(b2, labels, [
      { label: "Taxe du Market", color: "var(--warn)", values: d.map((x) => x.tax) },
      { label: "Boutique Grail", color: "var(--bad)", values: d.map((x) => x.shop) },
      { label: "Autres", color: "var(--muted)", values: d.map((x) => x.other_out) },
    ], { format: (v) => fmtInt(v), tipLabels: tips });

    const g2 = grid(view);
    const b3 = card(g2, "Pièces en circulation (fin de journée)", {
      note: "Reconstituée à partir des transactions : soldes d'aujourd'hui moins les variations des jours suivants.",
      csv: () => ({ name: "circulation", header: ["Jour", "Pièces en circulation"], rows: d.map((x) => [x.day, x.circulation]) }) });
    lineChart(b3, d.map((x) => ({ label: fmtShortDate(x.day), value: Number(x.circulation), tip: `${fmtDate(x.day)} : ${fmtInt(x.circulation)} pièces` })),
      { format: (v) => fmtInt(v), legend: "Pièces détenues par tous les joueurs", color: "var(--rarity-legendaire)" });
    const bal = flows.balances || [];
    const b4 = card(g2, "Répartition des soldes (aujourd'hui)", { csv: () => ({ name: "soldes", header: ["Solde", "Joueurs"],
      rows: bal.map((x) => [x.bucket, x.players]) }) });
    columnChart(b4, bal.map((x) => ({ label: x.bucket, value: Number(x.players), tip: `${x.bucket} pièces : ${fmtInt(x.players)} joueur${x.players > 1 ? "s" : ""}` })),
      { format: (v) => fmtInt(v), legend: "Joueurs par tranche de solde", color: "var(--rarity-legendaire)" });
  }

  const g3 = grid(view);
  const b5 = card(g3, "Par type de transaction");
  if (!(eco.by_kind || []).length) empty(b5);
  else dataTable(b5, { csvName: "transactions-par-type", sort: "count", rows: eco.by_kind, columns: [
    { key: "kind", label: "Type", render: (r) => fmtTxKind(r.kind), csv: (r) => fmtTxKind(r.kind) },
    { key: "count", label: "Nombre", num: true, value: (r) => Number(r.count), render: (r) => fmtInt(r.count) },
    { key: "coins_in", label: "Reçues", num: true, value: (r) => Number(r.coins_in), render: (r) => fmtInt(r.coins_in) },
    { key: "coins_out", label: "Dépensées", num: true, value: (r) => Number(r.coins_out), render: (r) => fmtInt(r.coins_out) },
  ] });
  const b6 = card(g3, "Plus gros soldes");
  dataTable(b6, { csvName: "plus-gros-soldes", sort: "coins", rows: eco.top_balances || [], columns: [
    { key: "pseudo", label: "Joueur", render: (r) => { const a = el("a", "", r.pseudo || "Sans pseudo"); a.href = `#player/${r.user_id}`; return a; },
      value: (r) => r.pseudo || "", csv: (r) => r.pseudo || r.user_id },
    { key: "coins", label: "Pièces", num: true, value: (r) => Number(r.coins), render: (r) => fmtInt(r.coins) },
  ] });
}
