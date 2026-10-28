// booster.js — ouverture du paquet et révélation carte par carte.
//
// ⚠️ Le TIRAGE se fait sur le serveur (open_booster) : ce fichier ne décide d'aucune carte, il
// affiche le résultat reçu, dans l'ordre de révélation donné par le serveur.
//
// Tout se fait en GLISSANT le doigt (ou la souris), comme avec un vrai booster :
//   1. glisser sur le paquet le DÉCHIRE (un simple toucher ne l'ouvre pas) ;
//   2. les 3 cartes forment une pile ; on en voit UNE à la fois, la plus rare en dernier ;
//   3. sur une carte face cachée :
//        - glisser la RETOURNE directement ;
//        - rester appuyé fait monter son AURA palier par palier (gris → bleu → violet
//          → or) jusqu'à sa rareté : on devine ce qui arrive avant de la retourner ;
//   4. une fois retournée, glisser à nouveau passe à la carte SUIVANTE ;
//   5. après la 3e : récapitulatif des 3 cartes + « Continuer ».
// Effets de révélation, du plus discret au plus fort : Rare (reflet + particules),
// Épique (éclair violet, gerbe de particules, titre), Légendaire (plein écran).

import { RARITIES, getRarity } from "./data.js?v=78";
import { BOOSTER, DROP_RATES, PITY } from "./economy-config.js?v=78";
import { getPity, getPityEpic, isTutorialDone, markTutorialDone, getBoosterState, refreshState } from "./inventory.js?v=78";
import { openBooster } from "./api.js?v=78";
import { reportError } from "./wallet.js?v=78";
import { createCardFace, createCardShell } from "./cards.js?v=78";
import { playSound, vibrate, burst } from "./effects.js?v=78";
import { attachGesture } from "./gestures.js?v=78";

// Durées (en millisecondes), faciles à ajuster.
const TEAR_TIME = 550;    // la bande s'envole, le paquet descend
const FLIP_TIME = 450;    // retournement d'une carte (identique au CSS)
const FLY_TIME = 320;     // la carte part sur le côté (identique au CSS)
const AURA_STEP = 650;    // durée d'un palier d'aura quand on reste appuyé
const VIBRATIONS = { rare: [20], epique: [60, 40, 60], legendaire: [80, 60, 80, 60, 220] };

// Glisser sur au moins cette part de la largeur de l'élément = geste validé.
const SWIPE_TO_TEAR = 0.45;
const SWIPE_CARD = 0.3;

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

