// booster.js — tirage des cartes, ouverture du paquet et révélation carte par carte.

import { RARITIES, CARDS_PER_BOOSTER, getRarity } from "./data.js?v=10";
import { addCards, canOpenFreeBooster, markFreeBoosterUsed } from "./inventory.js?v=10";

// Délais de l'animation (en millisecondes), faciles à ajuster.
const OPEN_DELAY = 650;    // secousse + ouverture du paquet
const REVEAL_DELAY = 700;  // écart entre deux cartes retournées

// Vibration au moment de la révélation (si le téléphone le permet).
const VIBRATIONS = { epique: [60], legendaire: [80, 60, 160] };

/** Tire une rareté selon les poids définis dans RARITIES. */
export function drawRarity() {
  const total = RARITIES.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RARITIES) {
    roll -= r.weight;
    if (roll < 0) return r.id;
  }
  return RARITIES[0].id; // filet de sécurité (arrondis)
}

/**
 * Tire un booster : pour chaque carte, d'abord la rareté,
 * puis un coloris au hasard parmi tout le catalogue (uniforme pour la bêta).
 * Renvoie [{ colorwayId, rarity }, ...].
 */
export function drawBooster(catalogue) {
  const cards = [];
  for (let i = 0; i < CARDS_PER_BOOSTER; i++) {
    const rarity = drawRarity();
    const list = catalogue.colorways;
    const colorway = list[Math.floor(Math.random() * list.length)];
    cards.push({ colorwayId: colorway.id, rarity });
  }
  return cards;
}

/**
 * Branche tout l'écran Booster.
 * - catalogue : résultat de loadCatalogue()
 * - debug : true = boosters illimités (?debug=1)
 * - onOpened : appelé après chaque ouverture (pour rafraîchir la collection)
 */
export function setupBooster({ catalogue, debug, onOpened }) {
  const closedView = document.getElementById("booster-closed");
  const openedView = document.getElementById("booster-opened");
  const pack = document.getElementById("btn-open-booster");
  const status = document.getElementById("booster-status");
  const result = document.getElementById("booster-result");
  const doneBtn = document.getElementById("btn-booster-done");

  // Met le paquet dans le bon état (disponible ou « reviens demain »).
  function refreshPack() {
    const available = debug || canOpenFreeBooster();
    pack.disabled = !available;
    pack.classList.remove("shake", "opening");
    status.textContent = available
      ? "Touche le booster pour l'ouvrir."
      : "Reviens demain pour un nouveau booster.";
  }

  pack.addEventListener("click", () => {
    if (pack.disabled) return;
    pack.disabled = true; // évite une double ouverture

    // Le tirage est fait et SAUVEGARDÉ tout de suite, avant l'animation :
    // recharger la page pendant la révélation ne permet pas de retirer.
    const cards = drawBooster(catalogue);
    addCards(cards);
    if (!debug) markFreeBoosterUsed();
    onOpened?.();

    pack.classList.add("opening");
    setTimeout(() => showCards(cards), OPEN_DELAY);
  });

  function showCards(cards) {
    closedView.hidden = true;
    openedView.hidden = false;
    doneBtn.hidden = true;
    result.replaceChildren(
      ...cards.map((card) => createCard(catalogue.colorwayById.get(card.colorwayId), card.rarity)));

    // Retourne les cartes une par une.
    const elements = [...result.children];
    elements.forEach((el, i) => {
      setTimeout(() => {
        el.classList.add("revealed");
        const pattern = VIBRATIONS[el.dataset.rarity];
        if (pattern && navigator.vibrate) navigator.vibrate(pattern);
        if (i === elements.length - 1) doneBtn.hidden = false;
      }, REVEAL_DELAY * (i + 1));
    });
  }

  doneBtn.addEventListener("click", () => {
    openedView.hidden = true;
    closedView.hidden = false;
    refreshPack();
  });

  refreshPack();
}

/**
 * Crée l'élément HTML d'une carte (dos + face).
 * La face montre le sprite sur une case claire, la marque, le nom,
 * le coloris et l'étiquette de rareté.
 */
function createCard(colorway, rarityId) {
  const card = document.createElement("div");
  card.className = "card flip-card";
  card.dataset.rarity = rarityId;
  card.dataset.brand = colorway.brand.id;

  // Dos de la carte (visible avant la révélation)
  const back = document.createElement("div");
  back.className = "card-back";
  back.textContent = "?";

  // Face de la carte
  const face = document.createElement("div");
  face.className = "card-face";

  const tile = document.createElement("div");
  tile.className = "sprite-tile";
  const img = document.createElement("img");
  img.className = "pixel";
  img.src = colorway.sprite;
  img.width = 32;
  img.height = 32;
  img.alt = "";
  tile.append(img);

  face.append(
    tile,
    textEl("card-brand", colorway.brand.name),
    textEl("card-name", keepQuotesTogether(colorway.piece.name)),
    textEl("card-colorway", colorway.name),
    textEl("rarity-tag", getRarity(rarityId).name),
  );

  card.append(back, face);
  return card;
}

// Espaces insécables autour des guillemets : « Atelier » ne se coupe jamais
// en laissant un » tout seul sur une ligne.
function keepQuotesTogether(text) {
  return text.replace(/« /g, "«\u00a0").replace(/ »/g, "\u00a0»");
}

function textEl(className, text) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}
