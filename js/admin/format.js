// format.js — petits outils du panel admin : création d'éléments, dates, nombres et libellés en français.
// Le panel ne CALCULE rien : il met en forme ce que renvoient les fonctions admin_* du serveur.

/** Crée un élément : el("div", "classe", "texte") ; le texte est toujours inséré comme texte (jamais du HTML). */
export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

const TZ = "Europe/Paris";
const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const numFmt = new Intl.NumberFormat("fr-FR");

/** « 28 oct. 2026 » (accepte "2026-10-28" ou une date ISO complète). */
export function fmtDate(v) {
  if (!v) return "—";
  return dateFmt.format(toDate(v));
}
/** « 28 oct. » */
export function fmtShortDate(v) {
  if (!v) return "—";
  return shortDateFmt.format(toDate(v));
}
/** « 28 oct., 14:05 » (heure de Paris) */
export function fmtDateTime(v) {
  if (!v) return "—";
  return dateTimeFmt.format(toDate(v));
}
/** Un jour "AAAA-MM-JJ" est lu à midi UTC pour ne jamais changer de jour avec le fuseau. */
function toDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(`${v}T12:00:00Z`) : new Date(v);
}

/** 12 345 ; « — » si vide. */
export function fmtNum(v, digits = 0) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
export const fmtInt = (v) => (v === null || v === undefined ? "—" : numFmt.format(Math.round(Number(v))));

/** Minutes → « 45 min » ou « 3 h 20 ». */
export function fmtMinutes(v) {
  if (v === null || v === undefined || v === "") return "—";
  const m = Number(v);
  if (m < 1) return m > 0 ? "< 1 min" : "0 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m - h * 60);
  return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`;
}
export const fmtSeconds = (s) => fmtMinutes(Number(s || 0) / 60);

/** « il y a 3 j », « aujourd'hui », « hier » (à partir d'un nombre de jours). */
export function fmtDaysAgo(n) {
  if (n === null || n === undefined) return "—";
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return "hier";
  return `il y a ${n} j`;
}

export const STATUS = {
  actif: { label: "Actif", cls: "ok" },
  a_risque: { label: "À risque", cls: "warn" },
  perdu: { label: "Perdu", cls: "bad" },
  inconnu: { label: "Inconnu", cls: "" },
};
/** Pastille de statut. */
export function statusPill(status) {
  const s = STATUS[status] || STATUS.inconnu;
  return el("span", `pill ${s.cls}`, s.label);
}

export const PLATFORMS = { ios: "iPhone / iPad", android: "Android", desktop: "Ordinateur" };
export const fmtPlatform = (p) => PLATFORMS[p] || (p ? p : "—");

export const SCREENS = {
  booster: "Booster", collection: "Collection", market: "Market", videur: "Videur", avatar: "Tenue",
  friends: "Amis", profile: "Profil", rules: "Règles", inconnu: "Inconnu",
};
export const fmtScreen = (s) => SCREENS[s] || s || "—";

export const RARITIES = [
  { id: "commun", label: "Commune", color: "var(--rarity-commun)" },
  { id: "rare", label: "Rare", color: "var(--rarity-rare)" },
  { id: "epique", label: "Épique", color: "var(--rarity-epique)" },
  { id: "legendaire", label: "Légendaire", color: "var(--rarity-legendaire)" },
];

export const TX_KINDS = {
  booster: "Booster ouvert", daily_bonus: "Bonus du jour", discard: "Défausse", upgrade: "Roue",
  market_buy: "Achat Market", market_sale: "Vente Market", market_list: "Mise en vente", market_cancel: "Offre retirée",
  signup: "Inscription",
};
export const fmtTxKind = (k) => TX_KINDS[k] || k || "—";

export const DOORS = { bar: "Bar", club: "Club", vip: "VIP" };
