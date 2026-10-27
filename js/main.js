// main.js — point d'entrée : connexion, navigation entre écrans et initialisation.
//
// ⚠️ Le jeu n'est accessible que connecté. Les données et les règles sont sur le SERVEUR
// (Supabase) : le front affiche ce que le serveur renvoie. Ne jamais remettre de logique de
// jeu côté client.
//
// ?v=… sur les imports : même numéro que dans index.html, et le même partout
// (un module importé sous deux adresses différentes serait chargé deux fois).

import { loadCatalogue } from "./data.js?v=36";
import { setupCollection, refreshState, clearLocalSave } from "./inventory.js?v=36";
import { initAvatar, setupOutfit } from "./avatar.js?v=36";
import { setupBooster } from "./booster.js?v=36";
import { setupShare } from "./share.js?v=36";
import { setupUpgrade } from "./upgrade.js?v=36";
import { setupAtelier, setupViewSwitch } from "./atelier.js?v=36";
import { setupWallet, reportError } from "./wallet.js?v=36";
import { setupDiscard, createSelection } from "./discard.js?v=36";
import { setupMarket } from "./market.js?v=36";
import { setupFriends } from "./friends.js?v=36";
import { getSession, signIn, signUp, signOut, supabase } from "./api.js?v=36";

const SCREENS = ["booster", "collection", "market", "friends", "avatar"];

/** Affiche l'écran demandé et met à jour l'onglet actif. */
function showScreen(name) {
  if (!SCREENS.includes(name)) name = SCREENS[0];
  for (const section of document.querySelectorAll(".screen")) {
    section.hidden = section.dataset.screen !== name;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    if (tab.dataset.tab === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
}

// La navigation passe par l'ancre de l'URL (#booster, #collection, #avatar) :
// simple, et le bouton « retour » du téléphone fonctionne tout seul.
function currentScreenFromHash() {
  return location.hash.replace("#", "");
}

// Safari sur iPhone ignore « user-scalable=no » pour le pincement à deux doigts :
// on bloque donc ce geste directement (événement propre à Safari).
function blockPinchZoom() {
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}

// --- Écran de connexion / création de compte ---------------------------------------

/** Montre l'écran de connexion (le jeu reste caché tant qu'on n'est pas connecté). */
function showAuth({ message = "", tab = "signin" } = {}) {
  document.body.dataset.auth = "out";
  const form = document.getElementById("auth-form");
  const tabs = document.querySelectorAll(".auth-tab");
  const submit = document.getElementById("auth-submit");
  const note = document.getElementById("auth-message");
  const password = document.getElementById("auth-password");
  let mode = tab;

  const setMode = (m) => {
    mode = m;
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.mode === m));
    submit.textContent = m === "signin" ? "Se connecter" : "Créer mon compte";
    password.autocomplete = m === "signin" ? "current-password" : "new-password";
  };
  const say = (text, kind = "") => { note.textContent = text; note.dataset.kind = kind; note.hidden = !text; };

  setMode(mode);
  say(message, "ok");
  for (const t of tabs) t.onclick = () => { setMode(t.dataset.mode); say(""); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const pass = password.value;
    submit.disabled = true;
    say("");
    try {
      if (mode === "signup") {
        const { needsConfirmation } = await signUp(email, pass);
        if (needsConfirmation) {
          // Compte créé : il faut cliquer le lien reçu par e-mail avant de pouvoir se connecter.
          setMode("signin");
          password.value = "";
          say("Compte créé. Confirme ton e-mail : clique sur le lien que tu viens de recevoir, puis connecte-toi ici.", "ok");
          return;
        }
      } else {
        await signIn(email, pass);
      }
      // Connecté : le jeu démarre (onAuthStateChange ci-dessous).
    } catch (err) {
      say(err.message, "error");
    } finally {
      submit.disabled = false;
    }
  };
}

// --- Le jeu --------------------------------------------------------------------------

let booted = false;

/** Démarre le jeu : relit l'état du joueur sur le serveur, puis branche tous les écrans. */
async function boot() {
  if (booted) return;
  booted = true;
  delete document.body.dataset.auth;
  clearLocalSave(); // l'ancienne sauvegarde du navigateur n'est plus utilisée
  initAvatar(document.getElementById("avatar-canvas"));
  document.getElementById("btn-signout").addEventListener("click", async () => {
    await signOut();
    location.reload();
  });
  const statusEl = document.getElementById("booster-status");

  try {
    statusEl.textContent = "Chargement…";
    const [catalogue] = await Promise.all([loadCatalogue(), refreshState()]);
    setupWallet(); // solde en haut de l'écran + bonus de connexion quotidien (décidé par le serveur)
    // La tenue prévient le partage à chaque changement (image préparée à l'avance).
    const refreshOutfit = setupOutfit({ catalogue, onChange: setupShare() });
    // Après une action (roue, défausse, vente…), collection, Atelier, Market et tenue sont redessinés.
    const onChange = () => { refreshCards(); refreshOutfit(); };
    // Défausse (plusieurs cartes contre des pièces) : ouverte depuis la fiche ou l'Atelier.
    const discard = setupDiscard({ catalogue, onChange });
    const upgrade = setupUpgrade({ catalogue, onChange, onDiscard: (colorwayId, rarity) => discard.openCard(colorwayId, rarity) });
    // Mode « Sélectionner » : choisir plusieurs cartes parmi toute la collection, puis défausser.
    const selection = createSelection({ catalogue, onChange });
    const refreshCollection = setupCollection({ catalogue, onCardTap: (card) => upgrade.openCard(card), selection });
    selection.bind(refreshCollection);
    // Atelier (par modèle + rareté) : toucher une ligne ouvre la roue, mise pré-remplie.
    const refreshAtelier = setupAtelier({ catalogue, onRowTap: (piece, rarity) => upgrade.openModel(piece, rarity),
      onRowDiscard: (piece, rarity) => discard.openModel(piece, rarity),
      // « Sélectionner des cartes » : on passe à la Collection, mode sélection activé.
      onDiscardAll: () => {
        document.querySelector('.view-tab[data-view="collection"]').click();
        selection.setActive(true);
      },
    });
    setupViewSwitch();
    let market = null; // Market (créé en dernier) : redessiné avec la collection
    const refreshCards = () => { refreshCollection(); refreshAtelier(); market?.render(); };
    setupBooster({ catalogue, onOpened: refreshCards });
    // Market entre joueurs (géré par le serveur) : acheter, vendre, mes ventes.
    market = setupMarket({ catalogue, onChange });
    // Amis : pseudo, demandes, liste, tenue d'un ami (géré par le serveur).
    setupFriends({ catalogue });
  } catch (err) {
    console.error(err);
    statusEl.textContent = err?.message || "Impossible de charger le jeu. Recharge la page.";
    reportError(err);
  }
}

async function start() {
  blockPinchZoom();
  window.addEventListener("hashchange", () => showScreen(currentScreenFromHash()));
  showScreen(currentScreenFromHash());

  let session = null;
  try {
    session = await getSession();
  } catch (err) {
    console.warn("Session :", err);
  }
  if (session) boot();
  else showAuth();

  // Connexion réussie (ou retour du lien de confirmation e-mail) : le jeu démarre.
  supabase.auth.onAuthStateChange((event, newSession) => {
    if (newSession && !booted) boot();
    if (event === "SIGNED_OUT" && booted) location.reload();
  });
}

start();
