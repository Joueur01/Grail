// wallet.js — affichage du solde de pièces (en haut de toutes les pages),
// bonus de connexion quotidien et petite notification.
//
// Le solde lui-même et la fonction changeCoins() sont dans inventory.js
// (c'est lui qui possède la sauvegarde) ; les montants viennent de economy-config.js.

import { COINS } from "./economy-config.js?v=27";
import { getCoins, onCoinsChange, getLastDailyBonus, claimDailyBonus } from "./inventory.js?v=27";

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
function showToast(text) {
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

export function setupWallet() {
  const box = document.getElementById("coins");
  const amount = document.getElementById("coins-amount");

  function render(balance) {
    amount.textContent = balance.toLocaleString("fr-FR");
    box.setAttribute("aria-label", `Solde : ${balance} pièce${balance > 1 ? "s" : ""}`);
  }
  onCoinsChange((balance) => {
    render(balance);
    box.classList.remove("bump");
    void box.offsetWidth;
    box.classList.add("bump");
  });
  render(getCoins());

  checkDailyBonus();
  // Si le jeu reste ouvert d'un jour à l'autre, on revérifie au retour sur l'onglet.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDailyBonus(); });
}
