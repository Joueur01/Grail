// booster.js — tirage des cartes (l'animation de révélation viendra ensuite).

import { RARITIES, CARDS_PER_BOOSTER } from "./data.js";

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

// À faire (tâche « Booster ») : afficher les cartes une par une,
// lueur + vibration pour Épique et Légendaire.
