// main.js — point d'entrée : navigation entre écrans et initialisation.

import { loadCatalogue } from "./data.js";
import { loadSave, canOpenFreeBooster, totalCards, uniqueCards } from "./inventory.js";
import { initAvatar } from "./avatar.js";

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

// Le paquet de booster est le bouton d'ouverture.
// Pour l'instant il se secoue seulement : le tirage et la révélation
// des cartes seront branchés à la prochaine tâche (booster.js).
function setupBoosterPack(available) {
  const pack = document.getElementById("btn-open-booster");
  pack.disabled = !available;
  pack.addEventListener("click", () => {
    pack.classList.remove("shake");
    void pack.offsetWidth; // force le navigateur à rejouer l'animation
    pack.classList.add("shake");
  });
  pack.addEventListener("animationend", () => pack.classList.remove("shake"));
}

async function start() {
  document.getElementById("debug-badge").hidden = !DEBUG;

  window.addEventListener("hashchange", () => showScreen(currentScreenFromHash()));
  showScreen(currentScreenFromHash());

  loadSave();
  initAvatar(document.getElementById("avatar-canvas"));

  const status = document.getElementById("booster-status");
  try {
    await loadCatalogue(); // en cas d'échec, on passe dans le catch
    const free = DEBUG || canOpenFreeBooster();
    status.textContent = free
      ? "Touche le booster pour l'ouvrir."
      : "Reviens demain pour un nouveau booster.";
    setupBoosterPack(free);
  } catch (err) {
    // Arrive surtout si on ouvre index.html en double-cliquant (file://) :
    // fetch() a besoin d'un serveur (GitHub Pages, ou python3 -m http.server).
    console.error(err);
    status.textContent = "Impossible de charger le catalogue.";
  }

  document.getElementById("collection-summary").textContent =
    `${uniqueCards()} cartes différentes · ${totalCards()} au total`;
}

start();