/** Durée lisible pour le minuteur : « 5:12:08 » (heures:minutes:secondes). */
function formatDuration(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const sec = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

// Rareté minimale de la carte Signature (« Rare ou mieux »), pour l'AFFICHAGE (valeur du serveur).
const SIGNATURE_MIN = RARITIES.find((r) => DROP_RATES.signatureLast[r.id] > 0);

/**
 * Branche tout l'écran Booster.
 * - catalogue : résultat de loadCatalogue() (pour dessiner les cartes)
 * - onOpened : appelé après chaque ouverture, une fois l'état relu (pour rafraîchir la collection)
 */
export function setupBooster({ catalogue, onOpened }) {
  const closedView = document.getElementById("booster-closed");
  const openedView = document.getElementById("booster-opened");
  const pack = document.getElementById("btn-open-booster");
  const packTop = pack.querySelector(".pack-top");
  const packBody = pack.querySelector(".pack-body");
  const status = document.getElementById("booster-status");
  const counter = document.getElementById("reveal-counter");
  const stage = document.getElementById("reveal-stage");
  const hint = document.getElementById("reveal-hint");
  const recap = document.getElementById("booster-result");
  const doneBtn = document.getElementById("btn-booster-done");
  const overlay = document.getElementById("reveal-overlay");
  const pityGauge = document.getElementById("pity");
  const pityCount = document.getElementById("pity-count");
  const pityFill = document.getElementById("pity-fill");
  const pityEpicGauge = document.getElementById("pity-epic");
  const pityEpicCount = document.getElementById("pity-epic-count");
  const pityEpicFill = document.getElementById("pity-epic-fill");
  const eyebrow = document.getElementById("booster-eyebrow");
  const stockPips = document.getElementById("stock-pips");
  const stockTimer = document.getElementById("stock-timer");
  const stockSignature = document.getElementById("stock-signature");

  packTop.style.clipPath = tearClip(true);
  packBody.style.clipPath = tearClip(false);

  const rank = new Map(RARITIES.map((r, i) => [r.id, i]));
  let cards = [];      // les 3 cartes du booster en cours (la plus rare en dernier)
  let index = 0;       // carte affichée
  let current = null;  // { el, card, revealed, aura, timer }
  let tutorial = false; // tuto en cours (tant que le 1er booster n'est pas terminé)

  // --- Tutoriel du 1er booster : un « doigt » qui glisse, avec une étiquette ---

  /** Crée l'animation « doigt qui glisse » avec son texte. */
  function swipeHint(text) {
    const el = document.createElement("div");
    el.className = "swipe-hint";
    el.innerHTML = '<span class="swipe-track"><span class="swipe-dot"></span></span>';
    const label = document.createElement("span");
    label.className = "swipe-label";
    label.textContent = text;
    el.append(label);
    return el;
  }

  /** Affiche (ou retire, si text est vide) le tuto par-dessus un élément. */
  function showTutorial(container, text) {
    container.querySelector(":scope > .swipe-hint")?.remove();
    if (text) container.append(swipeHint(text));
  }

  let packCanOpen = null; // le paquet affiché est-il ouvrable ? (pour savoir quand le redessiner)

  // Met le paquet dans le bon état (disponible ou non, standard ou Signature), d'après le serveur.
  function refreshPack() {
    const state = getBoosterState();
    const available = state.canOpen;
    packCanOpen = available;
    pack.disabled = !available;
    pack.dataset.locked = "0";
    pack.classList.remove("nudge", "torn", "dragging");
    pack.classList.toggle("signature", state.signature);
    packTop.style.transform = "";
    eyebrow.textContent = state.signature ? "Booster Signature" : "Booster";
    eyebrow.classList.toggle("signature", state.signature);
    status.textContent = !available
      ? "Plus de booster pour l'instant."
      : "Glisse ton doigt sur le booster pour le déchirer.";
    // 1er booster : le doigt montre qu'il faut GLISSER sur le paquet (pas toucher).
    showTutorial(pack.querySelector(".pack-art"), available && !isTutorialDone() ? "Glisse pour déchirer" : "");
    renderStock(state);
    renderPity();
  }

  /** Stock gratuit (pastilles), minuteur, compteur Signature. */
  function renderStock(state = getBoosterState()) {
    stockPips.replaceChildren(...Array.from({ length: state.max }, (_, i) => {
      const pip = document.createElement("span");
      pip.className = i < state.stock ? "stock-pip full" : "stock-pip";
      return pip;
    }));
    stockPips.setAttribute("aria-label", `${state.stock} booster${state.stock > 1 ? "s" : ""} gratuit${state.stock > 1 ? "s" : ""} sur ${state.max}`);
    stockTimer.textContent = state.nextInMs === null
      ? "Stock plein"
      : `Prochain dans ${formatDuration(state.nextInMs)}`;

    stockSignature.textContent = state.signature
      ? `Ce booster est un Signature : ${BOOSTER.cardsPerPack}e carte ${SIGNATURE_MIN.name} ou mieux !`
      : state.untilSignature === 1
        ? "Le prochain booster gratuit est un Signature !"
        : `Signature dans ${state.untilSignature} boosters gratuits`;
    stockSignature.classList.toggle("now", state.signature);
    return state;
  }

  // Minuteur : chaque seconde on redessine le décompte (calculé depuis l'échéance donnée par le
  // serveur). Quand il arrive à zéro, on redemande l'état au serveur : c'est lui qui ajoute le booster.
  let refetching = false;
  async function tick() {
    if (closedView.hidden || pack.dataset.locked === "1") return;
    const state = renderStock();
    if (state.nextInMs === 0 && !refetching) {
      refetching = true;
      try {
        await refreshState();
        refreshPack();
      } catch (err) {
        console.warn("Minuteur :", err);
        await new Promise((r) => setTimeout(r, 10000)); // serveur injoignable : on réessaie plus tard
      } finally {
        refetching = false;
      }
    }
    if (state.canOpen !== packCanOpen) refreshPack();
  }
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });

  /** Jauges « Légendaire garantie » et « Épique garantie » sous le paquet. */
  function renderPity() {
    const pity = getPity();
    const at = PITY.legendary.guaranteedAt;
    pityCount.textContent = pity + 1 >= at ? "Prochain booster\u00a0!" : `${pity} / ${at}`;
    pityFill.style.width = `${Math.min(100, (pity / (at - 1)) * 100)}%`;
    // La jauge brille dès que la pity douce a commencé (taux Légendaire en hausse).
    pityGauge.classList.toggle("almost", pity >= PITY.legendary.softStart);
    pityGauge.setAttribute("aria-label",
      `Légendaire garantie : ${pity} boosters sans Légendaire sur ${at}`);

    const epic = getPityEpic();
    const after = PITY.epic.guaranteedAfter;
    pityEpicCount.textContent = epic >= after ? "Prochain booster\u00a0!" : `${epic} / ${after}`;
    pityEpicFill.style.width = `${Math.min(100, (epic / after) * 100)}%`;
    pityEpicGauge.setAttribute("aria-label",
      `Épique garantie : ${epic} boosters sans Épique ou mieux sur ${after}`);
  }

  // --- 1. Déchirer le paquet (uniquement en glissant) ------------------------

  attachGesture(pack, {
    threshold: SWIPE_TO_TEAR,
    onDrag: (dx, progress) => {
      pack.classList.add("dragging");
      // La bande pivote depuis son coin gauche, de plus en plus.
      packTop.style.transform = `rotate(${-12 * progress}deg) translateY(${-6 * progress}px)`;
    },
    onSwipe: () => open(),
    onRelease: () => {
      // Pas assez glissé : la bande retombe.
      pack.classList.remove("dragging");
      packTop.style.transform = "";
    },
    onTap: () => {
      // Un toucher n'ouvre PAS : le paquet sursaute pour rappeler qu'il faut glisser.
      pack.classList.remove("nudge");
      void pack.offsetWidth; // rejoue l'animation
      pack.classList.add("nudge");
      status.textContent = "Glisse ton doigt sur le booster pour le déchirer.";
    },
  });

  /** Demande le booster au serveur (tirage + sauvegarde chez lui), puis déchirure et première carte. */
  async function open() {
    if (pack.disabled || pack.dataset.locked === "1") return;
    pack.dataset.locked = "1";
    tutorial = !isTutorialDone();
    showTutorial(pack.querySelector(".pack-art"), "");
    status.textContent = "Ouverture…";

    let result;
    try {
      result = await openBooster();
    } catch (err) {
      // « Aucun booster disponible », connexion perdue… : on le dit, l'écran reste utilisable.
      reportError(err);
      pack.dataset.locked = "0";
      try { await refreshState(); } catch { /* sans importance */ }
      refreshPack();
      return;
    }
    // Les cartes arrivent déjà dans l'ordre de révélation (la plus rare en dernier, Signature en dernier).
    cards = result.cards.map((c) => ({
      colorwayId: c.colorway_id, rarity: c.rarity, forced: c.forced, signature: c.signature, isNew: c.is_new,
    }));
    // Le tirage est déjà enregistré par le serveur : recharger la page ne permet pas de retirer.
    // On relit l'état (collection, stock, pity) pendant l'animation.
    refreshState().then(() => onOpened?.()).catch(reportError);

    playSound("tear");
    vibrate([15]);
    pack.classList.remove("dragging");
    pack.classList.add("torn");
    packTop.style.transform = "";
    setTimeout(() => {
      closedView.hidden = true;
      openedView.hidden = false;
      recap.hidden = true;
      doneBtn.hidden = true;
      index = 0;
      showCard();
    }, TEAR_TIME);
  }

  // --- 2. Une carte à la fois -----------------------------------------------

  function showCard() {
    const card = cards[index];
    const colorway = catalogue.colorwayById.get(card.colorwayId);
    const el = createCard(colorway, card);
    el.classList.add("current", "enter");
    // Une fois arrivée, la carte perd « enter » : sinon l'animation d'arrivée
    // se rejouerait quand une autre animation (tremblement de l'aura) s'arrête.
    el.addEventListener("animationend", (e) => {
      if (e.animationName === "card-enter") el.classList.remove("enter");
    });
    current = { el, card, revealed: false, aura: -1, timer: null };

    counter.textContent = `Carte ${index + 1} / ${cards.length}`;
    stage.dataset.remaining = String(cards.length - index - 1); // cartes encore dans la pile
    stage.replaceChildren(el);
    setHint();

    const me = current;
    attachGesture(el, {
      threshold: SWIPE_CARD,
      onHoldStart: () => { if (!me.revealed) startAura(me); },
      onHoldEnd: () => stopAura(me),
      onDrag: (dx, progress) => {
        el.classList.add("dragging");
        el.style.transform = me.revealed
          ? `translateX(${dx}px) rotate(${dx * 0.04}deg)`            // la carte part avec le doigt
          : `rotateY(${Math.sign(dx) * 35 * progress}deg)`;         // la carte commence à pivoter
      },
      onRelease: () => {
        el.classList.remove("dragging");
        el.style.transform = "";
      },
      onSwipe: (dir) => {
        el.classList.remove("dragging");
        el.style.transform = "";
        if (!me.revealed) flip(me);
        else next(me, dir);
      },
      onTap: () => {
        // Un toucher ne fait rien : on rappelle le geste.
        hint.classList.remove("pulse");
        void hint.offsetWidth;
        hint.classList.add("pulse");
      },
    });
  }

  function setHint() {
    if (!current.revealed) {
      hint.textContent = "Glisse pour retourner · reste appuyé pour voir l'aura";
    } else {
      hint.textContent = index < cards.length - 1 ? "Glisse pour la carte suivante" : "Glisse pour voir ton drop";
    }
    // Tuto (1re carte du 1er booster) : le doigt montre le geste par-dessus la carte.
    if (tutorial && index === 0) {
      showTutorial(stage, current.revealed ? "Glisse pour la suivante" : "Glisse pour retourner");
    }
  }

  // --- 3. L'aura : rester appuyé la fait monter palier par palier ------------

  function setAura(state, level) {
    state.aura = level;
    for (const r of RARITIES) state.el.classList.remove(`aura-${r.id}`);
    if (level >= 0) state.el.classList.add(`aura-${RARITIES[level].id}`);
  }

  function startAura(state) {
    const target = rank.get(state.card.rarity); // l'aura ne dépasse jamais la rareté de la carte
    const step = () => {
      if (state.aura >= target) {             // palier final atteint : on arrête de monter
        stopAura(state);
        return;
      }
      setAura(state, state.aura + 1);
      playSound(`aura${state.aura}`);
      vibrate([8 + state.aura * 8]);
    };
    step(); // 1er palier tout de suite
    state.timer = setInterval(step, AURA_STEP);
  }

  function stopAura(state) {
    clearInterval(state.timer);
    state.timer = null;
  }

  // --- 4. Retourner la carte -------------------------------------------------

  function flip(state) {
    stopAura(state);
    state.revealed = true;
    state.el.dataset.locked = "1"; // pas de nouveau geste pendant l'animation
    showTutorial(stage, "");       // le doigt réapparaîtra après le retournement
    state.el.classList.add("revealed");
    // Après le retournement, l'aura correspond à la VRAIE rareté de la carte.
    setAura(state, state.card.rarity === "commun" ? -1 : rank.get(state.card.rarity));
    playSound("flip");
    setTimeout(() => celebrate(state), FLIP_TIME * 0.6);
  }

  /** L'effet après le retournement, du plus discret (Rare) au plus fort (Légendaire). */
  function celebrate(state) {
    const { el, card } = state;
    const color = getComputedStyle(el).getPropertyValue("--rarity-color").trim();
    const box = el.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;

    if (card.rarity === "rare") {
      el.classList.add("shine");
      burst(cx, cy, color, 10, 90);
      playSound("rare");
      vibrate(VIBRATIONS.rare);
    } else if (card.rarity === "epique") {
      el.classList.add("shine", "epic-hit");
      burst(cx, cy, color, 26, 170);
      setTimeout(() => burst(cx, cy, color, 14, 120), 220);
      popTitle(getRarity("epique").name);
      playSound("epique");
      vibrate(VIBRATIONS.epique);
    } else if (card.rarity === "legendaire") {
      showOverlay(state, color);
      return; // on quitte le plein écran en glissant (voir plus bas)
    }
    el.dataset.locked = "0";
    setHint();
  }

  /** Titre qui surgit au-dessus de la carte (Épique). */
  function popTitle(text) {
    const title = document.createElement("p");
    title.className = "pop-title";
    title.textContent = `${text}\u00a0!`; // espace insécable : le « ! » ne part pas seul à la ligne
    stage.append(title);
    counter.style.visibility = "hidden"; // le titre passe par-dessus « Carte 2 / 3 »
    setTimeout(() => {
      title.remove();
      counter.style.visibility = "";
    }, 1800);
  }

  // --- Plein écran Légendaire ------------------------------------------------

  function showOverlay(state, color) {
    const colorway = catalogue.colorwayById.get(state.card.colorwayId);
    overlay.dataset.rarity = "legendaire";
    document.getElementById("reveal-title").textContent = `${getRarity("legendaire").name}\u00a0!`;
    const big = createCardShell(colorway, "legendaire");
    big.classList.add("owned");
    big.append(createCardFace(colorway, "legendaire"));
    if (state.card.isNew) big.append(newBadge());
    document.getElementById("reveal-card").replaceChildren(big);
    overlay.hidden = false;
    hint.textContent = ""; // sinon le texte transparaît sous le plein écran
    overlay.dataset.locked = "1";
    setTimeout(() => { overlay.dataset.locked = "0"; }, 900); // laisse le temps de savourer

    playSound("legendaire");
    vibrate(VIBRATIONS.legendaire);
    for (let i = 0; i < 3; i++) {
      setTimeout(() => burst(innerWidth / 2, innerHeight / 2, color, 36, 220), 150 + i * 350);
    }
  }

  // Glisser sur le plein écran : on le ferme et on passe à la carte suivante.
  attachGesture(overlay, {
    threshold: 0.25,
    onSwipe: (dir) => {
      if (overlay.hidden) return;
      overlay.hidden = true;
      if (current) next(current, dir);
    },
  });

  // --- 5. Carte suivante, puis récapitulatif ---------------------------------

  function next(state, dir) {
    state.el.dataset.locked = "1";
    state.el.style.setProperty("--fly", dir < 0 ? "-130vw" : "130vw");
    state.el.classList.add("fly");
    playSound("flip");
    setTimeout(() => {
      index++;
      if (index < cards.length) showCard();
      else showRecap();
    }, FLY_TIME);
  }

  function showRecap() {
    current = null;
    // 1er booster terminé : le tuto ne s'affichera plus.
    if (tutorial) {
      markTutorialDone().catch(() => {}); // pas grave si ça échoue : le tuto reviendra
      tutorial = false;
    }
    stage.replaceChildren();
    stage.dataset.remaining = "0";
    counter.textContent = "Ton drop";
    hint.textContent = "";
    recap.replaceChildren(...cards.map((card) => {
      const colorway = catalogue.colorwayById.get(card.colorwayId);
      const el = createCardShell(colorway, card.rarity);
      el.classList.add("owned");
      el.append(createCardFace(colorway, card.rarity));
      if (card.isNew) el.append(newBadge());
      return el;
    }));
    recap.hidden = false;
    doneBtn.hidden = false;
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
  el.classList.add("flip-card");
  el.setAttribute("aria-label", "Carte face cachée : glisse pour la retourner");

  const back = document.createElement("div");
  back.className = "card-back";
  back.textContent = "?";

  const face = createCardFace(colorway, card.rarity);
  if (card.isNew) face.append(newBadge());
  el.append(back, face);
  return el;
}
