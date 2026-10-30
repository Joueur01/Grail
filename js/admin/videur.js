// videur.js (admin) — onglet « Videur » : joueurs par niveau, réussite par niveau et par porte,
// essais moyens, boosters donnés, essais par jour.

import { adminVideur } from "../api.js?v=105";
import { columnChart, multiLineChart, barChart } from "./charts.js?v=105";
import { fmtInt, fmtNum, fmtShortDate, fmtDate, DOORS } from "./format.js?v=105";
import { card, grid, empty, dataTable, tiles, delta } from "./ui.js?v=105";

const DOOR_COLORS = { bar: "var(--rarity-rare)", club: "var(--rarity-epique)", vip: "var(--rarity-legendaire)" };
const doorOrder = (d) => ["bar", "club", "vip"].indexOf(d);

export async function renderVideur(view, p) {
  const [v, prev] = await Promise.all([adminVideur(p.from, p.to), adminVideur(p.prev.from, p.prev.to)]);
  const t = v.totals || {}, tp = prev.totals || {};
  const clears = v.clears || [];
  const levelsDone = clears.reduce((a, c) => a + Number(c.levels), 0);
  const rate = (x) => (Number(x.attempts) ? (100 * Number(x.passes)) / Number(x.attempts) : null);
  tiles(view, [
    { label: "Essais", value: fmtInt(t.attempts), sub: `${fmtInt(t.players)} joueurs`, delta: delta(t.attempts, tp.attempts) },
    { label: "Taux de réussite", value: rate(t) === null ? "—" : `${fmtNum(rate(t), 1)} %`, sub: `${fmtInt(t.passes)} entrées`,
      delta: rate(t) !== null && rate(tp) !== null ? delta(rate(t), rate(tp), { points: true }) : null },
    { label: "Niveaux validés", value: fmtInt(levelsDone), sub: "Bar → Club → VIP" },
    { label: "Boosters donnés", value: fmtInt(Number(t.boosters_given) + clears.reduce((a, c) => a + Number(c.bonus_boosters), 0)),
      sub: "par niveau + paliers de 5", delta: delta(t.boosters_given, tp.boosters_given) },
  ]);

  // Joueurs par niveau en cours (aujourd'hui)
  const g = grid(view);
  const levels = v.levels || [];
  const b1 = card(g, "Joueurs par niveau (aujourd'hui)", { csv: () => ({ name: "videur-niveaux", header: ["Niveau en cours", "Joueurs"],
    rows: levels.map((l) => [l.level, l.players]) }) });
  if (!levels.length) empty(b1);
  else columnChart(b1, levels.map((l) => ({ label: `${l.level}`, value: Number(l.players), tip: `Niveau ${l.level} : ${fmtInt(l.players)} joueur${l.players > 1 ? "s" : ""}` })),
    { format: (x) => fmtInt(x), legend: "Joueurs à ce niveau", color: "var(--rarity-legendaire)" });

  // Réussite par niveau et par porte
  const rows = v.by_level_door || [];
  const lv = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);
  const b2 = card(g, "Taux de réussite par niveau et par porte");
  if (!rows.length) empty(b2);
  else {
    const at = (door, level) => rows.find((r) => r.door === door && r.level === level);
    multiLineChart(b2, lv.map((l) => `${l}`), ["bar", "club", "vip"].map((door) => ({
      label: DOORS[door], color: DOOR_COLORS[door], values: lv.map((l) => (at(door, l) ? Number(at(door, l).pass_rate) : null)),
    })), { format: (x) => `${fmtNum(x)} %`, tipLabels: lv.map((l) => `Niveau ${l}`) });
  }
  const b3 = card(view, "Détail par niveau et par porte");
  if (!rows.length) empty(b3);
  else dataTable(b3, { csvName: "videur-niveau-porte", sort: "level", dir: "asc", limit: 15, rows, columns: [
    { key: "level", label: "Niveau", num: true, value: (r) => Number(r.level) * 10 + doorOrder(r.door), render: (r) => fmtInt(r.level), csv: (r) => r.level },
    { key: "door", label: "Porte", value: (r) => doorOrder(r.door), render: (r) => DOORS[r.door] || r.door, csv: (r) => DOORS[r.door] || r.door },
    { key: "attempts", label: "Essais", num: true, value: (r) => Number(r.attempts), render: (r) => fmtInt(r.attempts) },
    { key: "passes", label: "Entrées", num: true, value: (r) => Number(r.passes), render: (r) => fmtInt(r.passes) },
    { key: "pass_rate", label: "Réussite", num: true, value: (r) => Number(r.pass_rate), render: (r) => `${fmtNum(r.pass_rate, 1)} %` },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
    { key: "criteria_pct", label: "Critères respectés", num: true, value: (r) => Number(r.criteria_pct), render: (r) => (r.criteria_pct == null ? "—" : `${fmtNum(r.criteria_pct, 1)} %`) },
  ] });

  // Essais moyens par porte
  const doors = (v.doors || []).slice().sort((a, b) => doorOrder(a.door) - doorOrder(b.door));
  const g2 = grid(view);
  const b4 = card(g2, "Essais moyens avant d'entrer", { note: "Une « porte jouée » = un joueur, un jour, un niveau, une porte. Bloquée = tous les essais ratés.",
    csv: () => ({ name: "videur-portes", header: ["Porte", "Jouées", "Passées", "Bloquées", "Essais moyens"],
      rows: doors.map((d) => [DOORS[d.door], d.played, d.passed, d.blocked, d.avg_tries_when_passed]) }) });
  if (!doors.length) empty(b4);
  else barChart(b4, doors.map((d) => ({ label: DOORS[d.door] || d.door, value: Number(d.avg_tries_when_passed) || 0, color: DOOR_COLORS[d.door],
    tip: `${DOORS[d.door]} : ${fmtNum(d.avg_tries_when_passed, 2)} essais en moyenne · ${fmtInt(d.passed)} passées / ${fmtInt(d.played)} jouées · ${fmtInt(d.blocked)} bloquées` })),
    { format: (x) => fmtNum(x, 2), legend: "Essais pour passer (portes réussies)", labelWidth: 70 });

  // Essais par jour
  const series = v.series || [];
  const b5 = card(g2, "Essais et entrées par jour", { csv: () => ({ name: "videur-par-jour", header: ["Jour", "Essais", "Entrées", "Joueurs"],
    rows: series.map((s) => [s.day, s.attempts, s.passes, s.players]) }) });
  if (!series.length) empty(b5);
  else multiLineChart(b5, series.map((s) => fmtShortDate(s.day)), [
    { label: "Essais", color: "var(--accent)", values: series.map((s) => s.attempts) },
    { label: "Entrées", color: "var(--ok)", values: series.map((s) => s.passes) },
    { label: "Joueurs", color: "var(--warn)", values: series.map((s) => s.players), dashed: true },
  ], { format: (x) => fmtInt(x), tipLabels: series.map((s) => fmtDate(s.day)) });
}
