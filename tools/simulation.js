// simulation.js — simulation HORS JEU de la distribution des boosters.
//
// Utilise exactement les règles du jeu (js/distribution.js) et les valeurs de
// js/economy-config.js, ouvre 100 000 boosters gratuits à la suite (1 Signature
// sur 4, pity Légendaire et Épique) et affiche les taux obtenus.
//
// Deux façons de la lancer :
//   - dans un terminal, à la racine du dépôt :  node tools/simulation.js [nombre]
//     (Node.js 22 ou plus récent, gratuit) ;
//   - dans le navigateur : ouvrir tools/simulation.html (sur GitHub Pages :
//     https://joueur01.github.io/Grail/tools/simulation.html, ou via un serveur local).

import { RARITIES } from "../js/data.js?v=28";
import { BOOSTER, DROP_RATES, PITY } from "../js/economy-config.js?v=28";
import { drawBooster, drawRarity, revealOrder, isSignatureNext } from "../js/distribution.js?v=28";

const IDS = RARITIES.map((r) => r.id);
const NAMES = Object.fromEntries(RARITIES.map((r) => [r.id, r.name]));
// Le coloris n'influence pas la rareté : 75 coloris factices suffisent.
const COLORWAYS = Array.from({ length: 75 }, (_, i) => ({ id: `coloris_${i}` }));

const pct = (n, total, digits = 2) => `${((n / total) * 100).toFixed(digits)} %`;
const pad = (text, width) => String(text).padEnd(width);
const emptyCount = () => Object.fromEntries(IDS.map((id) => [id, 0]));

/** Ligne de tableau : une colonne par rareté, « obtenu (attendu) ». */
function rateLine(label, counts, expected) {
  const total = IDS.reduce((sum, id) => sum + counts[id], 0);
  const cells = IDS.map((id) => {
    const got = pct(counts[id], total);
    return expected ? `${got} (${expected[id]} %)` : got;
  });
  return `${pad(label, 28)} ${cells.map((c) => pad(c, 20)).join("")}  [${total} cartes]`;
}

/**
 * Lance la simulation et renvoie le rapport (texte).
 * - boosters : nombre de boosters gratuits à ouvrir
 */
