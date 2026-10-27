// distribution.js — RÈGLES de distribution des boosters, sans aucun affichage :
// tirage des raretés, booster Signature, pity, stock qui se remplit avec le temps.
//
// Ce fichier ne touche ni à la page ni à la sauvegarde : il reçoit un état et
// renvoie un résultat. C'est ce qui permet à la simulation (tools/simulation.js)
// d'utiliser EXACTEMENT le même code que le jeu.
// Toutes les valeurs chiffrées viennent de economy-config.js.

import { RARITIES } from "./data.js?v=29";
import { BOOSTER, DROP_RATES, PITY } from "./economy-config.js?v=29";

const RANK = new Map(RARITIES.map((r, i) => [r.id, i])); // commun 0 → legendaire 3
const IDS = RARITIES.map((r) => r.id);
const REFILL_MS = BOOSTER.refillHours * 3600 * 1000;

// --- Tirage d'une rareté ------------------------------------------------------

/**
 * Bonus de la pity Légendaire « douce » : points de % ajoutés au taux Légendaire
 * de CHAQUE carte, selon le nombre de boosters déjà ouverts d'affilée sans Légendaire.
 * Ex. (softStart 40, softStep 1) : 40 boosters sans → le 41e a +1 point, le 42e +2…
 */
export function legendaryBonus(pityLegendary) {
  const { softStart, softStep } = PITY.legendary;
  return pityLegendary >= softStart ? (pityLegendary - softStart + 1) * softStep : 0;
}

/**
 * Ajoute `bonus` points au taux Légendaire d'une table ; les autres raretés se
 * partagent le reste en gardant leurs proportions entre elles.
 */
export function boostedRates(rates, bonus) {
  if (bonus <= 0) return rates;
  const total = IDS.reduce((sum, id) => sum + (rates[id] || 0), 0);
  const legendary = Math.min(total, (rates.legendaire || 0) + bonus);
  const others = total - (rates.legendaire || 0);
  const scale = others > 0 ? (total - legendary) / others : 0;
  const out = {};
  for (const id of IDS) out[id] = id === "legendaire" ? legendary : (rates[id] || 0) * scale;
  return out;
}

/** Tire une rareté selon une table de taux { commun: 82, rare: 14, … }. */
export function drawRarity(rates, rng = Math.random) {
  const total = IDS.reduce((sum, id) => sum + (rates[id] || 0), 0);
  let roll = rng() * total;
  for (const id of IDS) {
    roll -= rates[id] || 0;
    if (roll < 0) return id;
  }
  return [...IDS].reverse().find((id) => (rates[id] || 0) > 0); // filet de sécurité (arrondis)
}

// --- Tirage d'un booster --------------------------------------------------------

/**
 * Tire un booster complet.
 * - colorways : la liste « à plat » des coloris du catalogue
 * - signature : true pour un booster Signature (la dernière carte suit DROP_RATES.signatureLast)
 * - pityLegendary / pityEpic : boosters déjà ouverts d'affilée sans Légendaire /
 *   sans Épique ou mieux, AVANT celui-ci
 * Renvoie { cards, pityLegendary, pityEpic, softBonus } :
 *   cards = [{ colorwayId, rarity, forced, signature }] dans l'ordre de tirage
 *   (forced = "legendaire" ou "epique" si la carte a été offerte par une pity),
 *   et les compteurs de pity à enregistrer APRÈS ce booster.
 */
