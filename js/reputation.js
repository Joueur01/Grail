// reputation.js — bouton rond « profil » en haut de toutes les pages, entouré d'un anneau doré et d'une pastille.
//
// Depuis la migration 0032, il montre le NIVEAU DU VIDEUR (tour de niveaux) : la pastille = niveau en cours,
// l'anneau = portes déjà passées de ce niveau (0 à 3 : Bar, Club, VIP). Sans la 0032, il montre encore
// l'ancienne réputation (Flow, migration 0021) ; sans la 0021, c'est un bouton simple.
// Tout vient du SERVEUR (profil relu par inventory.js) : ce fichier affiche seulement, il ne calcule aucun niveau.

import { getReputation, getVideurLevel, onStateChange } from "./inventory.js?v=104";
import { showToast } from "./wallet.js?v=104";
import { playSound, vibrate } from "./effects.js?v=104";

const DOORS_PER_LEVEL = 3; // Bar, Club, VIP : affichage de l'anneau seulement

/** Ce qu'affiche le bouton : { kind, level, progress (0 à 1), label } ou null. */
function current() {
  const v = getVideurLevel();
  if (v) {
    return {
      kind: "videur", level: v.level, progress: v.doors / DOORS_PER_LEVEL,
      label: `Mon profil · Videur niveau ${v.level}, ${v.doors} porte${v.doors > 1 ? "s" : ""} sur ${DOORS_PER_LEVEL} passée${v.doors > 1 ? "s" : ""}`,
    };
  }
  const r = getReputation();
  if (r) {
    return {
      kind: "reputation", level: r.level, progress: r.flow / r.next,
      label: `Mon profil · réputation niveau ${r.level}, ${r.flow} sur ${r.next} Flow pour le niveau suivant`,
    };
  }
  return null;
}

/** Branche le bouton profil. À appeler une fois le jeu démarré (l'état du joueur est déjà lu). */
export function setupReputation() {
  const button = document.querySelector(".profile-button");
  const badge = document.getElementById("rep-badge");
  if (!button || !badge) return;
  let shown = null; // dernier affichage, pour repérer une montée de niveau

  function render() {
    const now = current();
    if (!now) { // aucune migration : bouton simple, comme avant
      button.classList.remove("has-rep");
      button.setAttribute("aria-label", "Mon profil");
      shown = null;
      return;
    }
    button.classList.add("has-rep");
    button.style.setProperty("--rep", String(Math.max(0, Math.min(1, now.progress))));
    badge.textContent = String(now.level);
    button.setAttribute("aria-label", now.label);
    // Le niveau vient de monter (après une relecture du profil) : notification, son, pulsation du bouton.
    if (shown && shown.kind === now.kind && now.level > shown.level) {
      showToast(now.kind === "videur" ? `Niveau ${now.level} atteint !` : `Réputation : niveau ${now.level} atteint !`);
      playSound("epique");
      vibrate?.([40, 60, 40]);
      button.classList.remove("rep-up");
      void button.offsetWidth; // relance l'animation
      button.classList.add("rep-up");
    }
    shown = now;
  }

  render();
  onStateChange(render);
}
