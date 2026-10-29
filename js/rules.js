// rules.js — page « Règles du jeu » : taux de drop et spécificités techniques, en sections repliables.
//
// Ouverte depuis le profil (#rules) ou par un lien « ? » d'un écran (#rules/boosters, #rules/roue,
// #rules/market, #rules/album, #rules/videur, #rules/reputation) : la section demandée s'ouvre toute seule.
// ⚠️ Les valeurs affichées viennent de js/economy-config.js (copie d'AFFICHAGE : le serveur décide).
// Si le serveur change une valeur, la mettre à jour dans ce fichier-là, pas ici.
// Les règles cachées du Videur (Club, VIP) ne sont volontairement PAS décrites.

import { RARITIES } from "./data.js?v=89";
import {
  DROP_RATES, BOOSTER, PITY, UPGRADE, DISCARD_VALUES, MARKET, SHOP, FRIENDS, saleTax, saleNet,
  DAILY_BONUS, REPUTATION, SHOWCASE, VIDEUR_INFO,
} from "./economy-config.js?v=89";

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n) => String(n).replace(".", ",");               // 3.5 → « 3,5 »
const rarityName = (id) => RARITIES.find((r) => r.id === id).name;

/** Pastille colorée du nom d'une rareté (la couleur vient de [data-rarity] dans style.css). */
function chip(id) {
  const c = el("span", "rules-chip", rarityName(id));
  c.dataset.rarity = id;
  return c;
}

/** Tableau à deux colonnes : un libellé (texte ou élément) et une valeur. */
function table(rows) {
  const t = el("div", "rules-table");
  for (const [label, value] of rows) {
    const row = el("div", "rules-row");
    const left = el("span", "rules-label");
    left.append(typeof label === "string" ? document.createTextNode(label) : label);
    row.append(left, el("span", "rules-value", value));
    t.append(row);
  }
  return t;
}

const para = (text) => el("p", "rules-text", text);
const sub = (text) => el("h4", "rules-sub", text);
function bullets(items) {
  const ul = el("ul", "rules-list");
  for (const text of items) ul.append(el("li", "", text));
  return ul;
}

/** Une section repliable (<details>). */
function section(id, title, summary, nodes) {
  const d = el("details", "rules-section");
  d.id = `rules-${id}`;
  const head = el("summary", "rules-summary");
  const names = el("span", "rules-summary-names");
  names.append(el("span", "rules-summary-title", title), el("span", "rules-summary-sub", summary));
  head.append(names, el("span", "rules-chevron", "›"));
  const body = el("div", "rules-body");
  body.append(...nodes);
  d.append(head, body);
  return d;
}

