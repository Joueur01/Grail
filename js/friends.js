// friends.js — écran Amis : pseudo, demandes, liste d'amis, tenue d'un ami.
//
// ⚠️ Tout est géré par le SERVEUR (migration 0005) : validation du pseudo (format, unicité,
// mots interdits), limites, droit de voir le profil d'un ami. Ce fichier affiche ce que le
// serveur renvoie et envoie les actions. Il n'existe aucune liste publique de joueurs :
// on ne retrouve quelqu'un qu'avec son pseudo EXACT.

import { getRarity } from "./data.js?v=79";
import { setPseudo, listFriends, friendRequest, friendRespond, friendRemove, getFriendProfile, getPlayerProfile, listFriendsPreview } from "./api.js?v=79";
import { buildProfileView } from "./profile.js?v=79";
import { setCachedPseudo } from "./inventory.js?v=79";
import { SLOTS, initAvatar, drawAvatar } from "./avatar.js?v=79";
import { buildModel, renderModel, DEFAULT_YAW } from "./avatar3d.js?v=79";
import { showToast, reportError } from "./wallet.js?v=79";
import { FRIENDS } from "./economy-config.js?v=79";

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
  let previews = new Map(); // friend_id → aperçu (avatar, tenue, vitrine) de list_friends_preview
  const miniCache = new Map(); // friend_id → { key, canvas } : l'avatar déjà dessiné n'est pas refait à chaque relecture
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
      setCachedPseudo(data.pseudo); // l'image de partage affiche ce pseudo
      // Aperçu des amis (migration 0017). Si elle n'est pas exécutée, la liste reste simple.
      try {
        previews = new Map((await listFriendsPreview()).map((p) => [p.friend_id, p]));
      } catch {
        previews = new Map();
      }
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
      row.setAttribute("aria-label", `Voir le profil de ${f.pseudo}`);
      const preview = previews.get(f.friend_id);
      if (preview) row.classList.add("friend-row-rich");
      if (preview) row.append(miniAvatar(f.friend_id, preview));
      const info = el("span", "friend-info");
      info.append(el("span", "friend-name", f.pseudo));
      if (preview) info.append(miniShowcase(preview.showcase));
      row.append(info, el("span", "friend-chevron", "›"));
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

  // --- Aperçus en mini dans la liste -------------------------------------------------------

  /** Avatar 3D en mini (de trois quarts, immobile). Redessiné seulement si sa tenue ou son avatar changent. */
  function miniAvatar(friendId, preview) {
    const key = `${preview.avatar_body}|${JSON.stringify(preview.equipped)}`;
    const cached = miniCache.get(friendId);
    if (cached && cached.key === key) return cached.tile;
    const tile = el("span", "friend-mini");
    const canvas = el("canvas", "pixel friend-mini-canvas");
    canvas.width = 46;
    canvas.height = 88;
    tile.append(canvas);
    miniCache.set(friendId, { key, tile });
    const worn = {};
    for (const slot of SLOTS) {
      const value = preview.equipped?.[slot.id];
      const colorway = value && catalogue.colorwayById.get(value.split("|")[0]);
      if (colorway) worn[slot.id] = colorway;
    }
    // La grille de voxels est lourde : on dessine puis on la libère (pas de createAvatar3D ici).
    buildModel(worn, { type: preview.avatar_body === "femme" ? "femme" : "homme" })
      .then((grid) => renderModel(canvas, grid, DEFAULT_YAW))
      .catch((err) => console.error("Aperçu ami :", err));
    return tile;
  }

  /** Les cartes de la vitrine en mini (sprite sur case claire, contour de la couleur de rareté). */
  function miniShowcase(cards) {
    const wrap = el("span", "friend-showcase");
    const shown = (cards || []).filter((c) => catalogue.colorwayById.has(c.colorway_id));
    if (!shown.length) {
      wrap.append(el("span", "friend-showcase-empty", "Vitrine vide"));
      return wrap;
    }
    for (const c of shown) {
      const colorway = catalogue.colorwayById.get(c.colorway_id);
      const tile = el("span", "friend-card");
      tile.dataset.rarity = c.rarity;
      tile.title = `${colorway.piece.name} · ${getRarity(c.rarity).name}`;
      const img = el("img", "pixel");
      img.src = colorway.sprite;
      img.width = 32;
      img.height = 32;
      img.alt = "";
      img.loading = "lazy";
      tile.append(img);
      wrap.append(tile);
    }
    return wrap;
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

    // Page de profil complète (migration 0014) ; si elle n'est pas encore activée sur le
    // serveur, on retombe sur l'ancienne vue (tenue à plat + progression).
    let full = null;
    try {
      full = await getPlayerProfile(friend.friend_id);
    } catch (err) {
      if (!/pas encore activée/.test(err.message)) {
        sheet.hidden = true;
        reportError(err);
        return;
      }
    }
    if (full) {
      body.replaceChildren(buildProfileView(full, catalogue, { showName: false }), removeFriendActions(friend));
      return;
    }

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

    nodes.push(removeFriendActions(friend));
    body.replaceChildren(...nodes);
  }

  /** Bouton « Retirer cet ami » : 2 touchers pour éviter l'erreur. */
  function removeFriendActions(friend) {
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
    return actions;
  }

  // --- Mise à jour ---------------------------------------------------------------------

  load({ silent: true });
  window.addEventListener("hashchange", () => { if (location.hash === "#friends") load(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load({ silent: true }); });
  // Relecture régulière (surtout pour la pastille « demandes reçues »).
  setInterval(() => { if (!document.hidden) load({ silent: true }); }, 45000);
  if (location.hash === "#friends") load();
}
