// inventory.js — collection du joueur et sauvegarde localStorage.
//
// Format de sauvegarde (version 1) :
// {
//   version: 1,
//   cards: { "<colorwayId>|<rarete>": nombreExemplaires, ... },
//   lastFreeBooster: "AAAA-MM-JJ" | null,   // date locale du dernier booster gratuit
//   equipped: { tete: "<colorwayId>|<rarete>", haut: ..., ... }
// }
// Si le format change un jour, on crée "grail_save_v2" et on migre depuis v1.

const SAVE_KEY = "grail_save_v1";

function emptySave() {
  return { version: 1, cards: {}, lastFreeBooster: null, equipped: {} };
}

// Sauvegarde en mémoire : c'est elle qu'on lit/modifie, puis on persiste.
let save = emptySave();

/** Lit la sauvegarde. Si rien n'existe ou si le stockage est bloqué, on part à vide. */
export function loadSave() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text) {
      const data = JSON.parse(text);
      // On complète avec les valeurs par défaut au cas où un champ manque.
      save = { ...emptySave(), ...data };
    }
  } catch (err) {
    // Navigation privée, stockage plein, JSON corrompu… le jeu continue quand même.
    console.warn("Sauvegarde illisible, on repart de zéro :", err);
    save = emptySave();
  }
  return save;
}

/** Écrit la sauvegarde. Un échec n'empêche pas de jouer (juste pas de persistance). */
export function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (err) {
    console.warn("Impossible d'enregistrer la sauvegarde :", err);
    return false;
  }
}

/** Clé unique d'une carte : un coloris + une rareté. */
export function cardKey(colorwayId, rarityId) {
  return `${colorwayId}|${rarityId}`;
}

/** Ajoute des cartes [{ colorwayId, rarity }] à la collection et sauvegarde. */
export function addCards(cards) {
  for (const { colorwayId, rarity } of cards) {
    const key = cardKey(colorwayId, rarity);
    save.cards[key] = (save.cards[key] || 0) + 1;
  }
  persist();
}

/** Nombre total de cartes possédées (exemplaires compris). */
export function totalCards() {
  return Object.values(save.cards).reduce((sum, n) => sum + n, 0);
}

/** Nombre de cartes différentes possédées. */
export function uniqueCards() {
  return Object.keys(save.cards).length;
}

// --- Booster gratuit quotidien (remise à zéro à minuit, heure locale) ---

/** Date du jour au format AAAA-MM-JJ, en heure LOCALE (pas UTC). */
function todayLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function canOpenFreeBooster() {
  return save.lastFreeBooster !== todayLocal();
}

export function markFreeBoosterUsed() {
  save.lastFreeBooster = todayLocal();
  persist();
}
