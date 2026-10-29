// reputation.js — la RÉPUTATION du joueur (le Flow est devenu une réputation) : bouton rond « profil »
// en haut de toutes les pages, entouré d'un anneau qui se remplit vers le niveau suivant, avec le
// niveau dans une pastille. Tout vient du SERVEUR (migration 0021) : niveau, Flow accumulé et Flow demandé.
// Ce fichier affiche seulement ; il ne calcule aucun niveau.

import { getReputation, onReputationChange } from "./inventory.js?v=90";
import { showToast } from "./wallet.js?v=90";
import { playSound, vibrate } from "./effects.js?v=90";

/** Branche le bouton profil. À appeler une fois le jeu démarré (l'état du joueur est déjà lu). */
export function setupReputation() {
  const button = document.querySelector(".profile-button");
  const badge = document.getElementById("rep-badge");
  if (!button || !badge) return;

  function render(reputation) {
    if (!reputation) { // migration non exécutée : bouton simple, comme avant
      button.classList.remove("has-rep");
      button.setAttribute("aria-label", "Mon profil");
      return;
    }
    button.classList.add("has-rep");
    button.style.setProperty("--rep", String(Math.max(0, Math.min(1, reputation.flow / reputation.next))));
    badge.textContent = String(reputation.level);
    button.setAttribute("aria-label",
      `Mon profil · réputation niveau ${reputation.level}, ${reputation.flow} sur ${reputation.next} Flow pour le niveau suivant`);
  }

  render(getReputation());
  onReputationChange((reputation, levelBefore) => {
    render(reputation);
    if (levelBefore !== null && reputation) { // le niveau vient de monter
      showToast(`Réputation : niveau ${reputation.level} atteint !`);
      playSound("epique");
      vibrate?.([40, 60, 40]);
      button.classList.remove("rep-up");
      void button.offsetWidth; // relance l'animation
      button.classList.add("rep-up");
    }
  });
}
