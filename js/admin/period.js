// period.js — période commune aux onglets du panel admin, gardée dans l'ancre de l'URL :
//   #economy?periode=7     7 derniers jours (aujourd'hui compris)
//   #economy?periode=30    30 derniers jours (par défaut)
//   #economy?periode=tout  depuis le premier jour du jeu (1re inscription)
//   #economy?du=2026-10-01&au=2026-10-15   dates au choix (jours de Paris inclus)
// La période précédente (même durée, juste avant) sert aux variations des tuiles.

import { el, fmtDate } from "./format.js?v=105";

/** Aujourd'hui, jour de Paris, "AAAA-MM-JJ". */
export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}
/** Ajoute n jours à "AAAA-MM-JJ". */
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

let firstDay = null; // premier jour du jeu (admin_first_day), donné par main.js
export const setFirstDay = (d) => { firstDay = d; };

/** Période lue dans la partie « ?… » de l'ancre. → { key, from, to, label, query, prev: { from, to } } */
export function readPeriod(query) {
  const q = new URLSearchParams(query || "");
  const t = today();
  let p;
  if (isDay(q.get("du")) && isDay(q.get("au")) && q.get("du") <= q.get("au")) {
    p = { key: "dates", from: q.get("du"), to: q.get("au") };
    p.label = `du ${fmtDate(p.from)} au ${fmtDate(p.to)}`;
    p.query = `du=${p.from}&au=${p.to}`;
  } else if (q.get("periode") === "tout") {
    const from = firstDay && firstDay <= t ? firstDay : addDays(t, -89);
    p = { key: "tout", from: days(from, t) > 400 ? addDays(t, -400) : from, to: t, label: "depuis le début", query: "periode=tout" };
  } else {
    const n = q.get("periode") === "7" ? 7 : 30;
    p = { key: String(n), from: addDays(t, -(n - 1)), to: t, label: `${n} derniers jours`, query: `periode=${n}` };
  }
  const n = days(p.from, p.to);
  p.days = n;
  p.prev = { from: addDays(p.from, -n), to: addDays(p.from, -1) };
  return p;
}

/** Barre de choix de la période ; `go(query)` change l'ancre (donc l'historique : le bouton retour marche). */
export function periodBar(p, go) {
  const bar = el("div", "period-bar");
  const opts = [["7", "7 j"], ["30", "30 j"], ["tout", "Tout"]];
  for (const [key, label] of opts) {
    const b = el("button", "chip", label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(p.key === key));
    b.addEventListener("click", () => go(`periode=${key}`));
    bar.append(b);
  }
  // Dates au choix : deux champs date natifs (calendrier de l'iPad) + « OK ».
  const custom = el("div", "period-custom");
  const from = el("input", "field field-date");
  const to = el("input", "field field-date");
  from.type = to.type = "date";
  from.value = p.from;
  to.value = p.to;
  from.max = to.max = today();
  from.setAttribute("aria-label", "Du");
  to.setAttribute("aria-label", "Au");
  const ok = el("button", `chip${p.key === "dates" ? " chip-on" : ""}`, "OK");
  ok.type = "button";
  ok.addEventListener("click", () => {
    if (isDay(from.value) && isDay(to.value) && from.value <= to.value) go(`du=${from.value}&au=${to.value}`);
  });
  custom.append(from, el("span", "muted", "→"), to, ok);
  bar.append(custom, el("span", "muted small period-label", `${p.label} · ${p.days} j`));
  return bar;
}
