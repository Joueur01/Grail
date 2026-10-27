// booster.js — tirage des cartes, ouverture du paquet et révélation carte par carte.
//
// Déroulé :
//   1. on DÉCHIRE le paquet : un toucher (il tremble puis se déchire tout seul),
//      ou en glissant le doigt sur le paquet (la bande du haut se déchire petit à petit) ;
//   2. les 3 cartes sortent face cachée, la plus rare toujours en DERNIER (suspense) ;
//      le dos des cartes Rare et plus brille déjà un peu de leur couleur ;
//   3. on touche chaque carte pour la retourner. Plus elle est rare, plus la
//      révélation est marquée (Épique et Légendaire : plein écran avec rayons).

import { RARITIES, CARDS_PER_BOOSTER, getRarity } from "./data.js?v=17";
import { addCards, canOpenFreeBooster, markFreeBoosterUsed, getOwnedCards, cardKey } from "./inventory.js?v=17";
import { createCardFace, createCardShell } from "./cards.js?v=17";
import { playSound, vibrate, burst } from "./effects.js?v=17";

// Durées (en millisecondes), faciles à ajuster.
const SHAKE_TIME = 350;   // secousse avant la déchirure (ouverture au toucher)
const TEAR_TIME = 550;    // la bande s'envole
const DEAL_DELAY = 140;   // écart entre deux cartes distribuées
const FLIP_TIME = 450;    // retournement d'une carte (identique au CSS)
// Temps de « charge » (la carte tremble et brille) avant de se retourner.
const CHARGE_TIME = { commun: 0, rare: 0, epique: 650, legendaire: 1100 };
const VIBRATIONS = { rare: [20], epique: [60, 40, 60], legendaire: [80, 60, 80, 60, 220] };

// Glisser le doigt sur au moins cette part de la largeur du paquet = déchirure.
const SWIPE_TO_TEAR = 0.45;

// La déchirure suit la ligne pointillée du dessin (rangée 6 sur 48) :
// la bande du haut garde les rangées 0 à 6, plus une rangée sur deux blocs
// de 2 pixels → un bord en dents de scie, pixel par pixel.
const TEAR_ROW = 7;

