// discard.js — défausse : échanger des cartes contre des pièces.
//
// Un seul écran (dans la fiche déjà utilisée par la roue) où l'on sélectionne
// PLUSIEURS cartes d'un coup : toucher une carte ajoute un exemplaire, toucher
// une pastille de la sélection en retire un. Les cartes verrouillées sont
// protégées. Les valeurs viennent de economy-config.js (DISCARD_VALUES).
// On peut l'ouvrir depuis la fiche d'une carte, une ligne de l'Atelier ou le
// bouton « Sélectionner » de la Collection (createSelection, plus bas).

import { RARITIES, getRarity } from "./data.js?v=88";
import { DISCARD_VALUES, DISCARD_CONFIRM_FROM, DISCARD_KEEP } from "./economy-config.js?v=88";
import { getOwnedCards, getEquipped, getShowcaseKeys, refreshState, cardKey } from "./inventory.js?v=88";
import { discardCards as sendDiscardToServer } from "./api.js?v=88";
import { SLOTS } from "./avatar.js?v=88";
import { createCardFace, createCardShell, createLockBadge } from "./cards.js?v=88";
import { playSound, vibrate } from "./effects.js?v=88";
import { flyCoins, showToast, reportError } from "./wallet.js?v=88";

/**
 * Envoie la défausse au SERVEUR (tout ou rien) et relit l'état. Renvoie les pièces gagnées, calculées
 * par le serveur, ou null si la défausse a été refusée (message affiché ; la collection est relue).
 * - cards : [{ colorwayId, rarity }], une ligne par exemplaire
 */
async function sendDiscard(cards) {
  const counts = new Map();
  for (const c of cards) {
    const key = cardKey(c.colorwayId, c.rarity);
    counts.set(key, { colorway_id: c.colorwayId, rarity: c.rarity, count: (counts.get(key)?.count || 0) + 1 });
  }
  try {
    const gained = await sendDiscardToServer([...counts.values()]);
    await refreshState({ booster: false });
    return gained;
  } catch (err) {
    reportError(err); // « Carte verrouillée », « Cartes insuffisantes »…
    try { await refreshState({ booster: false }); } catch { /* sans importance */ }
    return null;
  }
}

/** Pièces gagnées pour une carte de cette rareté. */
export function discardValue(rarity) {
  return DISCARD_VALUES[rarity] || 0;
}

/**
 * Branche l'écran de défausse. Renvoie { openCard, openModel }.
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

      // Avertissements : carte portée ou en vitrine dont le dernier exemplaire part (le serveur la retire alors de la tenue / de la vitrine)
      const worn = new Set(SLOTS.map((s) => getEquipped(s.id)).filter(Boolean).map((c) => cardKey(c.colorwayId, c.rarity)));
      const shown = new Set(getShowcaseKeys());
      const lastCopyLeaves = (c) => selected.get(cardKey(c.colorwayId, c.rarity)) === c.count;
      const leavingOutfit = cards.some((c) => worn.has(cardKey(c.colorwayId, c.rarity)) && lastCopyLeaves(c));
      const leavingShowcase = cards.some((c) => shown.has(cardKey(c.colorwayId, c.rarity)) && lastCopyLeaves(c));
      warning.textContent = leavingOutfit && leavingShowcase ? "Une carte quitte ta tenue et ta vitrine."
        : leavingOutfit ? "Une carte portée quitte ta tenue."
          : leavingShowcase ? "Une carte quitte ta vitrine."
            : "Les cartes défaussées ne reviennent pas.";

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
      confirmBtn.onclick = async () => {
        if (!list.length || confirmBtn.disabled) return;
        if (needsConfirm && !armed) { armed = true; render(); return; } // Épique / Légendaire : 2e toucher
        confirmBtn.disabled = true; // pas de double envoi pendant que le serveur répond
        const gained = await sendDiscard(list);
        if (gained === null) { selected.clear(); armed = false; onChange?.(); render(); return; } // refusé : on repart d'un état à jour
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
  };
}

/**
 * Mode « Sélectionner » de la Collection : on choisit, parmi TOUTES ses cartes
 * (filtres et recherche utilisables), celles à défausser, puis on confirme.
 * - Toucher une carte la sélectionne ; si on en a plusieurs exemplaires, chaque
 *   toucher en ajoute un (puis revient à zéro).
 * - Une barre en bas montre le total et propose « Tout », « Doublons » (tout sauf
 *   DISCARD_KEEP exemplaire de chaque, parmi les cartes affichées) et « Vider ».
 * Renvoie l'objet à passer à setupCollection ({ selection }) ; appeler bind(render)
 * avec la fonction de redessin de la Collection.
 */
