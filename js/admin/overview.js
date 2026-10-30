// overview.js — onglet « Vue d'ensemble » : chiffres clés (avec la variation par rapport à la période
// précédente), inscriptions et actifs par jour, rétention, cohortes, entonnoir, premières sessions.

import { adminOverview, adminRetention, adminFunnel, adminFirstSessions } from "../api.js?v=105";
import { lineChart, multiLineChart, barChart, columnChart } from "./charts.js?v=105";
import { el, fmtInt, fmtNum, fmtMinutes, fmtShortDate, fmtDate, fmtScreen } from "./format.js?v=105";
import { card, grid, empty, dataTable, tiles, delta } from "./ui.js?v=105";

/** Rétention J+N moyenne des cohortes inscrites dans la période (pondérée par leur taille). */
function cohortRate(cohorts, from, to, key) {
  let n = 0, sum = 0;
  for (const c of cohorts) {
    if (c.signup_day < from || c.signup_day > to || c[key] === null || c[key] === undefined) continue;
    n += Number(c.cohort_size);
    sum += Number(c[key]) * Number(c.cohort_size);
  }
  return n ? { pct: sum / n, players: n } : null;
}

/** Couleur d'une case de cohorte : plus le % est haut, plus le vert est franc. */
const heat = (pct) => (pct === null || pct === undefined ? "" :
  `background: rgba(95, 208, 138, ${(0.08 + 0.72 * Math.min(1, Number(pct) / 100)).toFixed(2)}); color: var(--text)`);