/** Contour (clip-path) en dents de scie : bande du haut (top = true) ou reste du paquet. */
function tearClip(top) {
  const pct = (v, total) => `${(v / total) * 100}%`;
  const points = [];
  for (let x = 0; x < 32; x += 2) {
    const y = (x / 2) % 2 === 0 ? TEAR_ROW : TEAR_ROW + 1; // une dent sur deux
    points.push(`${pct(x, 32)} ${pct(y, 48)}`, `${pct(x + 2, 32)} ${pct(y, 48)}`);
  }
  return top
    ? `polygon(0% 0%, 100% 0%, ${points.reverse().join(", ")})`
    : `polygon(${points.join(", ")}, 100% 100%, 0% 100%)`;
}

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
  const packTop = pack.querySelector(".pack-top");
  const packBody = pack.querySelector(".pack-body");
  const status = document.getElementById("booster-status");
  const result = document.getElementById("booster-result");
  const hint = document.getElementById("reveal-hint");
  const doneBtn = document.getElementById("btn-booster-done");
  const overlay = document.getElementById("reveal-overlay");

  packTop.style.clipPath = tearClip(true);
  packBody.style.clipPath = tearClip(false);

  let opening = false;    // une ouverture est en cours
  let overlayOpen = false;

  // Met le paquet dans le bon état (disponible ou « reviens demain »).
  function refreshPack() {
    const available = debug || canOpenFreeBooster();
    pack.disabled = !available;
    opening = false;
    pack.classList.remove("shake", "torn", "dragging");
    packTop.style.transform = "";
    status.textContent = available
      ? "Glisse le doigt sur le booster pour le déchirer (ou touche-le)."
      : "Reviens demain pour un nouveau booster.";
  }

  // --- 1. Déchirer le paquet -------------------------------------------------

  /** Lance l'ouverture : tirage + sauvegarde immédiats, puis animation. */
  function open(withShake) {
    if (opening || pack.disabled) return;
    opening = true;

    // Cartes déjà possédées AVANT ce booster (pour le badge « NOUVEAU »).
    const owned = new Set(getOwnedCards().map((c) => cardKey(c.colorwayId, c.rarity)));
    const cards = drawBooster(catalogue).map((card) => {
      const key = cardKey(card.colorwayId, card.rarity);
      const isNew = !owned.has(key);
      owned.add(key); // la même carte deux fois dans un booster : la 2e n'est pas « nouvelle »
      return { ...card, isNew };
    });

    // Le tirage est SAUVEGARDÉ tout de suite, avant l'animation :
    // recharger la page pendant la révélation ne permet pas de retirer.
    addCards(cards);
    if (!debug) markFreeBoosterUsed();
    onOpened?.();

    const tear = () => {
      playSound("tear");
      vibrate([15]);
      pack.classList.remove("shake", "dragging");
      pack.classList.add("torn");
      packTop.style.transform = "";
      setTimeout(() => showCards(cards), TEAR_TIME);
    };
    if (withShake) {
      pack.classList.add("shake");
      setTimeout(tear, SHAKE_TIME);
    } else {
      tear();
    }
  }

  // Glisser pour déchirer : la bande se soulève en suivant le doigt.
  let dragStartX = null;
  pack.addEventListener("pointerdown", (e) => {
    if (pack.disabled || opening) return;
    dragStartX = e.clientX;
    pack.setPointerCapture(e.pointerId);
  });
  pack.addEventListener("pointermove", (e) => {
    if (dragStartX === null) return;
    const progress = Math.min(1, Math.abs(e.clientX - dragStartX) / pack.offsetWidth);
    if (progress > 0.05) {
      pack.classList.add("dragging");
      // La bande pivote depuis son coin gauche, de plus en plus.
      packTop.style.transform = `rotate(${-12 * progress}deg) translateY(${-6 * progress}px)`;
    }
    if (progress >= SWIPE_TO_TEAR) {
      dragStartX = null;
      open(false);
    }
  });
  const endDrag = (e) => {
    if (dragStartX === null) return;
    const moved = Math.abs(e.clientX - dragStartX) / pack.offsetWidth;
    dragStartX = null;
    if (moved < 0.05) {
      open(true); // simple toucher : secousse puis déchirure
    } else {
      // Pas assez glissé : la bande retombe.
      pack.classList.remove("dragging");
      packTop.style.transform = "";
    }
  };
  pack.addEventListener("pointerup", endDrag);
  // Geste interrompu par le téléphone : la bande retombe, rien ne s'ouvre.
  pack.addEventListener("pointercancel", () => {
    dragStartX = null;
    pack.classList.remove("dragging");
    packTop.style.transform = "";
  });
  // Clavier (Entrée / Espace) : un « clic » sans pointeur.
  pack.addEventListener("click", (e) => { if (e.detail === 0) open(true); });

  // --- 2. Distribuer les cartes face cachée ----------------------------------

  function showCards(cards) {
    closedView.hidden = true;
    openedView.hidden = false;
    doneBtn.hidden = true;
    hint.hidden = false;
    hint.textContent = "Touche une carte pour la retourner.";

    // La plus rare en dernier : on garde le meilleur pour la fin.
    const rank = new Map(RARITIES.map((r, i) => [r.id, i]));
    const sorted = [...cards].sort((a, b) => rank.get(a.rarity) - rank.get(b.rarity));

    result.replaceChildren(...sorted.map((card, i) => {
      const el = createCard(catalogue.colorwayById.get(card.colorwayId), card);
      el.style.animationDelay = `${i * DEAL_DELAY}ms`;
      el.addEventListener("click", () => reveal(el));
      return el;
    }));
  }

  // --- 3. Retourner une carte ------------------------------------------------

  function reveal(el) {
    if (el.classList.contains("revealed") || el.classList.contains("charging") || overlayOpen) return;
    const rarity = el.dataset.rarity;
    const charge = CHARGE_TIME[rarity];

    // Épique / Légendaire : la carte tremble et brille de plus en plus avant de se retourner.
    if (charge) {
      el.classList.add("charging");
      playSound("charge");
      vibrate([10]);
    }
    setTimeout(() => {
      el.classList.remove("charging");
      el.classList.add("revealed");
      playSound("flip");
      setTimeout(() => celebrate(el, rarity), FLIP_TIME * 0.6);
    }, charge);
  }

  /** L'effet après le retournement, selon la rareté. */
  function celebrate(el, rarity) {
    const color = getComputedStyle(el).getPropertyValue("--rarity-color").trim();
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;

    if (rarity === "rare") {
      el.classList.add("shine");
      burst(cx, cy, color, 12, 90);
      playSound("rare");
      vibrate(VIBRATIONS.rare);
    }
    if (rarity === "epique" || rarity === "legendaire") {
      showOverlay(el, rarity, color);
      return; // la suite se fait quand on ferme le plein écran
    }
    afterReveal();
  }

  /** Plein écran de révélation (Épique et Légendaire). */
  function showOverlay(el, rarity, color) {
    overlayOpen = true;
    const card = catalogue.colorwayById.get(el.dataset.colorway);
    overlay.dataset.rarity = rarity;
    // Espace insécable avant « ! » : il ne part jamais seul à la ligne.
    document.getElementById("reveal-title").textContent = `${getRarity(rarity).name}\u00a0!`;
    const big = createCardShell(card, rarity);
    big.classList.add("owned");
    big.append(createCardFace(card, rarity));
    if (el.dataset.new === "1") big.append(newBadge());
    document.getElementById("reveal-card").replaceChildren(big);
    overlay.hidden = false;

    playSound(rarity);
    vibrate(VIBRATIONS[rarity]);
    // Plusieurs gerbes de particules depuis le centre de l'écran.
    const waves = rarity === "legendaire" ? 3 : 1;
    for (let i = 0; i < waves; i++) {
      setTimeout(() => burst(innerWidth / 2, innerHeight / 2, color, rarity === "legendaire" ? 36 : 24, 220), 150 + i * 350);
    }
  }

  overlay.addEventListener("click", () => {
    if (!overlayOpen) return;
    overlay.hidden = true;
    overlayOpen = false;
    afterReveal();
  });

  /** Quand toutes les cartes sont retournées : bouton « Continuer ». */
  function afterReveal() {
    const left = result.querySelectorAll(".flip-card:not(.revealed)").length;
    if (left === 0) {
      hint.hidden = true;
      doneBtn.hidden = false;
    } else {
      hint.textContent = left === 1 ? "Plus qu'une carte…" : "Touche une carte pour la retourner.";
    }
  }

  doneBtn.addEventListener("click", () => {
    openedView.hidden = true;
    closedView.hidden = false;
    refreshPack();
  });

  refreshPack();
}

/** Badge « NOUVEAU » (carte jamais obtenue avant). */
function newBadge() {
  const badge = document.createElement("span");
  badge.className = "new-badge";
  badge.textContent = "Nouveau";
  return badge;
}

/** Carte qui se retourne : un dos « ? » puis la face (voir cards.js). */
function createCard(colorway, card) {
  const el = createCardShell(colorway, card.rarity);
  el.classList.add("flip-card", "deal");
  el.dataset.colorway = colorway.id;
  el.dataset.new = card.isNew ? "1" : "0";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", "Retourner la carte");

  const back = document.createElement("div");
  back.className = "card-back";
  back.textContent = "?";

  const face = createCardFace(colorway, card.rarity);
  if (card.isNew) face.append(newBadge());
  el.append(back, face);
  // Une fois arrivée, la carte perd sa classe « deal » : sinon l'animation de
  // distribution se rejouerait quand une autre animation (charge…) se termine.
  el.addEventListener("animationend", (e) => {
    if (e.animationName === "deal-in") el.classList.remove("deal");
  });
  return el;
}
