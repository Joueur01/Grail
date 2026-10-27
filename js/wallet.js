// wallet.js — affichage du solde de pièces (en haut de toutes les pages),
// bonus de connexion quotidien et petite notification.
//
// Le solde lui-même et la fonction changeCoins() sont dans inventory.js
// (c'est lui qui possède la sauvegarde) ; les montants viennent de economy-config.js.

import { COINS } from "./economy-config.js?v=32";
import { getCoins, onCoinsChange, getLastDailyBonus, claimDailyBonus } from "./inventory.js?v=32";

/** Jour calendaire AAAA-MM-JJ dans le fuseau du bonus (heure de Paris). */
function todayForBonus() {
  try {
    // La locale « en-CA » écrit la date au format AAAA-MM-JJ.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: COINS.dailyBonusTimeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10); // fuseau inconnu : jour UTC, mieux que rien
  }
}

let toastTimer = null;

/** Notification discrète sous l'en-tête, qui disparaît seule. */
export function showToast(text) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = text;
  toast.hidden = false;
  toast.classList.remove("show");
  void toast.offsetWidth; // relance l'animation
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; toast.classList.remove("show"); }, 3600);
}

/** Verse le bonus du jour s'il n'a pas encore été pris (une fois par jour à Paris). */
function checkDailyBonus() {
  const today = todayForBonus();
  if (getLastDailyBonus() === today) return;
  if (claimDailyBonus(today, COINS.dailyLoginBonus)) {
    showToast(`+${COINS.dailyLoginBonus} pièces · bonus du jour`);
  }
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Animation de pièces qui volent vers le solde, en haut de l'écran.
 * - from : élément (ou rectangle) d'où partent les pièces
 * - amount : montant gagné (plus il est grand, plus il y a de pièces, 3 à 12)
 */
export function flyCoins(from, amount) {
  const target = document.getElementById("coins");
  if (!target || reducedMotion()) return;
  const a = from.getBoundingClientRect ? from.getBoundingClientRect() : from;
  const b = target.getBoundingClientRect();
  const startX = a.left + a.width / 2;
  const startY = a.top + a.height / 2;
  const n = Math.min(12, 3 + Math.floor(amount / 20));
  for (let i = 0; i < n; i++) {
    const coin = document.createElement("span");
    coin.className = "fly-coin";
    coin.style.left = `${startX - 9 + (Math.random() - 0.5) * 50}px`;
    coin.style.top = `${startY - 9 + (Math.random() - 0.5) * 20}px`;
    document.body.append(coin);
    const dx = b.left + b.width / 2 - 9 - parseFloat(coin.style.left);
    const dy = b.top + b.height / 2 - 9 - parseFloat(coin.style.top);
    const anim = coin.animate([
      { transform: "translate(0, 0) scale(0.6)", opacity: 0 },
      { transform: "translate(0, -18px) scale(1)", opacity: 1, offset: 0.2 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 1 },
    ], { duration: 750, delay: i * 70, easing: "cubic-bezier(.5,0,.8,.6)", fill: "both" });
    anim.onfinish = () => coin.remove();
  }
}

export function setupWallet() {
  const box = document.getElementById("coins");
  const amount = document.getElementById("coins-amount");
  let shown = getCoins();     // nombre affiché (pendant le « compte » il est en retard sur le solde)
  let timers = [];

  function show(n) {
    shown = n;
    amount.textContent = n.toLocaleString("fr-FR");
  }

  /** Fait défiler le nombre affiché de from à to, après un petit délai (le temps que les pièces arrivent). */
  function countUp(from, to) {
    timers.forEach(clearTimeout);
    timers = [];
    if (reducedMotion()) { show(to); return; }
    const DELAY = 600, DURATION = 700;
    const start = performance.now() + DELAY;
    const step = () => {
      const t = Math.min(1, Math.max(0, (performance.now() - start) / DURATION));
      show(Math.round(from + (to - from) * t));
      if (t < 1) timers.push(setTimeout(step, 30));
    };
    timers.push(setTimeout(() => {
      box.classList.remove("bump");
      void box.offsetWidth;
      box.classList.add("bump");
      step();
    }, DELAY));
    timers.push(setTimeout(() => show(to), DELAY + DURATION + 150)); // filet de sécurité
  }

  onCoinsChange((balance) => {
    box.setAttribute("aria-label", `Solde : ${balance} pièce${balance > 1 ? "s" : ""}`);
    if (balance > shown) countUp(shown, balance);
    else { timers.forEach(clearTimeout); show(balance); }
  });
  show(getCoins());
  box.setAttribute("aria-label", `Solde : ${shown} pièce${shown > 1 ? "s" : ""}`);

  checkDailyBonus();
  // Si le jeu reste ouvert d'un jour à l'autre, on revérifie au retour sur l'onglet.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDailyBonus(); });
}
