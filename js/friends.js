// friends.js — écran Amis : pseudo, demandes, liste d'amis, tenue d'un ami.
//
// ⚠️ Tout est géré par le SERVEUR (migration 0005) : validation du pseudo (format, unicité,
// mots interdits), limites, droit de voir le profil d'un ami. Ce fichier affiche ce que le
// serveur renvoie et envoie les actions. Il n'existe aucune liste publique de joueurs :
// on ne retrouve quelqu'un qu'avec son pseudo EXACT.

import { getRarity } from "./data.js?v=44";
import { setPseudo, listFriends, friendRequest, friendRespond, friendRemove, getFriendProfile } from "./api.js?v=44";
import { SLOTS, initAvatar, drawAvatar } from "./avatar.js?v=44";
import { showToast, reportError } from "./wallet.js?v=44";
import { FRIENDS } from "./economy-config.js?v=44";

/**
 * Branche l'écran Amis.
 * - catalogue : résultat de loadCatalogue() (pour dessiner la tenue d'un ami)
 */
export function setupFriends({ catalogue }) {
  const $ = (id) => document.getElementById(id);
  const sheet = $("card-sheet");
  const title = $("card-sheet-title");
  const body = $("card-sheet-body");
  const summary = $("friends-summary");
  const errorBox = $("friends-error");
  const pseudoForm = $("pseudo-form");
  const pseudoInput = $("pseudo-input");
  const pseudoSubmit = $("pseudo-submit");
  const main = $("friends-main");
  const badge = $("friends-badge");

  let data = null;        // dernière réponse de list_friends
  let editing = false;    // formulaire de pseudo ouvert alors qu'un pseudo existe déjà

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function button(text, { primary = false, onClick } = {}) {
    const b = el("button", primary ? "btn btn-primary" : "btn", text);
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  // --- Lecture ---------------------------------------------------------------------

  /** Relit pseudo, amis et demandes sur le serveur. silent : pas de message si ça échoue (relecture automatique). */
  async function load({ silent = false } = {}) {
    try {
      data = await listFriends();
      errorBox.hidden = true;
      render();
    } catch (err) {
      if (!silent) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      }
    }
  }

  // --- Affichage -------------------------------------------------------------------

  function render() {
    // Le serveur renvoie la date du prochain changement possible (null : on peut changer maintenant).
    const nextChange = data.pseudo_next_change ? new Date(data.pseudo_next_change) : null;
    const locked = nextChange !== null && nextChange > new Date();
    if (locked) editing = false;
    const needPseudo = !data.pseudo || editing;
    $("pseudo-edit").hidden = locked;
    $("pseudo-lock").hidden = !locked;
    if (locked) {
      $("pseudo-lock").textContent = `Tu pourras changer de pseudo à partir du ${nextChange.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} (un changement tous les ${FRIENDS.pseudoChangeDays} jours).`;
    }
    pseudoForm.hidden = !needPseudo;
    main.hidden = !data.pseudo;
    $("pseudo-title").textContent = data.pseudo ? "Changer de pseudo" : "Choisis ton pseudo";
    $("pseudo-hint").textContent = data.pseudo
      ? `Tu ne peux changer de pseudo qu'une fois tous les ${FRIENDS.pseudoChangeDays} jours : choisis bien ! 3 à 16 caractères : lettres, chiffres ou _.`
      : `Tes amis te retrouvent avec ce pseudo. 3 à 16 caractères : lettres, chiffres ou _. Il n'apparaît dans aucune liste publique. Tu pourras ensuite le changer une fois tous les ${FRIENDS.pseudoChangeDays} jours.`;
    if (needPseudo && document.activeElement !== pseudoInput) pseudoInput.value = data.pseudo || "";
    $("friends-me").textContent = data.pseudo || "";

    const n = data.friends.length;
    summary.textContent = data.pseudo ? `${n} ami${n > 1 ? "s" : ""}` : "Choisis un pseudo pour commencer";

    // Demandes reçues : accepter / refuser
    $("friends-incoming-box").hidden = data.incoming.length === 0;
    $("friends-incoming").replaceChildren(...data.incoming.map((r) => {
      const row = el("div", "friend-row");
      row.append(el("span", "friend-name", r.pseudo));
      const actions = el("div", "friend-actions");
      actions.append(
        button("Accepter", { primary: true, onClick: () => respond(r.id, true) }),
        button("Refuser", { onClick: () => respond(r.id, false) }),
      );
      row.append(actions);
      return row;
    }));

    // Mes amis : toucher ouvre sa tenue
    $("friends-empty").hidden = n > 0;
    $("friends-list").replaceChildren(...data.friends.map((f) => {
      const row = el("button", "friend-row friend-link");
      row.type = "button";
      row.setAttribute("aria-label", `Voir la tenue de ${f.pseudo}`);
      row.append(el("span", "friend-name", f.pseudo), el("span", "friend-chevron", "›"));
      row.addEventListener("click", () => openFriend(f));
      return row;
    }));

    // Demandes envoyées : annuler
    $("friends-outgoing-box").hidden = data.outgoing.length === 0;
    $("friends-outgoing").replaceChildren(...data.outgoing.map((r) => {
      const row = el("div", "friend-row");
      row.append(el("span", "friend-name", r.pseudo), el("span", "friend-state", "En attente"));
      const cancel = el("button", "market-row-remove", "Annuler");
      cancel.addEventListener("click", () => run(() => friendRemove(r.id), "Demande annulée."));
      row.append(cancel);
      return row;
    }));

    // Pastille sur l'onglet : demandes à traiter
    badge.hidden = data.incoming.length === 0;
    badge.textContent = String(data.incoming.length);
  }

  // --- Actions (le serveur vérifie tout) -----------------------------------------------

  /** Lance une action, affiche l'éventuelle erreur du serveur, puis relit l'écran. */
  async function run(action, doneMessage) {
    try {
      const result = await action();
      if (doneMessage) showToast(doneMessage);
      await load();
      return result;
    } catch (err) {
      reportError(err); // « Aucun joueur avec ce pseudo », « Ce pseudo est déjà pris »…
      await load({ silent: true });
      return null;
    }
  }

  async function respond(id, accept) {
    await run(() => friendRespond(id, accept), accept ? "Vous êtes amis !" : "Demande refusée.");
  }

  pseudoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    pseudoSubmit.disabled = true;
    try {
      await setPseudo(pseudoInput.value.trim());
      editing = false;
      showToast("Pseudo enregistré.");
      await load();
    } catch (err) {
      reportError(err);
    } finally {
      pseudoSubmit.disabled = false;
    }
  });

  $("pseudo-edit").addEventListener("click", () => { editing = true; render(); pseudoInput.focus(); });

  $("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("add-input");
    const pseudo = input.value.trim();
    if (!pseudo) return;
    $("add-submit").disabled = true;
    const result = await run(() => friendRequest(pseudo));
    $("add-submit").disabled = false;
    if (result) {
      input.value = "";
      showToast(result === "accepted" ? "Vous êtes amis !" : `Demande envoyée à ${pseudo}.`);
    }
  });

  // --- Tenue d'un ami ----------------------------------------------------------------

  async function openFriend(friend) {
    title.textContent = friend.pseudo;
    body.replaceChildren(el("p", "muted sheet-text", "Chargement…"));
    sheet.hidden = false;

    let profile;
    try {
      profile = await getFriendProfile(friend.friend_id);
    } catch (err) {
      sheet.hidden = true;
      reportError(err);
      return;
    }

    // Les pièces portées, dans l'ordre des emplacements (tête → pieds).
    const worn = {};
    const lines = [];
    for (const slot of SLOTS) {
      const key = profile.equipped?.[slot.id];
      if (!key) continue;
      const [colorwayId, rarity] = key.split("|");
      const colorway = catalogue.colorwayById.get(colorwayId);
      if (!colorway) continue;
      worn[slot.id] = colorway;
      lines.push({ slot, colorway, rarity });
    }

    const nodes = [];
    if (lines.length) {
      const canvas = el("canvas", "pixel friend-canvas");
      initAvatar(canvas);
      drawAvatar(canvas, worn).catch(() => {});
      nodes.push(canvas);
      const list = el("div", "atelier-list");
      for (const { slot, colorway, rarity } of lines) {
        const row = el("div", "market-row");
        row.dataset.rarity = rarity;
        const tile = el("span", "atelier-chip-tile");
        const img = el("img", "pixel");
        img.src = colorway.sprite;
        img.width = 32;
        img.height = 32;
        img.alt = "";
        tile.append(img);
        const info = el("div", "market-row-info");
        info.append(el("span", "market-row-name", colorway.piece.name),
          el("span", "market-row-sub", `${slot.name} · ${colorway.name} · ${getRarity(rarity).name}`));
        row.append(tile, info);
        list.append(row);
      }
      nodes.push(list);
    } else {
      nodes.push(el("p", "muted sheet-text", `${friend.pseudo} ne porte aucune pièce pour l'instant.`));
    }
    nodes.push(el("p", "sheet-subtitle", `Collection : ${profile.cards_owned} / ${profile.cards_total} cartes`));

    // Retirer un ami : 2 touchers pour éviter l'erreur.
    let armed = false;
    const remove = button("Retirer cet ami", {
      onClick: async () => {
        if (!armed) {
          armed = true;
          remove.textContent = `Confirmer : retirer ${friend.pseudo}`;
          remove.classList.add("armed");
          return;
        }
        sheet.hidden = true;
        await run(() => friendRemove(friend.id), `${friend.pseudo} a été retiré de tes amis.`);
      },
    });
    const actions = el("div", "sheet-actions");
    actions.append(remove);
    nodes.push(actions);
    body.replaceChildren(...nodes);
  }

  // --- Mise à jour ---------------------------------------------------------------------

  load({ silent: true });
  window.addEventListener("hashchange", () => { if (location.hash === "#friends") load(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load({ silent: true }); });
  // Relecture régulière (surtout pour la pastille « demandes reçues »).
  setInterval(() => { if (!document.hidden) load({ silent: true }); }, 45000);
  if (location.hash === "#friends") load();
}
