// upgrade.js — fiche d'une carte (depuis la Collection) et amélioration par la roue.
//
// ⚠️ La roue est TIRÉE PAR LE SERVEUR (upgrade_cards) : ce fichier envoie la mise, puis affiche
// le résultat reçu (réussite, chance, position de la roue, carte obtenue). Les règles ci-dessous
// sont appliquées par le serveur ; le front n'en garde que l'affichage (chance annoncée).
// Règles (section 6 du CLAUDE.md) :
//   - on mise de 1 à 5 cartes du MÊME modèle et de la MÊME rareté (coloris libres) ;
//   - chaque carte misée = 20 % de réussite (5 cartes = 100 %) ;
//   - réussite : 1 carte du même modèle, rareté au-dessus. Même coloris si toutes
//     les cartes misées ont le même coloris, sinon coloris au hasard parmi TOUS
//     ceux du modèle ;
//   - les cartes misées sont perdues dans tous les cas ; une Légendaire ne s'améliore pas.
// La défausse est dans discard.js (le bouton de la fiche l'ouvre).

import { RARITIES, getRarity } from "./data.js?v=48";
import { UPGRADE, DISCARD_VALUES } from "./economy-config.js?v=48";
import { getOwnedCards, countCard, isLocked, setLocked, refreshState } from "./inventory.js?v=48";
import { upgradeCards } from "./api.js?v=48";
import { reportError } from "./wallet.js?v=48";
import { createCardFace, createCardShell } from "./cards.js?v=48";
import { playSound, vibrate, burst } from "./effects.js?v=48";

const SPIN_TIME = 3200; // durée de la roue (identique au CSS)

// --- Aides d'affichage -------------------------------------------------------

/** Rareté juste au-dessus, ou null pour une Légendaire. */
export function nextRarity(rarityId) {
  const i = RARITIES.findIndex((r) => r.id === rarityId);
  return i >= 0 && i < RARITIES.length - 1 ? RARITIES[i + 1].id : null;
}

/** Chance de réussite ANNONCÉE (en %) pour un nombre de cartes misées : la vraie est calculée par le serveur. */
export function upgradeChance(count) {
  return Math.min(UPGRADE.maxChance, count * UPGRADE.chancePerCard);
}

// --- Affichage --------------------------------------------------------------

/**
 * Branche la fiche de carte et la roue. Renvoie { openCard }.
 * - catalogue : résultat de loadCatalogue()
 * - onChange : appelé quand la collection a changé (pour tout redessiner)
 * - onDiscard(colorwayId, rarity) : appelé par le bouton « Défausser » de la fiche
 */
