// collection.js (admin) — onglet « Collection » : cartes sorties des boosters par rareté comparées aux
// taux annoncés, cartes possédées, modèles et marques les plus possédés et portés, album, Ultimes, kits.

import { adminCollection, adminBoosterDrops } from "../api.js?v=105";
import { stackedBars, barChart } from "./charts.js?v=105";
import { el, fmtInt, fmtNum, RARITIES } from "./format.js?v=105";
import { card, grid, empty, dataTable, tiles } from "./ui.js?v=105";
import { loadNames, brandName, pieceName, colorwayName, brandOfPiece } from "./catalog.js?v=105";
// Taux ANNONCÉS aux joueurs (copie d'affichage de economy_config : CLAUDE.md, section 6).
import { DROP_RATES } from "../economy-config.js?v=105";

const rarityLabel = (id) => RARITIES.find((r) => r.id === id)?.label || id;

export async function renderCollection(view, p) {
  const [col, drops] = await Promise.all([adminCollection(), adminBoosterDrops(p.from, p.to).catch((e) => e), loadNames()]);

  // --- Cartes sorties des boosters (période) ---
  const b0 = card(view, `Cartes sorties des boosters (${p.label})`, {
    note: "Tirage normal = cartes 1 à 3 d'un booster standard et cartes 1-2 d'un Signature ; carte Signature = 3e carte d'un Booster Signature. "
      + "Les cartes imposées par une garantie (pity) sont comptées : elles font un peu monter les raretés hautes." });
  if (drops instanceof Error) empty(b0, "Demande la migration 0040 sur le serveur.");
  else if (!drops.boosters) empty(b0, "Aucun booster ouvert sur la période.");
  else {
    const draws = [["standard", "Tirage normal", DROP_RATES.standard], ["signature", "Carte Signature", DROP_RATES.signatureLast]];
    const rows = [];
    for (const [draw, label, rates] of draws) {
      const cards = drops.cards.filter((c) => c.draw === draw);
      const total = cards.reduce((a, c) => a + Number(c.cards), 0);
      for (const r of RARITIES) {
        const c = cards.find((x) => x.rarity === r.id);
        const n = Number(c?.cards || 0);
        rows.push({ draw: label, rarity: r.id, cards: n, forced: Number(c?.forced || 0), total,
          observed: total ? (100 * n) / total : null, announced: rates[r.id] });
      }
    }
    tiles(b0, [
      { label: "Boosters ouverts", value: fmtInt(drops.boosters), sub: `dont ${fmtInt(drops.signature_boosters)} Signature` },
      { label: "Cartes", value: fmtInt(rows.reduce((a, r) => a + r.cards, 0)), sub: `${fmtInt(rows.reduce((a, r) => a + r.forced, 0))} imposées par une garantie` },
    ]);
    const bars = [];
    for (const [, label] of draws) {
      const rs = rows.filter((r) => r.draw === label);
      if (!rs[0].total) continue;
      bars.push({ label: `${label} · annoncé`, segments: rs.map((r) => ({ label: rarityLabel(r.rarity), value: r.announced, color: RARITIES.find((x) => x.id === r.rarity).color,
        tip: `${label}, annoncé : ${rarityLabel(r.rarity)} ${fmtNum(r.announced, 1)} %` })) });
      bars.push({ label: `${label} · observé`, segments: rs.map((r) => ({ label: rarityLabel(r.rarity), value: r.observed || 0, color: RARITIES.find((x) => x.id === r.rarity).color,
        tip: `${label}, observé : ${rarityLabel(r.rarity)} ${fmtNum(r.observed, 2)} % (${fmtInt(r.cards)} cartes)` })) });
    }
    const chartBox = el("div");
    b0.append(chartBox);
    stackedBars(chartBox, bars, { format: () => "100 %", labelWidth: 170 });
    dataTable(b0, { csvName: "cartes-sorties", rows, columns: [
      { key: "draw", label: "Tirage" },
      { key: "rarity", label: "Rareté", value: (r) => RARITIES.findIndex((x) => x.id === r.rarity), render: (r) => rarityLabel(r.rarity), csv: (r) => rarityLabel(r.rarity) },
      { key: "cards", label: "Cartes", num: true, render: (r) => fmtInt(r.cards) },
      { key: "observed", label: "Observé", num: true, render: (r) => (r.observed === null ? "—" : `${fmtNum(r.observed, 2)} %`) },
      { key: "announced", label: "Annoncé", num: true, render: (r) => `${fmtNum(r.announced, 1)} %` },
      { key: "gap", label: "Écart", num: true, value: (r) => (r.observed === null ? null : r.observed - r.announced),
        render: (r) => (r.observed === null ? "—" : `${r.observed - r.announced >= 0 ? "+" : "−"}${fmtNum(Math.abs(r.observed - r.announced), 2)} pt`) },
      { key: "forced", label: "Imposées", num: true, render: (r) => fmtInt(r.forced) },
    ] });
  }

  // --- Collection actuelle (instantané) ---
  const cat = col.catalogue || {};
  const album = col.album || {};
  tiles(view, [
    { label: "Cartes du jeu possédées", value: `${fmtInt(cat.cards_owned_by_someone)} / ${fmtInt(cat.cards)}`, sub: "par au moins un joueur" },
    { label: "Exemplaires", value: fmtInt((col.by_rarity || []).reduce((a, r) => a + Number(r.copies), 0)), sub: "dans les collections" },
    { label: "Cases d'album", value: fmtInt(album.cards), sub: `${fmtInt(album.players)} joueurs` },
    { label: "Ultimes", value: fmtInt(album.ultimates), sub: "obtenus" },
  ]);
  const g = grid(view);
  const b1 = card(g, "Cartes possédées par rareté (aujourd'hui)");
  dataTable(b1, { csvName: "possedees-par-rarete", rows: col.by_rarity || [], columns: [
    { key: "rarity", label: "Rareté", value: (r) => RARITIES.findIndex((x) => x.id === r.rarity), render: (r) => rarityLabel(r.rarity), csv: (r) => rarityLabel(r.rarity) },
    { key: "copies", label: "Exemplaires", num: true, value: (r) => Number(r.copies), render: (r) => fmtInt(r.copies) },
    { key: "distinct", label: "Coloris différents", num: true, value: (r) => Number(r.distinct), render: (r) => fmtInt(r.distinct) },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
  ] });
  const brands = col.by_brand || [];
  const b2 = card(g, "Marques : exemplaires possédés", { csv: () => ({ name: "marques", header: ["Marque", "Exemplaires", "Joueurs", "Pièces portées"],
    rows: brands.map((b) => [brandName(b.brand), b.copies, b.players, b.worn]) }) });
  barChart(b2, brands.map((b) => ({ label: brandName(b.brand), value: Number(b.copies), color: `var(--brand-${b.brand}, var(--accent))`,
    tip: `${brandName(b.brand)} : ${fmtInt(b.copies)} exemplaires, ${fmtInt(b.players)} joueurs, ${fmtInt(b.worn)} pièces portées` })),
    { format: (v) => fmtInt(v), labelWidth: 140, legend: "Exemplaires (couleur de la marque)" });
  const b3 = card(g, "Marques : pièces portées", { note: "Une pièce portée = un emplacement de la tenue d'un joueur, aujourd'hui." });
  barChart(b3, [...brands].sort((a, b) => b.worn - a.worn).map((b) => ({ label: brandName(b.brand), value: Number(b.worn), color: `var(--brand-${b.brand}, var(--accent))` })),
    { format: (v) => fmtInt(v), labelWidth: 140, legend: "Pièces portées" });
  const kits = col.starter_kits || [];
  const b4 = card(g, "Kits de départ choisis", { csv: () => ({ name: "kits-de-depart", header: ["Marque", "Joueurs"],
    rows: kits.map((k) => [k.brand === "inconnue" ? "Inconnue" : brandName(k.brand), k.players]) }) });
  if (!kits.length) empty(b4, "Aucun kit pris.");
  else barChart(b4, kits.map((k) => ({ label: k.brand === "inconnue" ? "Inconnue (avant 0037)" : brandName(k.brand), value: Number(k.players),
    color: `var(--brand-${k.brand}, var(--muted))` })), { format: (v) => fmtInt(v), labelWidth: 150, legend: "Joueurs" });

  // Modèles et coloris les plus possédés / portés
  const g2 = grid(view);
  const modelCols = (n) => [
    { key: "piece_id", label: "Modèle", value: (r) => pieceName(r.piece_id), csv: (r) => pieceName(r.piece_id) },
    { key: "brand", label: "Marque", value: (r) => brandName(brandOfPiece(r.piece_id)) },
    ...n,
  ];
  dataTable(card(g2, "Modèles les plus possédés"), { csvName: "modeles-possedes", sort: "copies", limit: 10, rows: col.top_models_owned || [], columns: modelCols([
    { key: "copies", label: "Exemplaires", num: true, value: (r) => Number(r.copies), render: (r) => fmtInt(r.copies) },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
  ]) });
  dataTable(card(g2, "Modèles les plus portés"), { csvName: "modeles-portes", sort: "players", limit: 10, rows: col.top_models_worn || [], columns: modelCols([
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
  ]) });
  dataTable(card(g2, "Coloris les plus possédés"), { csvName: "coloris-possedes", sort: "copies", limit: 10, rows: col.top_colorways_owned || [], columns: [
    { key: "colorway_id", label: "Coloris", value: (r) => colorwayName(r.colorway_id) },
    { key: "copies", label: "Exemplaires", num: true, value: (r) => Number(r.copies), render: (r) => fmtInt(r.copies) },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
  ] });
  dataTable(card(g2, "Coloris les plus portés"), { csvName: "coloris-portes", sort: "players", limit: 10, rows: col.top_colorways_worn || [], columns: [
    { key: "colorway_id", label: "Coloris", value: (r) => colorwayName(r.colorway_id) },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
  ] });

  // Album et Ultimes
  const b5 = card(view, "Ultimes obtenus");
  if (!(album.top_ultimates || []).length) empty(b5, "Aucun Ultime pour l'instant.");
  else dataTable(b5, { csvName: "ultimes", sort: "players", rows: album.top_ultimates, columns: [
    { key: "piece_id", label: "Modèle", value: (r) => pieceName(r.piece_id) },
    { key: "brand", label: "Marque", value: (r) => brandName(brandOfPiece(r.piece_id)) },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
  ] });
}
