// main.js — point d'entrée : navigation entre écrans et initialisation.
//
// ?v=… sur les imports : même numéro que dans index.html, et le même partout
// (un module importé sous deux adresses différentes serait chargé deux fois).

import { loadCatalogue } from "./data.js?v=9";
import { loadSave, totalCards, uniqueCards } from "./inventory.js?v=9";
import { initAvatar } from "./avatar.js?v=9";
import { setupBooster } from "./booster.js?v=9";

// ?debug=1 dans l'URL : boosters illimités pendant les tests.
export const DEBUG = new URLSearchParams(location.search).get("debug") === "1";

const SCREENS = ["booster", "collection", "avatar"];

/** Affiche l'écran demandé et met à jour l'onglet actif. */
function showScreen(name) {
  if (!SCREENS.includes(name)) name = SCREENS[0];
  for (const section of document.querySelectorAll(".screen")) {
    section.hidden = section.dataset.screen !== name;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    if (tab.dataset.tab === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
}

// La navigation passe par l'ancre de l'URL (#booster, #collection, #avatar) :
// simple, et le bouton « retour » du téléphone fonctionne tout seul.
function currentScreenFromHash() {
  return location.hash.replace("#", "");
}

// Safari sur iPhone ignore « user-scalable=no » pour le pincement à deux doigts :
// on bloque donc ce geste directement (événement propre à Safari).
function blockPinchZoom() {
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}

/** Met à jour le résumé en haut de l'écran Collection. */
function refreshCollectionSummary() {
  document.getElementById("collection-summary").textContent =
    `${uniqueCards()} cartes différentes · ${totalCards()} au total`;
}

async function start() {
  document.getElementById("debug-badge").hidden = !DEBUG;
  blockPinchZoom();

  window.addEventListener("hashchange", () => showScreen(currentScreenFromHash()));
  showScreen(currentScreenFromHash());

  loadSave();
  initAvatar(document.getElementById("avatar-canvas"));
  refreshCollectionSummary();

  try {
    const catalogue = await loadCatalogue();
    setupBooster({ catalogue, debug: DEBUG, onOpened: refreshCollectionSummary });
  } catch (err) {
    // Arrive surtout si on ouvre index.html en double-cliquant (file://) :
    // fetch() a besoin d'un serveur (GitHub Pages, ou python3 -m http.server).
    console.error(err);
    document.getElementById("booster-status").textContent = "Impossible de charger le catalogue.";
  }
}

start();