/** Construit toutes les sections. catalogue : pour annoncer le nombre de coloris. */
function buildSections(catalogue) {
  const std = DROP_RATES.standard, last = DROP_RATES.signatureLast;
  const colorways = catalogue.colorways.length;

  const boosters = section("boosters", "Boosters et taux de drop", "Chances, Booster Signature, garanties", [
    para(`Un booster contient ${BOOSTER.cardsPerPack} cartes. Pour chaque carte, la rareté est tirée par le serveur, puis un coloris au hasard parmi les ${colorways}.`),
    sub("Chances par carte"),
    table(RARITIES.map((r) => [chip(r.id), `${fmt(std[r.id])} %`])),
    sub("Booster Signature"),
    para(`1 booster gratuit sur ${BOOSTER.signatureEvery} est un Booster Signature (paquet doré). Sa dernière carte, toujours révélée en dernier, est au moins Rare :`),
    table(RARITIES.filter((r) => last[r.id] > 0).map((r) => [chip(r.id), `${fmt(last[r.id])} %`])),
    sub("Garanties"),
    bullets([
      `Légendaire : après ${PITY.legendary.softStart} boosters d'affilée sans Légendaire, sa chance monte de +1 point à chaque booster ; le ${PITY.legendary.guaranteedAt}e en contient forcément une.`,
      `Épique : après ${PITY.epic.guaranteedAfter} boosters d'affilée sans Épique ou mieux, le suivant en contient une.`,
      "Les compteurs comptent tous les boosters et repartent à 0 dès que la rareté sort. Tu les vois sous le paquet.",
    ]),
    sub("Stock gratuit"),
    bullets([
      `1 booster est généré toutes les ${BOOSTER.refillHours} h, jusqu'à ${BOOSTER.maxStock} en stock. Tu peux fermer le jeu : le stock se remplit sur le serveur.`,
      "Les boosters ne s'achètent pas et le minuteur ne s'accélère pas : aucun argent réel dans le jeu.",
      "Le Videur offre des boosters en plus (voir « Le Videur »). Ils suivent les mêmes taux et les mêmes garanties.",
      "Les cartes sont enregistrées dès que tu déchires le paquet : recharger la page ne permet pas de retirer.",
    ]),
  ]);

  const roue = section("roue", "Roue d'amélioration", "Miser des cartes pour monter en rareté", [
    para(`Tu mises de ${UPGRADE.minCards} à ${UPGRADE.maxCards} cartes du même modèle et de la même rareté (les coloris peuvent différer). En cas de réussite, tu obtiens 1 carte du même modèle, une rareté au-dessus.`),
    sub("Chance de réussite"),
    table(Array.from({ length: UPGRADE.maxCards - UPGRADE.minCards + 1 }, (_, i) => {
      const n = UPGRADE.minCards + i;
      return [`${n} carte${n > 1 ? "s" : ""} misée${n > 1 ? "s" : ""}`, `${Math.min(UPGRADE.maxChance, n * UPGRADE.chancePerCard)} %`];
    })),
    bullets([
      `Chaque carte misée ajoute ${UPGRADE.chancePerCard} points de chance : ${UPGRADE.maxCards} cartes = ${UPGRADE.maxChance} %, réussite garantie.`,
      "Le coloris obtenu est le même si toutes les cartes misées ont le même coloris, sinon un coloris au hasard parmi ceux du modèle.",
      "Les cartes misées sont perdues dans tous les cas, réussite ou échec.",
      "Une Légendaire ne s'améliore pas. Une carte verrouillée ne peut pas être misée.",
      "Le tirage est fait par le serveur : recharger la page ne permet pas de rejouer.",
    ]),
  ]);

  const defausse = section("defausse", "Défausse", "Échanger des cartes contre des pièces", [
    para("Défausser une carte la retire de ta collection contre des pièces."),
    table(RARITIES.map((r) => [chip(r.id), `${DISCARD_VALUES[r.id]} pièces`])),
    bullets([
      "Les cartes verrouillées sont protégées : elles ne peuvent être ni défaussées ni misées à la roue.",
      "La défausse est tout ou rien : si une seule carte de la sélection pose problème, rien n'est défaussé.",
      "Une carte défaussée ne revient pas.",
    ]),
  ]);

  const market = section("market", "Market et pièces", "Prix fixes, taxe de vente, pièces", [
    para("Le Market est un échange entre joueurs, en pièces uniquement. Les pièces sont virtuelles : elles ne s'achètent pas avec de l'argent et ne se convertissent jamais en euros."),
    sub("Comment gagner des pièces"),
    bullets([
      `Bonus de connexion : +${DAILY_BONUS.coins} pièces une fois par jour (jour de Paris), et +${DAILY_BONUS.signup} pièces pour le tout premier.`,
      "Défausse de cartes (voir plus haut).",
      "Vente de cartes au Market.",
    ]),
    sub("Règles du Market"),
    bullets([
      "Prix fixes, pas d'enchères. Le Market est un catalogue : choisis un modèle, un coloris puis une rareté pour voir toutes les offres de la carte, de la moins chère à la plus chère. Tu ne vois jamais qui vend : seulement « Joueur » ou « Boutique Grail ».",
      `${MARKET.maxListings} ventes en même temps au maximum ; prix de ${MARKET.minPrice} à ${MARKET.maxPrice.toLocaleString("fr-FR")} pièces.`,
      "Une carte en vente quitte ta collection ; si tu retires l'offre, elle revient.",
      "Une carte verrouillée ne peut pas être vendue. Si le prix a changé au moment d'acheter, l'achat est refusé.",
    ]),
    sub(`Taxe de ${MARKET.saleTaxPercent} % sur les ventes`),
    para(`Payée par le vendeur, arrondie à l'entier supérieur (1 pièce minimum). L'acheteur paie le prix affiché. Exemple : une carte vendue ${40} pièces te rapporte ${saleNet(40)} pièces (taxe de ${saleTax(40)}).`),
    sub("Prix conseillés (repères)"),
    table(RARITIES.map((r) => [chip(r.id), `${MARKET.referencePrice[r.id]} pièces`])),
    sub(SHOP.name),
    para(`Chaque jour à ${SHOP.refreshHour} h (heure de Paris), la ${SHOP.name} propose une nouvelle sélection de cartes à prix fixe. Ses offres sont mélangées à celles des joueurs et portent le badge « Boutique ».`),
    table(RARITIES.map((r) => [chip(r.id), `${fmt(SHOP.rarities[r.id].chance)} % de chance par coloris · ${SHOP.rarities[r.id].price} pièces`])),
    bullets([
      "Les pièces dépensées à la boutique disparaissent du jeu : aucune taxe, rien n'est versé à un joueur.",
      "Les offres de la boutique ne comptent pas dans tes 10 ventes. Les offres non vendues sont retirées à chaque renouvellement ; celles des joueurs ne sont jamais touchées.",
      "Le stock d'une carte est limité (1 à 4 exemplaires pour une Commune, 1 pour une Épique ou une Légendaire).",
    ]),
  ]);

  const videur = section("videur", "Le Videur", "3 portes par jour, essais, Flow, boosters", [
    para("Chaque jour, un videur juge la tenue que tu portes (seulement les pièces que tu possèdes encore). Il y a 3 portes, à passer dans l'ordre : Bar, Club, VIP."),
    table(VIDEUR_INFO.doors.map((d) => [d.name, `${d.tries} essais · +${d.flow} Flow · +${d.boosters} booster${d.boosters > 1 ? "s" : ""}`])),
    bullets([
      "Au Bar, les règles du jour sont visibles et tu as un aperçu gratuit de ta tenue.",
      "Au Club et au VIP, les règles sont cachées : à toi de les deviner grâce aux indices du videur.",
      "Quand la porte est réussie ou que tes essais sont épuisés, la règle du jour est révélée.",
      "Une porte réussie rapporte du Flow et des boosters, une seule fois par jour. Les essais sont comptés par le serveur.",
      "Les boosters offerts s'ajoutent à ton stock sans la limite de " + BOOSTER.maxStock + " et s'ouvrent après tes boosters gratuits : rien n'est perdu.",
      `Série : +1 Flow de bonus par jour d'affilée avec au moins le Bar réussi, jusqu'à +${VIDEUR_INFO.streakBonusCap}.`,
    ]),
  ]);

  // Les premiers niveaux seulement, puis une ligne « ainsi de suite » : la progression continue (pas de niveau maximum).
  const levels = [0, 1, 2, 3, 4].map((n) => [`Niveau ${n} → ${n + 1}`, `${REPUTATION.costStep * (n + 1)} Flow`]);
  const reputation = section("reputation", "Réputation et Flow", "Niveaux de réputation", [
    para("Le Flow que tu gagnes au Videur fait monter ta réputation. Tu commences niveau 0. Le niveau est visible sur l'anneau autour de ton bouton profil."),
    table(levels),
    el("p", "rules-more", `… et ainsi de suite : ${REPUTATION.costStep} Flow de plus à chaque niveau.`),
    bullets([
      "Pour l'instant, il n'y a pas de niveau maximum : la progression continue, avec un coût qui augmente à chaque niveau.",
      `Chaque niveau coûte ${REPUTATION.costStep} Flow de plus que le précédent.`,
      "À chaque passage de niveau, le Flow correspondant est dépensé : la barre repart avec ce qu'il te reste.",
      "Le Flow ne s'achète pas, ne s'échange pas et ne se convertit pas en pièces.",
    ]),
  ]);

  const album = section("album", "Album et Ultimes", "Une vraie collection, définitive", [
    para("L'album est l'endroit où tu ranges tes cartes pour de bon. Il commence vide, et tu y places les cartes que tu veux."),
    bullets([
      `Une case par coloris et par rareté : ${colorways} coloris × ${RARITIES.length} raretés = ${colorways * RARITIES.length} cases. Chaque case ne se remplit qu'une seule fois.`,
      "C'est définitif : une carte placée dans l'album ne peut jamais en être retirée. Elle quitte ta collection et n'est plus utilisable (ni portée, ni vendue, ni misée à la roue, ni défaussée, ni en vitrine).",
      "Une carte placée compte toujours dans ta progression « X / 300 ».",
      "Si tu as plusieurs exemplaires d'une carte, un seul part dans l'album : les autres restent à toi.",
    ]),
    sub("L'Ultime"),
    bullets([
      "Quand un modèle est complet dans l'album (tous ses coloris, dans toutes les raretés), tu obtiens son Ultime.",
      "L'Ultime est une carte unique de rareté « Ultime », au-dessus de Légendaire : un seul par modèle.",
      "Il ne se vend pas, ne s'échange pas, ne se mise pas et ne se défausse pas.",
      "En revanche, il se porte comme n'importe quelle pièce et se met en vitrine, y compris sur l'image de ta tenue partagée.",
      "Son dessin est le même pour tous les joueurs : noir profond, reflets irisés.",
    ]),
  ]);

  const profil = section("profil", "Profil, tenue et amis", "Vitrine, pseudo, partage", [
    bullets([
      `Vitrine : tu choisis jusqu'à ${SHOWCASE.max} cartes à montrer à tes amis. Une carte vendue, défaussée ou misée en disparaît toute seule.`,
      "Tenue : une pièce par emplacement. Une carte dont le dernier exemplaire part de ta collection est retirée de ta tenue.",
      "Avatar : Garçon ou Fille, avec la même silhouette pour tous ; tes amis voient celui que tu as choisi.",
      `Pseudo : 3 à 16 caractères (lettres, chiffres ou _). Un seul changement tous les ${FRIENDS.pseudoChangeDays} jours.`,
      "Ton pseudo est visible par tes amis et sur les tenues que tu partages ; il n'apparaît dans aucune liste publique.",
      "Partager ta tenue crée un lien secret (une copie figée de ta tenue) et une image. Si tu changes de tenue ou d'avatar, un nouveau lien est créé.",
    ]),
  ]);

  return [boosters, roue, defausse, market, album, videur, reputation, profil];
}

/** Branche la page #rules : construit les sections, ouvre celle demandée par l'adresse (#rules/market…). */
export function setupRules({ catalogue }) {
  const list = document.getElementById("rules-list");
  list.replaceChildren(...buildSections(catalogue));

  /** Ouvre la section demandée par l'adresse et s'y rend ; sans section, tout reste fermé et on remonte. */
  function openFromHash() {
    const [screen, wanted] = location.hash.replace("#", "").split("/");
    if (screen !== "rules") return;
    const target = wanted ? document.getElementById(`rules-${wanted}`) : null;
    for (const d of list.querySelectorAll("details")) d.open = d === target;
    requestAnimationFrame(() => {
      if (target) target.scrollIntoView({ block: "start" });
      else document.querySelector("main").scrollTo(0, 0);
    });
  }

  document.getElementById("rules-back").addEventListener("click", () => {
    // Revient à l'écran d'où l'on vient ; à défaut (page ouverte directement), au profil.
    if (history.length > 1) history.back();
    else location.hash = "#profile";
  });
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
}