export function setupUpgrade({ catalogue, onChange, onDiscard }) {
  const sheet = document.getElementById("card-sheet");
  const title = document.getElementById("card-sheet-title");
  const body = document.getElementById("card-sheet-body");
  let spinning = false;
  let wheelTurn = 0; // rotation cumulée de la roue (en degrés), pour qu'elle reparte d'où elle était

  function close() {
    if (spinning) return; // on ne ferme pas pendant que la roue tourne
    sheet.hidden = true;
  }
  document.getElementById("card-sheet-close").addEventListener("click", close);
  sheet.addEventListener("click", (e) => { if (e.target === sheet) close(); });

  /** Grande carte (fiche, résultat). */
  function bigCard(colorwayId, rarity) {
    const colorway = catalogue.colorwayById.get(colorwayId);
    const el = createCardShell(colorway, rarity);
    el.classList.add("owned", "sheet-card");
    el.append(createCardFace(colorway, rarity));
    return el;
  }

  function button(text, { primary = false, disabled = false, onClick } = {}) {
    const b = document.createElement("button");
    b.className = primary ? "btn btn-primary" : "btn";
    b.textContent = text;
    b.disabled = disabled;
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  function para(text, className = "muted sheet-text") {
    const p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    return p;
  }

  // --- 1. Fiche d'une carte ---

  function openCard({ colorwayId, rarity }) {
    const colorway = catalogue.colorwayById.get(colorwayId);
    const count = countCard(colorwayId, rarity);
    if (!colorway || count === 0) return;
    const target = nextRarity(rarity);
    const locked = isLocked(colorwayId, rarity);

    title.textContent = colorway.piece.name;
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    actions.append(
      locked
        ? button("Carte verrouillée", { primary: true, disabled: true })
        : target
        ? button(`Améliorer en ${getRarity(target).name}`, { primary: true, onClick: () => openUpgrade(colorway.piece, rarity, colorwayId) })
        : button("Rareté maximale", { primary: true, disabled: true }),
      // Verrou : une carte verrouillée n'est jamais proposée à l'amélioration.
      button(locked ? "Déverrouiller" : "Verrouiller", {
        onClick: async () => {
          try {
            await setLocked(colorwayId, rarity, !locked);
            onChange?.();
            openCard({ colorwayId, rarity });
          } catch (err) { reportError(err); }
        },
      }),
      // Défausse : plusieurs cartes d'un coup (discard.js) ; impossible si la carte est verrouillée.
      locked
        ? button("Défausser · carte verrouillée", { disabled: true })
        : button(`Défausser · +${DISCARD_VALUES[rarity]} pièces par carte`, { onClick: () => onDiscard?.(colorwayId, rarity) }),
    );
    body.replaceChildren(
      bigCard(colorwayId, rarity),
      para(`${count} exemplaire${count > 1 ? "s" : ""}${locked ? " · verrouillée : jamais proposée à l'amélioration" : ""}`),
      actions,
    );
    sheet.hidden = false;
  }

  // --- 2. Amélioration : choix de la mise + roue ---

  /**
   * - firstColorwayId : carte touchée dans la fiche (sa mise de départ)
   * - fillModel : true (depuis l'Atelier) = la mise est pré-remplie avec les
   *   cartes de tout le modèle, jusqu'à 5 (voir plus bas)
   */
  function openUpgrade(piece, rarity, firstColorwayId, fillModel = false) {
    const target = nextRarity(rarity);
    // Cartes possédées de ce modèle à cette rareté : [{ colorwayId, count }]
    const owned = getOwnedCards()
      .filter((c) => !c.locked && c.rarity === rarity && catalogue.colorwayById.get(c.colorwayId)?.piece.id === piece.id)
      .map((c) => ({ colorwayId: c.colorwayId, count: c.count }));
    const stake = [];
    if (fillModel) {
      // Depuis l'Atelier : si un coloris a au moins 5 exemplaires, on ne mise que
      // lui (le coloris est alors conservé) ; sinon les coloris les plus nombreux d'abord.
      const sorted = [...owned].sort((a, b) => b.count - a.count);
      const pool = sorted[0]?.count >= UPGRADE.maxCards ? [sorted[0]] : sorted;
      for (const c of pool) {
        for (let i = 0; i < c.count && stake.length < UPGRADE.maxCards; i++) stake.push(c.colorwayId);
      }
    } else {
      // Depuis la fiche : les exemplaires de la carte touchée (jusqu'à 5).
      const first = owned.find((c) => c.colorwayId === firstColorwayId);
      for (let i = 0; i < Math.min(first?.count || 0, UPGRADE.maxCards); i++) stake.push(firstColorwayId);
    }

    title.textContent = "Améliorer";
    const subtitle = para(`${piece.name} · ${getRarity(rarity).name} → ${getRarity(target).name}`, "sheet-subtitle");

    // Les 5 cases de mise
    const slots = document.createElement("div");
    slots.className = "stake-slots";

    // La roue : part colorée (réussite) dont la taille = la chance
    const wheelWrap = document.createElement("div");
    wheelWrap.className = "wheel-wrap";
    wheelWrap.dataset.rarity = target; // la part gagnante prend la couleur de la rareté visée
    const wheel = document.createElement("div");
    wheel.className = "wheel";
    wheel.style.transform = `rotate(${wheelTurn}deg)`;
    const chanceLabel = document.createElement("span");
    chanceLabel.className = "wheel-chance";
    wheelWrap.append(wheel, chanceLabel);

    const warning = para("");
    const spinBtn = button("Lancer la roue", { primary: true, onClick: spin });

    // Cartes disponibles à ajouter à la mise
    const pool = document.createElement("div");
    pool.className = "card-grid stake-pool";

    function render() {
      const chance = upgradeChance(stake.length);
      // Cases de mise
      slots.replaceChildren(...Array.from({ length: UPGRADE.maxCards }, (_, i) => {
        const slot = document.createElement("button");
        slot.className = "stake-slot";
        const id = stake[i];
        if (id) {
          const img = document.createElement("img");
          img.className = "pixel";
          img.src = catalogue.colorwayById.get(id).sprite;
          img.width = 32;
          img.height = 32;
          img.alt = "";
          slot.append(img);
          slot.setAttribute("aria-label", "Retirer cette carte de la mise");
          slot.addEventListener("click", () => { if (!spinning) { stake.splice(i, 1); render(); } });
        } else {
          slot.classList.add("empty");
          slot.textContent = "+";
          slot.disabled = true;
        }
        return slot;
      }));
      // Roue et textes
      wheel.style.setProperty("--chance", chance);
      chanceLabel.textContent = `${chance} %`;
      warning.textContent = stake.length === 0
        ? "Touche tes cartes ci-dessous pour les miser."
        : chance >= UPGRADE.maxChance
          ? `Réussite assurée : tes ${stake.length} cartes deviennent 1 carte ${getRarity(target).name}.`
          : `Si la roue s'arrête sur le gris, tu perds ${stake.length > 1 ? `les ${stake.length} cartes misées` : "la carte misée"}.`;
      spinBtn.disabled = stake.length < UPGRADE.minCards || spinning;
      spinBtn.textContent = stake.length ? `Lancer la roue · ${chance} %` : "Lancer la roue";
      // Cartes disponibles (exemplaires pas encore misés)
      pool.replaceChildren(...owned.map((c) => {
        const left = c.count - stake.filter((id) => id === c.colorwayId).length;
        const colorway = catalogue.colorwayById.get(c.colorwayId);
        const el = createCardShell(colorway, rarity);
        el.classList.add("owned", "tappable");
        if (left === 0 || stake.length >= UPGRADE.maxCards) el.classList.add("used");
        el.append(createCardFace(colorway, rarity));
        const badge = document.createElement("span");
        badge.className = "count-badge";
        badge.textContent = `×${left}`;
        el.append(badge);
        el.addEventListener("click", () => {
          if (spinning || left === 0 || stake.length >= UPGRADE.maxCards) return;
          stake.push(c.colorwayId);
          render();
        });
        return el;
      }));
    }

    async function spin() {
      if (spinning || stake.length < UPGRADE.minCards) return;
      spinning = true;
      spinBtn.disabled = true;
      render();
      // La mise part au serveur sous la forme { "coloris": nombre } ; c'est lui qui tire.
      const counts = {};
      for (const id of stake) counts[id] = (counts[id] || 0) + 1;
      const spent = stake.length;

      let reply;
      try {
        reply = await upgradeCards(rarity, counts);
      } catch (err) {
        // « Carte verrouillée », cartes en moins… : on le dit et on rouvre l'écran avec l'état à jour.
        spinning = false;
        reportError(err);
        try { await refreshState(); } catch { /* sans importance */ }
        onChange?.();
        openUpgrade(piece, rarity, null, true);
        return;
      }
      const outcome = {
        success: reply.success, chance: reply.chance, roll: reply.roll,
        result: reply.result ? { colorwayId: reply.result.colorway_id, rarity: reply.result.rarity, isNew: reply.result.is_new } : null,
      };

      // La part colorée va de 0° à chance × 3,6° (sens horaire, depuis le haut).
      // On fait tourner la roue pour que la flèche (en haut) tombe sur l'angle
      // du tirage reçu : dans la part colorée si réussite, sinon dans le gris.
      const landing = outcome.roll * 3.6;
      const current = ((wheelTurn % 360) + 360) % 360;
      wheelTurn += 360 * 5 + ((360 - landing - current + 720) % 360);
      wheel.style.transform = `rotate(${wheelTurn}deg)`;
      wheel.classList.add("spinning");
      // Petits « clics » qui ralentissent avec la roue
      for (let i = 0; i < 18; i++) setTimeout(() => playSound("tick"), SPIN_TIME * (1 - Math.pow(1 - i / 18, 1.8)));

      // Le serveur a déjà tout enregistré : recharger la page ne permet pas de rejouer.
      // On relit la collection pendant que la roue tourne.
      const refreshed = refreshState({ booster: false }).then(() => onChange?.()).catch(reportError);

      setTimeout(async () => {
        await refreshed;
        spinning = false;
        wheel.classList.remove("spinning");
        showResult(outcome, piece, rarity, spent);
      }, SPIN_TIME + 250);
    }

    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    actions.append(spinBtn);
    body.replaceChildren(subtitle, slots, wheelWrap, warning, actions, para("Tes cartes", "eyebrow sheet-eyebrow"), pool);
    render();
    sheet.hidden = false;
  }

  // --- 3. Résultat ---

  function showResult(outcome, piece, rarity, spentCount) {
    const actions = document.createElement("div");
    actions.className = "sheet-actions";
    // Encore assez de cartes de ce modèle à cette rareté pour retenter ?
    const left = getOwnedCards().filter((c) => !c.locked && c.rarity === rarity
      && catalogue.colorwayById.get(c.colorwayId)?.piece.id === piece.id);

    if (outcome.success) {
      const { colorwayId, rarity: newRarity } = outcome.result;
      title.textContent = "Réussi !";
      const card = bigCard(colorwayId, newRarity);
      card.classList.add("upgrade-win");
      actions.append(button("Super", { primary: true, onClick: close }));
      body.replaceChildren(
        para(`Nouvelle carte ${getRarity(newRarity).name} ajoutée à ta collection.`, "sheet-subtitle"),
        card, actions);
      setTimeout(() => {
        const box = card.getBoundingClientRect();
        burst(box.left + box.width / 2, box.top + box.height / 2,
          getComputedStyle(card).getPropertyValue("--rarity-color").trim(), 30, 180);
      }, 50);
      playSound(newRarity);
      vibrate([60, 40, 60]);
    } else {
      title.textContent = "Raté…";
      actions.append(button("Fermer", { primary: true, onClick: close }));
      if (left.length) {
        actions.append(button("Réessayer", { onClick: () => openUpgrade(piece, rarity, left[0].colorwayId) }));
      }
      body.replaceChildren(
        para(`La roue s'est arrêtée sur le gris : ${spentCount > 1 ? `tes ${spentCount} cartes sont perdues` : "ta carte est perdue"}.`, "sheet-subtitle"),
        actions);
      playSound("fail");
      vibrate([30]);
    }
  }

  /** Ouvre la roue pour un modèle + une rareté, mise pré-remplie (utilisé par l'Atelier). */
  function openModel(piece, rarity) {
    openUpgrade(piece, rarity, null, true);
  }

  return { openCard, openModel };
}
