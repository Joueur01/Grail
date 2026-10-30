// badges.js — pastilles de notification de la barre du bas.
//
// ⚠️ Ce fichier ne décide rien : il AFFICHE ce que dit le serveur (via l'état déjà lu par inventory.js et
// get_videur_tower, ou get_videur_night sans la migration 0032). Trois pastilles en tout :
//   - Booster : le nombre de boosters à ouvrir (au moins 1), sur la pastille centrale ;
//   - Videur  : un point tant que le joueur n'a joué AUCUNE porte aujourd'hui (jour de Paris, décidé par le serveur)
//               et qu'il peut encore jouer (tour : ni bloqué, ni limite du jour atteinte) ;
//   - Amis    : le nombre de demandes d'ami reçues, sur la pastille ronde du haut (c'est friends.js qui la remplit).

import { getBoosterState, onStateChange, refreshState } from "./inventory.js?v=102";
import { getVideurNight, getVideurTower } from "./api.js?v=102";

const VIDEUR_RECHECK_MS = 5 * 60 * 1000; // le jour change à minuit (Paris) : on relit de temps en temps

/**
 * Pastille Videur : visible tant qu'aucune porte n'a été jouée aujourd'hui.
 * `night` = réponse de get_videur_tower (tour, migration 0032) ou de get_videur_night (ancien Videur).
 */
export function updateVideurBadge(night) {
  const badge = document.getElementById("badge-videur");
  if (!badge) return;
  if (typeof night?.played_today === "boolean") { // tour de niveaux
    badge.hidden = night.played_today || night.status !== "play";
    return;
  }
  const doors = night?.doors;
  // Sans les compteurs d'essais (serveur trop ancien), on n'affiche rien plutôt qu'une fausse alerte.
  const known = Array.isArray(doors) && doors.length > 0 && doors.every((d) => typeof d.tries === "number" && typeof d.tries_left === "number");
  const played = known && doors.some((d) => d.tries_left < d.tries);
  badge.hidden = !known || played;
}

export function setupBadges() {
  const boosterBadge = document.getElementById("badge-booster");

  /** Pastille Booster : le stock lu sur le serveur (copie en mémoire d'inventory.js). */
  function renderBooster() {
    const { stock, bonus, canOpen } = getBoosterState();
    boosterBadge.hidden = !canOpen;
    boosterBadge.textContent = canOpen ? String(stock + bonus) : "";
  }
  onStateChange(renderBooster);
  renderBooster();

  // Un booster est ajouté par le SERVEUR à l'échéance du minuteur : quand elle est passée, on relit l'état,
  // même si l'écran Booster n'est pas affiché (la pastille doit apparaître d'elle-même).
  let refetching = false;
  setInterval(async () => {
    if (refetching || document.hidden) return;
    if (getBoosterState().nextInMs !== 0) return;
    refetching = true;
    try {
      await refreshState();
    } catch {
      await new Promise((r) => setTimeout(r, 10000)); // serveur injoignable : on réessaie plus tard
    } finally {
      refetching = false;
    }
  }, 2000);

  async function checkVideur() {
    try {
      updateVideurBadge(await getVideurTower());
    } catch {
      // Tour absente (migration 0032 pas exécutée) : ancien Videur ; sinon serveur injoignable : pas de pastille.
      try { updateVideurBadge(await getVideurNight()); } catch { /* rien à afficher */ }
    }
  }
  checkVideur();
  setInterval(() => { if (!document.hidden) checkVideur(); }, VIDEUR_RECHECK_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVideur(); });
}