export async function renderOverview(view, p) {
  const [ov, prev, ret, fun, fs] = await Promise.all([
    adminOverview(p.from, p.to), adminOverview(p.prev.from, p.prev.to), adminRetention(), adminFunnel(),
    adminFirstSessions(p.from, p.to).catch((e) => e),
  ]);
  const cohorts = ret.cohorts || [];
  const r1 = cohortRate(cohorts, p.from, p.to, "d1_pct"), r1p = cohortRate(cohorts, p.prev.from, p.prev.to, "d1_pct");
  const r7 = cohortRate(cohorts, p.from, p.to, "d7_pct"), r7p = cohortRate(cohorts, p.prev.from, p.prev.to, "d7_pct");
  const perActive = (o) => (Number(o.active_players) ? Number(o.minutes) / Number(o.active_players) : null);

  tiles(view, [
    { label: "Inscrits", value: fmtInt(ov.signups), sub: `${fmtInt(ov.players_total)} au total`, delta: delta(ov.signups, prev.signups) },
    { label: "Actifs le dernier jour", value: fmtInt(ov.dau), sub: fmtDate(p.to), delta: delta(ov.dau, prev.dau) },
    { label: "Actifs sur 7 j", value: fmtInt(ov.wau), sub: "fin de période", delta: delta(ov.wau, prev.wau) },
    { label: "Actifs sur 30 j", value: fmtInt(ov.mau), sub: "fin de période", delta: delta(ov.mau, prev.mau) },
    { label: "Rétention J+1", value: r1 ? `${fmtNum(r1.pct, 1)} %` : "—", sub: r1 ? `${fmtInt(r1.players)} inscrits mesurables` : "trop tôt",
      delta: r1 && r1p ? delta(r1.pct, r1p.pct, { points: true }) : null },
    { label: "Rétention J+7", value: r7 ? `${fmtNum(r7.pct, 1)} %` : "—", sub: r7 ? `${fmtInt(r7.players)} inscrits mesurables` : "trop tôt",
      delta: r7 && r7p ? delta(r7.pct, r7p.pct, { points: true }) : null },
    { label: "Minutes / joueur actif", value: fmtMinutes(perActive(ov)), sub: `${fmtInt(ov.active_players)} actifs sur la période`,
      delta: delta(perActive(ov), perActive(prev)) },
    { label: "Temps de jeu", value: fmtMinutes(ov.minutes), sub: `${fmtInt(ov.sessions)} sessions`, delta: delta(ov.minutes, prev.minutes) },
  ]);

  // Inscriptions et actifs par jour
  const series = ov.series || [];
  const days = series.map((s) => fmtShortDate(s.day));
  const g1 = grid(view);
  const b1 = card(g1, "Inscriptions et joueurs actifs par jour", { csv: () => ({
    name: "inscriptions-actifs", header: ["Jour", "Inscrits", "Actifs (jour)", "Actifs (7 j)", "Actifs (30 j)", "Minutes", "Sessions"],
    rows: series.map((s) => [s.day, s.signups, s.dau, s.wau, s.mau, s.minutes, s.sessions]) }) });
  multiLineChart(b1, days, [
    { label: "Inscrits", color: "var(--warn)", values: series.map((s) => s.signups) },
    { label: "Actifs du jour", color: "var(--accent)", values: series.map((s) => s.dau) },
    { label: "Actifs sur 7 j", color: "var(--rarity-rare)", values: series.map((s) => s.wau), dashed: true },
  ], { format: (v) => fmtInt(v), tipLabels: series.map((s) => fmtDate(s.day)) });

  // Courbe de rétention (tous les joueurs)
  const curve = (ret.curve || []).filter((c) => Number(c.eligible_players) > 0);
  const b2 = card(g1, "Rétention (tous les inscrits)", {
    note: "Part des joueurs revenus exactement N jours après leur inscription (parmi ceux inscrits depuis au moins N jours).",
    csv: () => ({ name: "retention", header: ["Jour", "Joueurs mesurables", "Revenus", "%"],
      rows: curve.map((c) => [`J+${c.day_offset}`, c.eligible_players, c.retained_players, c.retention_pct]) }) });
  if (!curve.length) empty(b2);
  else lineChart(b2, curve.map((c) => ({ label: `J+${c.day_offset}`, value: Number(c.retention_pct) || 0,
    tip: `J+${c.day_offset} : ${fmtNum(c.retention_pct, 1)} % (${fmtInt(c.retained_players)} / ${fmtInt(c.eligible_players)})` })),
    { format: (v) => `${fmtNum(v)} %`, legend: "% de joueurs revenus", color: "var(--ok)" });

  // Cohortes (carte de chaleur)
  const inPeriod = cohorts.filter((c) => c.signup_day >= p.from && c.signup_day <= p.to);
  const b3 = card(view, "Cohortes par jour d'inscription", { note: "« — » : trop tôt pour savoir. Plus la case est verte, plus les joueurs sont revenus." });
  if (!inPeriod.length) empty(b3, "Aucune inscription sur la période.");
  else {
    const pctCol = (key, label) => ({ key, label, num: true, render: (r) => (r[key] === null || r[key] === undefined ? "—" : `${fmtNum(r[key], 1)} %`),
      value: (r) => (r[key] === null || r[key] === undefined ? null : Number(r[key])), style: (r) => heat(r[key]) });
    dataTable(b3, { csvName: "cohortes", sort: "signup_day", dir: "desc", rows: inPeriod, columns: [
      { key: "signup_day", label: "Inscription", render: (r) => fmtDate(r.signup_day) },
      { key: "cohort_size", label: "Joueurs", num: true, value: (r) => Number(r.cohort_size) },
      pctCol("d1_pct", "J+1"), pctCol("d3_pct", "J+3"), pctCol("d7_pct", "J+7"), pctCol("d14_pct", "J+14"), pctCol("d30_pct", "J+30"),
    ] });
  }

  // Entonnoir d'activation
  const g2 = grid(view);
  const b4 = card(g2, "Entonnoir d'activation (tous les inscrits)", { csv: () => ({ name: "entonnoir", header: ["Étape", "Joueurs", "% des inscrits"],
    rows: fun.map((f) => [f.step, f.players, f.pct_of_signups]) }) });
  barChart(b4, fun.map((f) => ({ label: f.step, value: Number(f.players), tip: `${f.step} : ${fmtInt(f.players)} (${fmtNum(f.pct_of_signups, 1)} %)` })),
    { format: (v) => fmtInt(v), labelWidth: 210, legend: "Joueurs ayant franchi l'étape", color: "var(--rarity-rare)" });

  // Premières sessions (migration 0040)
  const b5 = card(g2, "Première session : durée", fs instanceof Error ? {} : {
    note: `${fmtInt(fs.players)} premières sessions sur la période · médiane ${fmtMinutes(fs.median_minutes)} · revenus le lendemain : ${fs.came_back_pct == null ? "—" : `${fmtNum(fs.came_back_pct, 1)} %`}`,
    csv: () => ({ name: "premiere-session-duree", header: ["Durée", "Joueurs", "Revenus le lendemain"], rows: fs.durations.map((d) => [d.bucket, d.players, d.came_back]) }) });
  if (fs instanceof Error) empty(b5, "Demande la migration 0040 sur le serveur.");
  else if (!fs.players) empty(b5, "Aucune première session sur la période.");
  else {
    columnChart(b5, fs.durations.map((d) => ({ label: d.bucket, value: Number(d.players),
      tip: `${d.bucket} : ${fmtInt(d.players)} joueur${d.players > 1 ? "s" : ""}, ${fmtInt(d.came_back)} revenu${d.came_back > 1 ? "s" : ""} le lendemain` })),
      { format: (v) => fmtInt(v), legend: "Joueurs (temps actif de la 1re session)", color: "var(--rarity-epique)" });
    const b6 = card(g2, "Première session : dernier écran avant de partir", { csv: () => ({ name: "premiere-session-dernier-ecran",
      header: ["Écran", "Joueurs"], rows: fs.last_screens.map((s) => [fmtScreen(s.screen), s.players]) }) });
    barChart(b6, fs.last_screens.map((s) => ({ label: fmtScreen(s.screen), value: Number(s.players) })),
      { format: (v) => fmtInt(v), legend: "Joueurs", color: "var(--warn)" });
  }
  view.append(el("p", "muted small", `Joueurs, rétention et entonnoir : tous les inscrits. Le reste : ${p.label}.`));
}