export function simulate(boosters = 100000) {
  const out = [];
  const log = (line = "") => out.push(line);
  const errors = [];
  const header = `${pad("", 28)} ${IDS.map((id) => pad(NAMES[id], 20)).join("")}`;

  // --- 1. Taux bruts des tables (sans pity) ---------------------------------------
  const RAW = 1000000;
  log(`1. TAUX BRUTS DES TABLES (${RAW.toLocaleString("fr-FR")} tirages chacune, sans pity) — obtenu (config)`);
  log(header);
  for (const [name, table] of Object.entries(DROP_RATES)) {
    const counts = emptyCount();
    for (let i = 0; i < RAW; i++) counts[drawRarity(table)]++;
    log(rateLine(name, counts, table));
  }
  log();

  // --- 2. Système complet ------------------------------------------------------------
  let freeOpened = 0;
  let pityLegendary = 0;
  let pityEpic = 0;
  const all = emptyCount();
  const standardCards = emptyCount();      // cartes des boosters standard
  const signatureFirst = emptyCount();     // cartes 1-2 des Signature
  const signatureLast = emptyCount();      // carte 3 des Signature
  let signatureCount = 0;
  let withLegendary = 0;
  let withEpicOrBetter = 0;
  let hardLegendary = 0;      // Légendaire forcée au 60e booster
  let softLegendary = 0;      // boosters avec Légendaire pendant la pity douce
  let softBoosters = 0;       // boosters ouverts pendant la pity douce
  let forcedEpic = 0;         // Épique forcée après 16 boosters sans
  let maxNoLegendary = 0;
  let maxNoEpic = 0;
  const gaps = [];            // boosters entre deux Légendaires (celui qui la donne compris)

  for (let b = 0; b < boosters; b++) {
    const signature = isSignatureNext(freeOpened);
    freeOpened++;
    if (signature) signatureCount++;
    const before = { legendary: pityLegendary, epic: pityEpic };
    const result = drawBooster(COLORWAYS, { signature, pityLegendary, pityEpic });

    for (const [i, card] of result.cards.entries()) {
      all[card.rarity]++;
      if (!signature) standardCards[card.rarity]++;
      else if (i === BOOSTER.cardsPerPack - 1) signatureLast[card.rarity]++;
      else signatureFirst[card.rarity]++;
      if (card.forced === "legendaire") hardLegendary++;
      if (card.forced === "epique") forcedEpic++;
    }
    const hasLegendary = result.cards.some((c) => c.rarity === "legendaire");
    if (hasLegendary) {
      withLegendary++;
      gaps.push(before.legendary + 1);
    }
    if (result.pityEpic === 0) withEpicOrBetter++;
    if (result.softBonus > 0) {
      softBoosters++;
      if (hasLegendary && !result.cards.some((c) => c.forced === "legendaire")) softLegendary++;
    }

    // Vérifications des règles
    if (signature) {
      const order = revealOrder(result.cards);
      if (!order[order.length - 1].signature) errors.push(`booster ${b + 1} : la carte Signature n'est pas en dernier`);
      if (result.cards[BOOSTER.cardsPerPack - 1].rarity === "commun") errors.push(`booster ${b + 1} : carte Signature Commune`);
    }
    maxNoLegendary = Math.max(maxNoLegendary, result.pityLegendary);
    maxNoEpic = Math.max(maxNoEpic, result.pityEpic);
    pityLegendary = result.pityLegendary;
    pityEpic = result.pityEpic;
  }

  // Taux attendus SANS pity, pour comparer (mélange des tables selon les cartes).
  const perPack = BOOSTER.cardsPerPack;
  const sigShare = 1 / BOOSTER.signatureEvery;
  const lastShare = sigShare / perPack; // part des cartes tirées avec la table Signature
  const expectedNoPity = Object.fromEntries(IDS.map((id) => [id,
    ((1 - lastShare) * DROP_RATES.standard[id] + lastShare * DROP_RATES.signatureLast[id]).toFixed(2)]));

  log(`2. SYSTÈME COMPLET : ${boosters.toLocaleString("fr-FR")} boosters gratuits à la suite — obtenu (attendu sans pity)`);
  log(`   Signature : ${signatureCount} boosters (${pct(signatureCount, boosters)}, attendu ${(sigShare * 100).toFixed(2)} %)`);
  log(header);
  log(rateLine("Toutes les cartes", all, expectedNoPity));
  log(rateLine("Boosters standard", standardCards, DROP_RATES.standard));
  log(rateLine("Signature, cartes 1-2", signatureFirst, DROP_RATES.standard));
  log(rateLine("Signature, carte 3", signatureLast, DROP_RATES.signatureLast));
  log("   (les taux obtenus sont un peu au-dessus des taux de base à cause des pity : c'est normal)");
  log();
  log("3. PAR BOOSTER");
  log(`   Avec au moins 1 Légendaire        : ${pct(withLegendary, boosters)}  (≈ 1 booster sur ${(boosters / withLegendary).toFixed(1)})`);
  log(`   Avec au moins 1 Épique ou mieux   : ${pct(withEpicOrBetter, boosters)}  (≈ 1 booster sur ${(boosters / withEpicOrBetter).toFixed(1)})`);
  const sorted = [...gaps].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  log(`   Boosters entre deux Légendaires   : moyenne ${(gaps.reduce((s, g) => s + g, 0) / gaps.length).toFixed(1)} · médiane ${at(0.5)} · 90 % en ${at(0.9)} ou moins · max ${sorted[sorted.length - 1]}`);
  log();
  log("4. PITY");
  log(`   Légendaire douce (à partir de ${PITY.legendary.softStart} sans, +${PITY.legendary.softStep} pt/carte/booster) :`);
  log(`     ${softBoosters} boosters ouverts dans la zone (${pct(softBoosters, boosters)}), ${softLegendary} boosters avec Légendaire dans cette zone (taux en hausse)`);
  log(`   Légendaire garantie (${PITY.legendary.guaranteedAt}e booster) : ${hardLegendary} fois (${pct(hardLegendary, boosters, 3)} des boosters, ${pct(hardLegendary, withLegendary)} des boosters à Légendaire)`);
  log(`   Épique garantie (après ${PITY.epic.guaranteedAfter} sans)     : ${forcedEpic} fois (${pct(forcedEpic, boosters)} des boosters)`);
  log(`   Plus longue série sans Légendaire : ${maxNoLegendary} (doit être < ${PITY.legendary.guaranteedAt})`);
  log(`   Plus longue série sans Épique+    : ${maxNoEpic} (doit être ≤ ${PITY.epic.guaranteedAfter})`);
  log();

  // --- 5. Contrôles automatiques -------------------------------------------------------
  if (maxNoLegendary >= PITY.legendary.guaranteedAt) errors.push(`série sans Légendaire trop longue (${maxNoLegendary})`);
  if (maxNoEpic > PITY.epic.guaranteedAfter) errors.push(`série sans Épique trop longue (${maxNoEpic})`);
  for (const [name, table] of Object.entries(DROP_RATES)) {
    const sum = IDS.reduce((s, id) => s + (table[id] || 0), 0);
    if (Math.abs(sum - 100) > 1e-9) errors.push(`la table ${name} fait ${sum} % au lieu de 100 %`);
  }
  if (signatureLast.commun > 0) errors.push("une carte Signature est Commune");
  log(errors.length ? `5. ❌ PROBLÈMES (${errors.length}) :\n   ${errors.slice(0, 10).join("\n   ")}` : "5. ✅ Tous les contrôles sont bons.");
  return out.join("\n");
}

// Lancé dans un terminal (Node.js) : on affiche le rapport.
if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("simulation.js")) {
  const n = Number(process.argv[2]) || 100000;
  console.log(simulate(n));
}
