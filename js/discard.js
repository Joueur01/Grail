// discard.js — défausse : échanger des cartes contre des pièces.
//
// Un seul écran (dans la fiche déjà utilisée par la roue) où l'on sélectionne
// PLUSIEURS cartes d'un coup : toucher une carte ajoute un exemplaire, toucher
// une pastille de la sélection en retire un. Les cartes verrouillées sont
// protégées. Les valeurs viennent de economy-config.js (DISCARD_VALUES).
// On peut l'ouvrir depuis la fiche d'une carte, une ligne de l'Atelier ou le
// bouton « Défausser des cartes » de l'Atelier.

import { RARITIES, getRarity } from "./data.js?v=29";
import { DISCARD_VALUES, DISCARD_CONFIRM_FROM, DISCARD_KEEP } from "./economy-config.js?v=29";
import { getOwnedCards, getEquipped, discardCards, cardKey } from "./inventory.js?v=29";
import { SLOTS } from "./avatar.js?v=29";
import { createCardFace, createCardShell, createLockBadge } from "./cards.js?v=29";
import { playSound, vibrate } from "./effects.js?v=29";
import { flyCoins } from "./wallet.js?v=29";

/** Pièces gagnées pour une carte de cette rareté. */
export function discardValue(rarity) {
  return DISCARD_VALUES[rarity] || 0;
}

/**
 * Branche l'écran de défausse. Renvoie { openCard, openModel, openAll }.
 * - onChange : appelé quand la collection a changé (pour tout redessiner)
 */