export function drawBooster(colorways, { signature = false, pityLegendary = 0, pityEpic = 0 } = {}, rng = Math.random) {
  const count = BOOSTER.cardsPerPack;
  const last = count - 1;
  const softBonus = legendaryBonus(pityLegendary);

  // 1. Les raretés, carte par carte (avec le bonus de pity douce s'il y en a un).
  const rarities = Array.from({ length: count }, (_, i) => {
    const table = signature && i === last ? DROP_RATES.signatureLast : DROP_RATES.standard;
    return drawRarity(boostedRates(table, softBonus), rng);
  });

  // 2. Les garanties. La carte qui reçoit la rareté garantie : la carte Signature
  //    (elle reste le clou du booster), sinon la carte la moins rare.
  const target = () => (signature
    ? last
    : rarities.reduce((low, r, i) => (RANK.get(r) < RANK.get(rarities[low]) ? i : low), 0));
  const hasEpicOrBetter = () => rarities.some((r) => RANK.get(r) >= RANK.get("epique"));
  let forced = null;
  let forcedIndex = -1;
  if (pityLegendary + 1 >= PITY.legendary.guaranteedAt && !rarities.includes("legendaire")) {
    forcedIndex = target();
    rarities[forcedIndex] = forced = "legendaire";
  } else if (pityEpic >= PITY.epic.guaranteedAfter && !hasEpicOrBetter()) {
    forcedIndex = target();
    rarities[forcedIndex] = forced = "epique";
  }

  // 3. Un coloris au hasard parmi tout le catalogue (uniforme) pour chaque carte.
  const cards = rarities.map((rarity, i) => ({
    colorwayId: colorways[Math.floor(rng() * colorways.length)].id,
    rarity,
    forced: i === forcedIndex ? forced : null,
    signature: signature && i === last,
  }));

  // 4. Compteurs de pity : remis à 0 quand la rareté (ou mieux pour l'Épique) est sortie.
  return {
    cards,
    pityLegendary: rarities.includes("legendaire") ? 0 : pityLegendary + 1,
    pityEpic: hasEpicOrBetter() ? 0 : pityEpic + 1,
    softBonus,
  };
}

/** Ordre de révélation : la plus rare en dernier, et la carte Signature TOUJOURS en dernier. */
export function revealOrder(cards) {
  const key = (c) => (c.signature ? 100 : 0) + RANK.get(c.rarity);
  return [...cards].sort((a, b) => key(a) - key(b));
}

// --- Booster Signature : 1 booster gratuit sur N ----------------------------------

/** true si le prochain booster GRATUIT est un Signature (freeOpened = gratuits déjà ouverts). */
export function isSignatureNext(freeOpened) {
  return (freeOpened + 1) % BOOSTER.signatureEvery === 0;
}

/** Nombre de boosters gratuits jusqu'au prochain Signature (1 = le prochain). */
export function freeUntilSignature(freeOpened) {
  return BOOSTER.signatureEvery - (freeOpened % BOOSTER.signatureEvery);
}

// --- Stock gratuit qui se remplit avec le temps ----------------------------------

/**
 * Met le stock à jour selon l'heure réelle.
 * - state : { stock, updatedAt } — updatedAt = début de la recharge en cours (ms)
 * - now : Date.now()
 * Un booster est ajouté toutes les refillHours heures, jusqu'à maxStock.
 * Stock plein : le minuteur est arrêté (il repart quand on ouvre un booster).
 */
export function refillStock({ stock, updatedAt }, now) {
  const max = BOOSTER.maxStock;
  let s = Number.isInteger(stock) ? Math.max(0, Math.min(max, stock)) : BOOSTER.startStock;
  // Pas encore de date, ou horloge du téléphone reculée : la recharge repart de maintenant.
  let t = Number.isFinite(updatedAt) && updatedAt <= now ? updatedAt : now;
  if (s >= max) return { stock: max, updatedAt: now };
  const gained = Math.floor((now - t) / REFILL_MS);
  s = Math.min(max, s + gained);
  t = s >= max ? now : t + gained * REFILL_MS;
  return { stock: s, updatedAt: t };
}

/** Millisecondes avant le prochain booster gratuit (null si le stock est plein). */
export function msUntilNextBooster({ stock, updatedAt }, now) {
  if (stock >= BOOSTER.maxStock) return null;
  return Math.max(0, REFILL_MS - (now - updatedAt));
}
