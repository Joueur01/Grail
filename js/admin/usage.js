// usage.js (admin) — onglet « Usage » : écrans les plus vus et temps par écran, dernier écran avant de
// partir, heures et jours de connexion, appareils / plateformes / appli installée, erreurs récentes.

import { adminScreens, adminDevices, adminHours, adminErrors } from "../api.js?v=105";
import { barChart, columnChart, stackedBars } from "./charts.js?v=105";
import { el, fmtInt, fmtMinutes, fmtScreen, fmtPlatform, fmtDateTime } from "./format.js?v=105";
import { card, grid, empty, dataTable } from "./ui.js?v=105";

const WEEKDAYS = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export async function renderUsage(view, p) {
  const [sc, dev, hours, err] = await Promise.all([adminScreens(p.from, p.to), adminDevices(), adminHours(), adminErrors(p.from, p.to)]);

  // Écrans
  const screens = sc.screens || [];
  const g = grid(view);
  const b1 = card(g, "Temps par écran", { note: "Mesuré par le « ping » de 30 s (écran affiché, jeu au premier plan).",
    csv: () => ({ name: "temps-par-ecran", header: ["Écran", "Minutes", "Joueurs", "Vues"], rows: screens.map((s) => [fmtScreen(s.screen), s.minutes, s.players, s.views]) }) });
  if (!screens.length) empty(b1);
  else barChart(b1, screens.map((s) => ({ label: fmtScreen(s.screen), value: Number(s.minutes),
    tip: `${fmtScreen(s.screen)} : ${fmtMinutes(s.minutes)} · ${fmtInt(s.players)} joueurs · ${fmtInt(s.views)} vues` })),
    { format: (v) => fmtMinutes(v), legend: "Minutes passées sur l'écran", labelWidth: 100 });
  const b2 = card(g, "Écrans les plus vus");
  if (!screens.length) empty(b2);
  else dataTable(b2, { csvName: "ecrans", sort: "views", rows: screens, columns: [
    { key: "screen", label: "Écran", value: (r) => fmtScreen(r.screen) },
    { key: "views", label: "Vues", num: true, value: (r) => Number(r.views), render: (r) => fmtInt(r.views) },
    { key: "minutes", label: "Temps", num: true, value: (r) => Number(r.minutes), render: (r) => fmtMinutes(r.minutes), csv: (r) => r.minutes },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
  ] });
  const last = sc.last_screen_before_leaving || [];
  const b3 = card(g, "Dernier écran avant de partir (toutes les sessions)", { csv: () => ({ name: "dernier-ecran", header: ["Écran", "Sessions"],
    rows: last.map((s) => [fmtScreen(s.screen), s.sessions]) }) });
  if (!last.length) empty(b3);
  else barChart(b3, last.map((s) => ({ label: fmtScreen(s.screen), value: Number(s.sessions) })),
    { format: (v) => fmtInt(v), legend: "Sessions terminées sur cet écran", color: "var(--warn)", labelWidth: 100 });

  // Heures et jours
  const byHour = Array.from({ length: 24 }, (_, h) => (hours.by_hour || []).find((x) => x.hour === h) || { hour: h, sessions: 0, players: 0 });
  const b4 = card(g, "Heures de connexion (heure de Paris, depuis le début)", { csv: () => ({ name: "heures", header: ["Heure", "Sessions", "Joueurs"],
    rows: byHour.map((x) => [x.hour, x.sessions, x.players]) }) });
  columnChart(b4, byHour.map((x) => ({ label: `${x.hour} h`, value: Number(x.sessions), tip: `${x.hour} h – ${x.hour + 1} h : ${fmtInt(x.sessions)} sessions, ${fmtInt(x.players)} joueurs` })),
    { format: (v) => fmtInt(v), legend: "Sessions commencées", color: "var(--rarity-rare)" });
  const byDay = Array.from({ length: 7 }, (_, i) => (hours.by_weekday || []).find((x) => x.weekday === i + 1) || { weekday: i + 1, sessions: 0, players: 0 });
  const b5 = card(g, "Jours de la semaine (depuis le début)", { csv: () => ({ name: "jours-semaine", header: ["Jour", "Sessions", "Joueurs"],
    rows: byDay.map((x) => [WEEKDAYS[x.weekday], x.sessions, x.players]) }) });
  columnChart(b5, byDay.map((x) => ({ label: WEEKDAYS[x.weekday], value: Number(x.sessions), tip: `${WEEKDAYS[x.weekday]} : ${fmtInt(x.sessions)} sessions, ${fmtInt(x.players)} joueurs` })),
    { format: (v) => fmtInt(v), legend: "Sessions commencées", color: "var(--rarity-rare)" });

  // Appareils
  const plats = dev.platforms || [];
  const details = dev.details || [];
  const g2 = grid(view);
  const b6 = card(g2, "Plateformes (depuis le début)", { csv: () => ({ name: "plateformes", header: ["Plateforme", "Sessions", "Joueurs"],
    rows: plats.map((x) => [fmtPlatform(x.platform), x.sessions, x.players]) }) });
  if (!plats.length) empty(b6);
  else barChart(b6, plats.map((x) => ({ label: fmtPlatform(x.platform), value: Number(x.sessions), tip: `${fmtPlatform(x.platform)} : ${fmtInt(x.sessions)} sessions, ${fmtInt(x.players)} joueurs` })),
    { format: (v) => fmtInt(v), legend: "Sessions", color: "var(--ok)", labelWidth: 120 });
  const inst = details.reduce((a, d) => { a[d.installed_app ? "yes" : "no"] += Number(d.sessions); return a; }, { yes: 0, no: 0 });
  const widths = {};
  for (const d of details) widths[d.screen_width] = (widths[d.screen_width] || 0) + Number(d.sessions);
  const b7 = card(g2, "Appli installée et taille d'écran (90 derniers jours)");
  if (!details.length) empty(b7);
  else {
    stackedBars(b7, [
      { label: "Appli", segments: [{ label: "Installée (écran d'accueil)", value: inst.yes, color: "var(--ok)" }, { label: "Navigateur", value: inst.no, color: "var(--muted)" }] },
      { label: "Écran", segments: Object.entries(widths).map(([k, v], i) => ({ label: k, value: v, color: ["var(--rarity-rare)", "var(--rarity-epique)", "var(--warn)"][i % 3] })) },
    ], { format: (v) => fmtInt(v), labelWidth: 70 });
    dataTable(b7, { csvName: "appareils", sort: "sessions", rows: details, columns: [
      { key: "platform", label: "Plateforme", value: (r) => fmtPlatform(r.platform) },
      { key: "installed_app", label: "Appli", value: (r) => (r.installed_app ? "installée" : "navigateur") },
      { key: "screen_width", label: "Largeur" },
      { key: "sessions", label: "Sessions", num: true, value: (r) => Number(r.sessions), render: (r) => fmtInt(r.sessions) },
      { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
    ] });
  }

  // Erreurs
  const b8 = card(view, "Erreurs affichées aux joueurs, par message");
  if (!(err.by_message || []).length) empty(b8, "Aucune erreur sur la période.");
  else dataTable(b8, { csvName: "erreurs", sort: "count", limit: 10, rows: err.by_message, columns: [
    { key: "msg", label: "Message", render: (r) => el("span", "wrap", r.msg || "—") },
    { key: "count", label: "Nombre", num: true, value: (r) => Number(r.count), render: (r) => fmtInt(r.count) },
    { key: "players", label: "Joueurs", num: true, value: (r) => Number(r.players), render: (r) => fmtInt(r.players) },
    { key: "last_at", label: "Dernière", render: (r) => fmtDateTime(r.last_at) },
  ] });
  const b9 = card(view, "Erreurs récentes");
  if (!(err.recent || []).length) empty(b9, "Aucune erreur sur la période.");
  else dataTable(b9, { csvName: "erreurs-recentes", sort: "at", limit: 10, rows: err.recent, columns: [
    { key: "at", label: "Date", render: (r) => fmtDateTime(r.at) },
    { key: "pseudo", label: "Joueur", render: (r) => { const a = el("a", "", r.pseudo || "Sans pseudo"); a.href = `#player/${r.user_id}`; return a; },
      value: (r) => r.pseudo || "", csv: (r) => r.pseudo || r.user_id },
    { key: "msg", label: "Message", render: (r) => el("span", "wrap", r.msg || "—") },
  ] });
}
