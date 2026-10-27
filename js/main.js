// main.js — point d'entrée : navigation entre écrans et initialisation.
//
// ?v=… sur les imports : même numéro que dans index.html, et le même partout
// (un module importé sous deux adresses différentes serait chargé deux fois).

import { loadCatalogue } from "./data.js?v=27";
import { loadSave, setupCollection } from "./inventory.js?v=27";
import { initAvatar, setupOutfit } from "./avatar.js?v=27";
import { setupBooster } from "./booster.js?v=27";
import { setupShare } from "./share.js?v=27";
import { setupUpgrade } from "./upgrade.js?v=27";
import { setupAtelier, setupViewSwitch } from "./atelier.js?v=27";
import { setupWallet } from "./wallet.js?v=27";
import { BOOSTER } from "./economy-config.js?v=27";

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

async function start() {
  document.getElementById("debug-badge").hidden = !DEBUG;
  blockPinchZoom();

  window.addEventListener("hashchange", () => showScreen(currentScreenFromHash()));
  showScreen(currentScreenFromHash());

  loadSave();
  setupWallet(); // solde en haut de l'écran + bonus de connexion quotidien
  initAvatar(document.getElementById("avatar-canvas"));

  try {
    const catalogue = await loadCatalogue();
    // La tenue prévient le partage à chaque changement (image préparée à l'avance).
    const refreshOutfit = setupOutfit({ catalogue, onChange: setupShare() });
    // Fiche de carte + roue : après une amélioration, collection et tenue sont
    // redessinées (une carte portée a pu être misée).
    const upgrade = setupUpgrade({ catalogue, onChange: () => { refreshCards(); refreshOutfit(); } });
    // Collection (une carte par coloris) : toucher une carte ouvre sa fiche.
    const refreshCollection = setupCollection({ catalogue, onCardTap: (card) => upgrade.openCard(card) });
    // Atelier (par modèle + rareté) : toucher une ligne ouvre la roue, mise pré-remplie.
    const refreshAtelier = setupAtelier({ catalogue, onRowTap: (piece, rarity) => upgrade.openModel(piece, rarity) });
    setupViewSwitch();
    // Collection et Atelier sont redessinés après chaque booster ou amélioration.
    const refreshCards = () => { refreshCollection(); refreshAtelier(); };
    setupBooster({ catalogue, debug: DEBUG || BOOSTER.unlimited, onOpened: refreshCards });
  } catch (err) {
    // Arrive surtout si on ouvre index.html en double-cliquant (file://) :
    // fetch() a besoin d'un serveur (GitHub Pages, ou python3 -m http.server).
    console.error(err);
    document.getElementById("booster-status").textContent = "Impossible de charger le catalogue.";
  }
}

start();