export function setupDiscard({ catalogue, onChange }) {
  const sheet = document.getElementById("card-sheet");
  const title = document.getElementById("card-sheet-title");
  const body = document.getElementById("card-sheet-body");

  const rank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const order = new Map(catalogue.colorways.map((c, i) => [c.id, i]));
  const confirmRank = rank.get(DISCARD_CONFIRM_FROM);

  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

  /**
   * Ouvre l'écran.
   * - heading / subtitle : textes du haut
   * - filter(card, colorway) : quelles cartes sont proposées
   * - preselect : { colorwayId, rarity } dont on sélectionne 1 exemplaire au départ
   */
  function open({ heading, subtitle, filter, preselect = null }) {
    title.textContent = heading;
    const selected = new Map(); // clé de carte → nombre d'exemplaires sélectionnés
    let armed = false;           // 2e toucher demandé (Épique / Légendaire) : bouton « armé »

    // La carte touchée dans la fiche est sélectionnée d'emblée (1 exemplaire), si elle n'est pas verrouillée.
    if (preselect) {
      const c = getOwnedCards().find((x) => x.colorwayId === preselect.colorwayId && x.rarity === preselect.rarity);
      if (c && !c.locked) selected.set(cardKey(c.colorwayId, c.rarity), 1);
    }

    const sub = document.createElement("p");
    sub.className = "sheet-text muted";
    sub.textContent = subtitle;
    const summary = document.createElement("p");
    summary.className = "discard-summary";
    const tray = document.createElement("div");
    tray.className = "discard-tray";
    const warning = document.createElement("p");
    warning.className = "sheet-text muted discard-warning";
    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-primary";
    const tools = document.createElement("div");
    tools.className = "discard-tools";
    const keepBtn = document.createElement("button");
    keepBtn.className = "btn";
    keepBtn.textContent = `Tout sauf ${plural(DISCARD_KEEP, "exemplaire")} de chaque`;
    const clearBtn = document.createElement("button");
    clearBtn.className = "btn";
    clearBtn.textContent = "Tout désélectionner";
    tools.append(keepBtn, clearBtn);
    const empty = document.createElement("p");
    empty.className = "sheet-text muted";
    empty.textContent = "Aucune carte à défausser ici.";
    const grid = document.createElement("div");
    grid.className = "card-grid stake-pool";
    body.replaceChildren(sub, summary, tray, warning, confirmBtn, tools, para("Tes cartes", "eyebrow sheet-eyebrow"), empty, grid);
    sheet.hidden = false;

    /** Cartes proposées (à jour), la plus rare d'abord. */
    const scope = () => getOwnedCards()
      .filter((c) => catalogue.colorwayById.has(c.colorwayId) && filter(c, catalogue.colorwayById.get(c.colorwayId)))
      .sort((a, b) => (rank.get(b.rarity) - rank.get(a.rarity)) || (order.get(a.colorwayId) - order.get(b.colorwayId)));

    /** Liste à défausser : [{ colorwayId, rarity }] avec un élément par exemplaire. */
    const picks = (cards) => cards.flatMap((c) => Array(selected.get(cardKey(c.colorwayId, c.rarity)) || 0)
      .fill({ colorwayId: c.colorwayId, rarity: c.rarity }));

    function render() {
      const cards = scope();
      const list = picks(cards);
      const coins = list.reduce((sum, c) => sum + discardValue(c.rarity), 0);
      const needsConfirm = list.some((c) => rank.get(c.rarity) >= confirmRank);

      summary.textContent = list.length
        ? `${plural(list.length, "carte")} · +${coins} pièces`
        : "Aucune carte sélectionnée";
      summary.classList.toggle("on", list.length > 0);

      // Pastilles de la sélection : toucher = retirer un exemplaire
      tray.replaceChildren(...cards.filter((c) => selected.get(cardKey(c.colorwayId, c.rarity))).map((c) => {
        const colorway = catalogue.colorwayById.get(c.colorwayId);
        const chip = document.createElement("button");
        chip.className = "discard-chip";
        chip.dataset.rarity = c.rarity;
        chip.setAttribute("aria-label", `Retirer un exemplaire : ${colorway.piece.name}, ${colorway.name}, ${getRarity(c.rarity).name}`);
        const img = document.createElement("img");
        img.className = "pixel";
        img.src = colorway.sprite;
        img.width = 32;
        img.height = 32;
        img.alt = "";
        const tile = document.createElement("span");
        tile.className = "atelier-chip-tile";
        tile.append(img);
        const n = document.createElement("span");
        n.className = "atelier-chip-count";
        n.textContent = `×${selected.get(cardKey(c.colorwayId, c.rarity))}`;
        chip.append(tile, n);
        chip.addEventListener("click", () => {
          const key = cardKey(c.colorwayId, c.rarity);
          const left = selected.get(key) - 1;
          if (left > 0) selected.set(key, left); else selected.delete(key);
          armed = false;
          render();
        });
        return chip;
      }));
      tray.hidden = list.length === 0;

      // Avertissements : carte portée qui quitte la tenue
      const worn = new Set(SLOTS.map((s) => getEquipped(s.id)).filter(Boolean).map((c) => cardKey(c.colorwayId, c.rarity)));
      const leavingOutfit = cards.some((c) => {
        const key = cardKey(c.colorwayId, c.rarity);
        return worn.has(key) && selected.get(key) === c.count;
      });
      warning.textContent = leavingOutfit ? "Une carte portée quitte ta tenue." : "Les cartes défaussées ne reviennent pas.";

      confirmBtn.disabled = list.length === 0;
      confirmBtn.textContent = !list.length ? "Défausser"
        : armed ? `Confirmer : ${plural(list.length, "carte")} contre ${coins} pièces`
          : `Défausser ${plural(list.length, "carte")} · +${coins} pièces`;
      confirmBtn.classList.toggle("armed", armed);

      // Raccourcis
      keepBtn.disabled = !cards.some((c) => !c.locked && c.count > DISCARD_KEEP);
      clearBtn.disabled = list.length === 0;

      // Grille des cartes : toucher = ajouter un exemplaire
      empty.hidden = cards.length > 0;
      grid.replaceChildren(...cards.map((c) => {
        const colorway = catalogue.colorwayById.get(c.colorwayId);
        const key = cardKey(c.colorwayId, c.rarity);
        const picked = selected.get(key) || 0;
        const left = c.count - picked;
        const el = createCardShell(colorway, c.rarity);
        el.classList.add("owned", "tappable");
        el.append(createCardFace(colorway, c.rarity));
        if (c.locked) {
          el.classList.add("used");
          el.append(createLockBadge());
          el.setAttribute("aria-label", `${colorway.piece.name}, ${colorway.name} : verrouillée, impossible à défausser`);
        } else {
          if (picked > 0) el.classList.add("picked");
          if (left === 0) el.classList.add("used");
          const badge = document.createElement("span");
          badge.className = "count-badge";
          badge.textContent = `×${left}`;
          el.append(badge);
          if (picked > 0) {
            const pick = document.createElement("span");
            pick.className = "pick-badge";
            pick.textContent = `−${picked}`;
            el.append(pick);
          }
          el.addEventListener("click", () => {
            if ((selected.get(key) || 0) >= c.count) return;
            selected.set(key, (selected.get(key) || 0) + 1);
            armed = false;
            render();
          });
        }
        return el;
      }));

      // Les actions utilisent l'état courant
      keepBtn.onclick = () => {
        for (const c of cards) {
          if (!c.locked && c.count > DISCARD_KEEP) selected.set(cardKey(c.colorwayId, c.rarity), c.count - DISCARD_KEEP);
        }
        armed = false;
        render();
      };
      clearBtn.onclick = () => { selected.clear(); armed = false; render(); };
      confirmBtn.onclick = () => {
        if (!list.length) return;
        if (needsConfirm && !armed) { armed = true; render(); return; } // Épique / Légendaire : 2e toucher
        const gained = discardCards(list);
        if (gained === null) { selected.clear(); armed = false; render(); return; } // la collection a changé entre-temps
        playSound("coin");
        vibrate([20]);
        flyCoins(confirmBtn, gained);
        onChange?.();
        showResult(list.length, gained);
      };
    }

    /** Écran de fin : montant gagné, puis retour à la collection. */
    function showResult(count, gained) {
      title.textContent = "Défaussé !";
      const done = document.createElement("button");
      done.className = "btn btn-primary";
      done.textContent = "Super";
      done.addEventListener("click", () => { sheet.hidden = true; });
      const again = document.createElement("button");
      again.className = "btn";
      again.textContent = "Défausser d'autres cartes";
      again.addEventListener("click", () => open({ heading, subtitle, filter }));
      const actions = document.createElement("div");
      actions.className = "sheet-actions";
      actions.append(done, again);
      const gain = document.createElement("p");
      gain.className = "discard-gain";
      gain.textContent = `+${gained} pièces`;
      body.replaceChildren(gain, para(`${count} carte${count > 1 ? "s" : ""} défaussée${count > 1 ? "s" : ""}.`, "sheet-subtitle"), actions);
    }

    render();
  }

  function para(text, className) {
    const p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    return p;
  }

  return {
    /** Depuis la fiche d'une carte : les cartes du même modèle, 1 exemplaire déjà sélectionné. */
    openCard(colorwayId, rarity) {
      const colorway = catalogue.colorwayById.get(colorwayId);
      if (!colorway) return;
      open({
        heading: "Défausser",
        subtitle: `${colorway.piece.name} · touche des cartes pour les ajouter à la sélection.`,
        filter: (c, cw) => cw.piece.id === colorway.piece.id,
        preselect: { colorwayId, rarity },
      });
    },
    /** Depuis une ligne de l'Atelier : un modèle à une rareté. */
    openModel(piece, rarity) {
      open({
        heading: "Défausser",
        subtitle: `${piece.name} · ${getRarity(rarity).name} : touche des cartes pour les ajouter à la sélection.`,
        filter: (c, cw) => cw.piece.id === piece.id && c.rarity === rarity,
      });
    },
    /** Toute la collection. */
    openAll() {
      open({
        heading: "Défausser",
        subtitle: "Touche des cartes pour les ajouter à la sélection, ou garde un exemplaire de chaque d'un seul geste.",
        filter: () => true,
      });
    },
  };
}
