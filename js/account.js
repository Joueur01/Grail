// account.js — supprimer son compte (bouton en bas du profil).
//
// ⚠️ Le SERVEUR fait tout (migration 0025, `delete_my_account`) : ce fichier ne fait que demander une
// confirmation claire (il faut écrire SUPPRIMER), appeler le serveur, puis effacer la session du navigateur
// et revenir à l'écran de connexion. Irréversible.

import { deleteAccount } from "./api.js?v=93";
import { stopAnalytics } from "./analytics.js?v=93";
import { reportError } from "./wallet.js?v=93";

const WORD = "SUPPRIMER";
export const DELETED_FLAG = "grail_account_deleted"; // lu par main.js pour afficher « compte supprimé »

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Efface ce que ce site garde dans le navigateur (session de connexion, préférences). */
function clearLocalData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("sb-") || key.startsWith("grail_")) localStorage.removeItem(key);
    }
  } catch {
    // stockage indisponible : sans importance
  }
}

export function setupAccountDeletion() {
  const button = document.getElementById("btn-delete-account");
  const sheet = document.getElementById("card-sheet");
  const title = document.getElementById("card-sheet-title");
  const body = document.getElementById("card-sheet-body");
  if (!button) return;

  button.addEventListener("click", () => {
    title.textContent = "Supprimer mon compte";
    const intro = el("p", "sheet-subtitle", "Cette action est définitive. Elle ne peut pas être annulée.");
    const list = el("ul", "privacy-list account-list");
    for (const t of [
      "Ton compte (e-mail, mot de passe) et ton pseudo sont effacés.",
      "Toutes tes cartes, ton album, tes Ultimes, tes pièces, ta tenue et ta vitrine disparaissent.",
      "Tes ventes en cours au Market sont annulées et perdues.",
      "Tu quittes la liste d'amis de tes amis.",
      "Les liens de tenue que tu as partagés cessent de fonctionner.",
      "Les statistiques d'usage liées à ton compte sont effacées.",
    ]) list.append(el("li", "", t));
    const label = el("label", "auth-label", `Pour confirmer, écris ${WORD} :`);
    const input = el("input", "auth-input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "characters";
    input.setAttribute("aria-label", `Écris ${WORD} pour confirmer`);
    label.append(input);
    const note = el("p", "auth-message", "");
    note.hidden = true;
    note.dataset.kind = "error";
    const actions = el("div", "sheet-actions");
    const confirm = el("button", "btn btn-danger", "Supprimer définitivement");
    confirm.type = "button";
    confirm.disabled = true;
    const cancel = el("button", "btn", "Annuler");
    cancel.type = "button";
    actions.append(confirm, cancel);

    input.addEventListener("input", () => { confirm.disabled = input.value.trim().toUpperCase() !== WORD; });
    cancel.addEventListener("click", () => { sheet.hidden = true; });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      cancel.disabled = true;
      note.hidden = true;
      try {
        stopAnalytics(); // plus aucun événement envoyé au nom de ce compte
        await deleteAccount(WORD);
        clearLocalData();
        try { sessionStorage.setItem(DELETED_FLAG, "1"); } catch { /* sans importance */ }
        location.href = location.pathname; // retour à l'écran de connexion (la session n'existe plus)
      } catch (err) {
        note.textContent = err?.message || "Impossible de supprimer le compte. Réessaie plus tard.";
        note.hidden = false;
        confirm.disabled = input.value.trim().toUpperCase() !== WORD;
        cancel.disabled = false;
        reportError(err);
      }
    });

    body.replaceChildren(intro, list, label, note, actions);
    sheet.hidden = false;
  });
}
