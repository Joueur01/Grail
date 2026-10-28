// analytics.js — mesure d'usage (rétention) : envoie au serveur quelques événements anonymes.
//
// Ce que le serveur ne peut pas deviner tout seul : quand le joueur OUVRE le jeu, combien de temps il y
// reste, quels écrans il regarde, comment il partage, sur quel appareil. Les événements sont groupés
// (un envoi toutes les 15 s au plus) et envoyés par `track_events` (liste blanche côté serveur).
//
// Règles : jamais de bruit pour le joueur (toute erreur est ignorée), aucun contenu personnel (pas d'e-mail,
// pas de pseudo), rien n'est envoyé si le navigateur a activé « Do Not Track ».

import { trackEvents } from "./api.js?v=65";

const PING_SECONDS = 30;        // un « ping » toutes les 30 s tant que le jeu est affiché → temps actif
const IDLE_NEW_SESSION_MS = 30 * 60 * 1000; // plus de 30 min d'absence = nouvelle session
const FLUSH_MS = 15000;
const MAX_QUEUE = 100;

const disabled = navigator.doNotTrack === "1" || window.doNotTrack === "1";

let sessionId = crypto.randomUUID();
let queue = [];
let lastActivity = Date.now();
let started = false;

/** Famille d'appareil : ios, android ou ordinateur (pas d'identifiant précis). */
function platform() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** Ajoute un événement à la file (envoyé dans les secondes qui suivent). */
export function track(name, props = {}) {
  if (disabled || !started) return;
  lastActivity = Date.now();
  if (queue.length < MAX_QUEUE) queue.push({ name, props });
  if (queue.length >= 10) flush();
}

/** Envoie la file au serveur ; en cas d'échec les événements sont simplement perdus. */
async function flush() {
  if (!queue.length) return;
  const batch = queue.slice(0, 25);
  queue = queue.slice(25);
  try {
    await trackEvents(sessionId, batch);
  } catch {
    // Les statistiques ne doivent jamais gêner le jeu.
  }
}

function sessionStart() {
  let ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch { /* ignoré */ }
  track("session_start", {
    platform: platform(),
    standalone: !!(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone),
    w: Math.round(window.innerWidth / 10) * 10,
    h: Math.round(window.innerHeight / 10) * 10,
    dpr: window.devicePixelRatio || 1,
    lang: (navigator.language || "").slice(0, 8),
    tz: new Date().getTimezoneOffset(),
    ref: ref.slice(0, 60),
    entry: location.hash.replace("#", "") || "booster",
  });
}

/** Démarre la mesure (à appeler une fois le joueur connecté). */
export function startAnalytics() {
  if (disabled || started) return;
  started = true;
  sessionStart();

  // Temps actif : un ping toutes les 30 s, seulement si le jeu est affiché.
  setInterval(() => { if (!document.hidden) track("ping", { s: PING_SECONDS }); }, PING_SECONDS * 1000);
  setInterval(flush, FLUSH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { flush(); return; }
    // Retour sur le jeu après une longue absence : nouvelle session.
    if (Date.now() - lastActivity > IDLE_NEW_SESSION_MS) {
      sessionId = crypto.randomUUID();
      sessionStart();
    }
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("error", (e) => track("client_error", { msg: String(e.message || "").slice(0, 120) }));
}