export function createSelection({ catalogue, onChange }) {
  const view = document.getElementById("collection-view");
  const toggleBtn = document.getElementById("btn-select");
  const bar = document.getElementById("select-bar");
  const summary = document.getElementById("select-summary");
  const allBtn = document.getElementById("select-all");
  const dupesBtn = document.getElementById("select-dupes");
  const clearBtn = document.getElementById("select-clear");
  const confirmBtn = document.getElementById("select-confirm");

  const rank = new Map(RARITIES.map((r, i) => [r.id, i]));
  const confirmRank = rank.get(DISCARD_CONFIRM_FROM);
  const picked = new Map(); // clé de carte → nombre d'exemplaires choisis
  let active = false;
  let armed = false;        // 2e toucher demandé (Épique / Légendaire)
  let visible = [];         // cartes affichées (après filtres)
  let refresh = () => {};

  dupesBtn.textContent = `Doublons (garder ${DISCARD_KEEP})`;

  /** Cartes à défausser, une par exemplaire (en ignorant ce qui a changé ou est verrouillé). */
  function list() {
    const owned = new Map(getOwnedCards().map((c) => [cardKey(c.colorwayId, c.rarity), c]));
    const out = [];
    for (const [key, n] of picked) {
      const c = owned.get(key);
      if (!c || c.locked) { picked.delete(key); continue; }
      const count = Math.min(n, c.count);
      for (let i = 0; i < count; i++) out.push({ colorwayId: c.colorwayId, rarity: c.rarity });
    }
    return out;
  }

  function renderBar() {
    view.classList.toggle("selecting", active);
    toggleBtn.textContent = active ? "Terminer" : "Sélectionner";
    toggleBtn.setAttribute("aria-pressed", String(active));
    bar.hidden = !active;
    if (!active) return;
    const chosen = list();
    const coins = chosen.reduce((sum, c) => sum + discardValue(c.rarity), 0);
    const shown = new Set(visible.map((c) => cardKey(c.colorwayId, c.rarity)));
    const hidden = chosen.filter((c) => !shown.has(cardKey(c.colorwayId, c.rarity))).length;
    summary.textContent = chosen.length
      ? `${chosen.length} carte${chosen.length > 1 ? "s" : ""} · +${coins} pièces${hidden ? ` (dont ${hidden} masquée${hidden > 1 ? "s" : ""} par les filtres)` : ""}`
      : "Touche des cartes pour les sélectionner";
    summary.classList.toggle("on", chosen.length > 0);
    allBtn.disabled = !visible.some((c) => !c.locked);
    dupesBtn.disabled = !visible.some((c) => !c.locked && c.count > DISCARD_KEEP);
    clearBtn.disabled = chosen.length === 0;
    confirmBtn.disabled = chosen.length === 0;
    const needsConfirm = chosen.some((c) => rank.get(c.rarity) >= confirmRank);
    confirmBtn.textContent = !chosen.length ? "Défausser"
      : armed ? `Confirmer : ${chosen.length} carte${chosen.length > 1 ? "s" : ""} contre ${coins} pièces`
        : `Défausser${needsConfirm ? "…" : ""}`;
    confirmBtn.classList.toggle("armed", armed);
  }

  function setActive(on) {
    active = on;
    armed = false;
    if (!on) picked.clear();
    refresh();
  }

  toggleBtn.addEventListener("click", () => setActive(!active));
  allBtn.addEventListener("click", () => {
    for (const c of visible) if (!c.locked) picked.set(cardKey(c.colorwayId, c.rarity), c.count);
    armed = false;
    refresh();
  });
  dupesBtn.addEventListener("click", () => {
    for (const c of visible) {
      if (!c.locked && c.count > DISCARD_KEEP) picked.set(cardKey(c.colorwayId, c.rarity), c.count - DISCARD_KEEP);
    }
    armed = false;
    refresh();
  });
  clearBtn.addEventListener("click", () => { picked.clear(); armed = false; refresh(); });
  confirmBtn.addEventListener("click", async () => {
    const chosen = list();
    if (!chosen.length || confirmBtn.disabled) return;
    if (chosen.some((c) => rank.get(c.rarity) >= confirmRank) && !armed) { armed = true; renderBar(); return; }
    confirmBtn.disabled = true; // pas de double envoi pendant que le serveur répond
    const gained = await sendDiscard(chosen);
    if (gained === null) { picked.clear(); armed = false; onChange?.(); refresh(); return; } // refusé : on repart d'un état à jour
    playSound("coin");
    vibrate([20]);
    flyCoins(confirmBtn, gained);
    showToast(`${chosen.length} carte${chosen.length > 1 ? "s" : ""} défaussée${chosen.length > 1 ? "s" : ""} · +${gained} pièces`);
    setActive(false);
    onChange?.();
  });

  return {
    /** À appeler une fois la Collection créée : fonction qui la redessine. */
    bind(fn) { refresh = fn; },
    get active() { return active; },
    setActive,
    /** Exemplaires sélectionnés d'une carte. */
    pickedCount: (c) => picked.get(cardKey(c.colorwayId, c.rarity)) || 0,
    /** Toucher une carte : +1 exemplaire (puis retour à 0 après le dernier). Ne redessine rien. */
    toggle(c) {
      if (c.locked) return;
      const key = cardKey(c.colorwayId, c.rarity);
      const next = (picked.get(key) || 0) + 1;
      if (next > c.count) picked.delete(key); else picked.set(key, next);
      armed = false; // la carte et la barre sont mises à jour par la Collection, sans tout redessiner
    },
    /** Appelé par la Collection à chaque dessin : cartes affichées, puis mise à jour de la barre. */
    update(cards) { visible = cards; renderBar(); },
  };
}
