// main.js — point d'entrée : connexion, navigation entre écrans et initialisation.
//
// ⚠️ Le jeu n'est accessible que connecté. Les données et les règles sont sur le SERVEUR
// (Supabase) : le front affiche ce que le serveur renvoie. Ne jamais remettre de logique de
// jeu côté client.
//
// ?v=… sur les imports : même numéro que dans index.html, et le même partout
// (un module importé sous deux adresses différentes serait chargé deux fois).

import { loadCatalogue } from "./data.js?v=105";
import { setupCollection, refreshState, clearLocalSave } from "./inventory.js?v=105";
import { initAvatar, setupOutfit } from "./avatar.js?v=105";
import { setupSavedOutfits } from "./outfits.js?v=105";
import { setupBooster } from "./booster.js?v=105";
import { setupShare } from "./share.js?v=105";
import { setupUpgrade } from "./upgrade.js?v=105";
import { setupAtelier, setupViewSwitch } from "./atelier.js?v=105";
import { setupAlbum } from "./album.js?v=105";
import { setupBadges } from "./badges.js?v=105";
import { setupPrivacy } from "./privacy.js?v=105";
import { setupSheetBack } from "./sheet-back.js?v=105";
import { setupAccountDeletion, DELETED_FLAG } from "./account.js?v=105";
import { setupWallet, reportError, showToast } from "./wallet.js?v=105";
import { setupReputation } from "./reputation.js?v=105";
import { setupDiscard, createSelection } from "./discard.js?v=105";
import { setupMarket } from "./market.js?v=105";
import { setupFriends } from "./friends.js?v=105";
import { setupVideur } from "./videur.js?v=105";
import { setupProfile } from "./profile.js?v=105";
import { setupRules } from "./rules.js?v=105";
import { setupStarterKit } from "./starter.js?v=105";
import { startAnalytics, track, setScreen } from "./analytics.js?v=105";
import { showSharedOutfit } from "./shared-outfit.js?v=105";
import { isAdmin, getSession, signIn, signUp, signOut, supabase, requestPasswordReset, updatePassword, isRecoveryLink, endRecovery, sharedOutfitToken } from "./api.js?v=105";

// « profile » et « friends » n'ont pas d'onglet : on y va par les boutons ronds en haut (#profile, #friends). « rules » non plus : par le profil ou un lien « ? » (#rules, #rules/market…).
const SCREENS = ["booster", "collection", "market", "videur", "friends", "avatar", "profile", "rules"];

/** Affiche l'écran demandé et met à jour l'onglet actif. */
function showScreen(name) {
  if (!SCREENS.includes(name)) name = SCREENS[0];
  track("screen_view", { screen: name }); // statistiques d'usage (ignoré tant que le joueur n'est pas connecté)
  setScreen(name); // le « ping » de 30 s portera cet écran (temps passé par écran)
  for (const section of document.querySelectorAll(".screen")) {
    section.hidden = section.dataset.screen !== name;
  }
  for (const tab of document.querySelectorAll(".tab, .profile-button, .friends-button")) {
    if (tab.dataset.tab === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
}

// La navigation passe par l'ancre de l'URL (#booster, #collection, #avatar) :
// simple, et le bouton « retour » du téléphone fonctionne tout seul.
function currentScreenFromHash() {
  return location.hash.replace("#", "").split("/")[0]; // « rules/market » → « rules » (la suite désigne une section)
}

// Safari sur iPhone ignore « user-scalable=no » pour le pincement à deux doigts :
// on bloque donc ce geste directement (événement propre à Safari).
function blockPinchZoom() {
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}

// --- Écran de connexion / création de compte ---------------------------------------

/**
 * Panneau affiché dans l'écran de connexion :
 * "main" (connexion / création de compte), "reset" (mot de passe oublié),
 * "recovery" (choisir un nouveau mot de passe, depuis le lien reçu par e-mail).
 */
function showPanel(name) {
  document.body.dataset.auth = "out";
  document.getElementById("auth-form").hidden = name !== "main";
  document.getElementById("reset-form").hidden = name !== "reset";
  document.getElementById("recovery-form").hidden = name !== "recovery";
  document.querySelector(".auth-card .view-switch").hidden = name !== "main";
  document.getElementById("auth-intro").hidden = name !== "main";
}

/** Montre l'écran de connexion (le jeu reste caché tant qu'on n'est pas connecté). */
// Mémorise (sur cet appareil seulement) qu'un compte existe : l'écran propose alors « Connexion » d'abord.
const KNOWN_KEY = "grail_has_account";
const hasAccount = () => { try { return !!localStorage.getItem(KNOWN_KEY); } catch { return false; } };
const rememberAccount = () => { try { localStorage.setItem(KNOWN_KEY, "1"); } catch { /* navigation privée : sans importance */ } };

function showAuth({ message = "", tab = hasAccount() ? "signin" : "signup", kind = "ok" } = {}) {
  showPanel("main");
  const form = document.getElementById("auth-form");
  const tabs = document.querySelectorAll(".auth-tab");
  const submit = document.getElementById("auth-submit");
  const note = document.getElementById("auth-message");
  const password = document.getElementById("auth-password");
  const forgot = document.getElementById("auth-forgot");
  let mode = tab;

  const setMode = (m) => {
    mode = m;
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.mode === m));
    submit.textContent = m === "signin" ? "Se connecter" : "Créer mon compte";
    password.autocomplete = m === "signin" ? "current-password" : "new-password";
    forgot.hidden = m !== "signin"; // « mot de passe oublié » n'a de sens qu'à la connexion
  };
  const say = (text, kind = "") => { note.textContent = text; note.dataset.kind = kind; note.hidden = !text; };

  setMode(mode);
  say(message, kind);
  forgot.onclick = () => {
    // L'adresse déjà tapée est reprise dans le formulaire « mot de passe oublié ».
    document.getElementById("reset-email").value = document.getElementById("auth-email").value.trim();
    showPanel("reset");
  };
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
        rememberAccount();
        if (needsConfirmation) {
          // Compte créé : il faut cliquer le lien reçu par e-mail avant de pouvoir se connecter.
          setMode("signin");
          password.value = "";
          say("Compte créé. Confirme ton e-mail : clique sur le lien que tu viens de recevoir, puis connecte-toi ici.", "ok");
          return;
        }
      } else {
        await signIn(email, pass);
        rememberAccount();
      }
      // Connecté : le jeu démarre (onAuthStateChange ci-dessous).
    } catch (err) {
      say(err.message, "error");
    } finally {
      submit.disabled = false;
    }
  };
}

// --- Mot de passe oublié -------------------------------------------------------------

let recovering = false; // le joueur doit d'abord choisir un nouveau mot de passe

/** Branche les formulaires « mot de passe oublié » et « nouveau mot de passe ». */
function setupPasswordRecovery() {
  const $ = (id) => document.getElementById(id);
  const sayIn = (id, text, kind = "") => { const n = $(id); n.textContent = text; n.dataset.kind = kind; n.hidden = !text; };

  $("reset-back").onclick = () => showAuth();
  $("recovery-back").onclick = () => { recovering = false; endRecovery(); showPanel("reset"); };

  // 1. Demander le lien par e-mail
  $("reset-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("reset-email").value.trim();
    if (!email) { sayIn("reset-message", "Entre ton adresse e-mail.", "error"); return; }
    $("reset-submit").disabled = true;
    sayIn("reset-message", "");
    try {
      await requestPasswordReset(email);
      // Même réponse que le compte existe ou non : on ne révèle pas quelles adresses ont un compte.
      sayIn("reset-message", "Si un compte existe avec cette adresse, un e-mail vient d'être envoyé. Pense à regarder tes courriers indésirables.", "ok");
    } catch (err) {
      sayIn("reset-message", err.message, "error");
    } finally {
      $("reset-submit").disabled = false;
    }
  };

  // 2. Choisir le nouveau mot de passe (arrivée par le lien de l'e-mail)
  $("recovery-form").onsubmit = async (e) => {
    e.preventDefault();
    const pass = $("recovery-password").value;
    if (pass.length < 6) { sayIn("recovery-message", "Mot de passe trop court (6 caractères minimum).", "error"); return; }
    if (pass !== $("recovery-confirm").value) { sayIn("recovery-message", "Les deux mots de passe ne sont pas identiques.", "error"); return; }
    $("recovery-submit").disabled = true;
    sayIn("recovery-message", "");
    try {
      await updatePassword(pass);
      recovering = false;
      endRecovery();
      showToast("Mot de passe modifié.");
      history.replaceState(null, "", location.pathname); // retire les jetons de l'adresse
      boot();
    } catch (err) {
      sayIn("recovery-message", err.message, "error");
    } finally {
      $("recovery-submit").disabled = false;
    }
  };
}

/** Écran « nouveau mot de passe », sans le jeu derrière. */
function showRecovery() {
  recovering = true;
  showPanel("recovery");
}

// --- Le jeu --------------------------------------------------------------------------

let booted = false;

/** Démarre le jeu : relit l'état du joueur sur le serveur, puis branche tous les écrans. */
async function boot() {
  if (booted) return;
  booted = true;
  delete document.body.dataset.auth;
  startAnalytics(); // mesure d'usage anonyme (rétention) : ouverture du jeu, écrans, temps actif
  track("screen_view", { screen: currentScreenFromHash() || SCREENS[0] });
  clearLocalSave(); // l'ancienne sauvegarde du navigateur n'est plus utilisée
  initAvatar(document.getElementById("avatar-canvas"));
  setupAccountDeletion(); // « Supprimer mon compte » (bas du profil)
  // Bouton « Panel admin » (bas du profil) : seulement si le serveur dit que ce compte est administrateur.
  isAdmin().then((ok) => { document.getElementById("admin-link").hidden = ok !== true; }).catch(() => {});
  document.getElementById("btn-signout").addEventListener("click", async () => {
    await signOut();
    location.reload();
  });
  const statusEl = document.getElementById("booster-status");

  try {
    statusEl.textContent = "Chargement…";
    const [catalogue] = await Promise.all([loadCatalogue(), refreshState()]);
    setupWallet(); // solde en haut de l'écran + bonus de connexion quotidien (décidé par le serveur)
    setupReputation(); // anneau de réputation autour du bouton profil (le Flow devient une réputation)
    // La tenue prévient le partage à chaque changement (image préparée à l'avance).
    const updateShare = setupShare();
    let lastOutfit = null; // l'événement « tenue changée » ne part que quand la tenue change vraiment
    let refreshSaved = null; // tenues enregistrées : la mention « Portée » suit la tenue portée
    const refreshOutfit = setupOutfit({ catalogue, onChange: (outfit) => {
      updateShare(outfit);
      refreshSaved?.();
      const key = Object.entries(outfit).map(([slot, o]) => `${slot}:${o.colorway.id}|${o.rarity}`).sort().join(",");
      if (lastOutfit !== null && key !== lastOutfit) track("outfit_change", { pieces: Object.keys(outfit).length });
      lastOutfit = key;
    } });
    // Tenues enregistrées (migration 0036) : en remettre une (ici ou au Videur) redessine l'écran Tenue.
    refreshSaved = setupSavedOutfits({ catalogue, container: document.getElementById("saved-outfits"), onWorn: () => refreshOutfit() });
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
    // Album (définitif) : une carte placée quitte la collection ; un modèle complet donne son Ultime.
    const refreshAlbum = setupAlbum({ catalogue, onChange: () => { refreshCards(); refreshOutfit(); } });
    setupViewSwitch();
    let market = null; // Market (créé en dernier) : redessiné avec la collection
    const refreshCards = () => { refreshCollection(); refreshAtelier(); refreshAlbum(); market?.render(); };
    setupBooster({ catalogue, onOpened: refreshCards });
    // Market entre joueurs (géré par le serveur) : acheter, vendre, mes ventes.
    market = setupMarket({ catalogue, onChange });
    // Amis : pseudo, demandes, liste, tenue d'un ami (géré par le serveur).
    setupFriends({ catalogue });
    // Videur : tour de niveaux (Bar N → Club N → VIP N), ou l'ancien Videur sans la migration 0032 (serveur).
    setupVideur({ catalogue });
    setupBadges(); // pastilles de la barre du bas : boosters à ouvrir, Videur pas encore joué
    setupProfile({ catalogue }); // page de profil (bouton rond en haut)
    setupRules({ catalogue }); // page « Règles du jeu » : taux de drop et spécificités
    // Kit de départ : une marque au choix (4 pièces Communes + boosters offerts), une seule fois par compte.
    setupStarterKit({ catalogue, onClaimed: onChange }).check();
  } catch (err) {
    console.error(err);
    statusEl.textContent = err?.message || "Impossible de charger le jeu. Recharge la page.";
    reportError(err);
  }
}

/** Après une suppression de compte, l'écran de connexion confirme que tout a été effacé (une seule fois). */
function takeDeletedMessage() {
  try {
    if (sessionStorage.getItem(DELETED_FLAG)) {
      sessionStorage.removeItem(DELETED_FLAG);
      return { message: "Ton compte a été supprimé. Toutes tes données ont été effacées.", kind: "ok" };
    }
  } catch {
    // stockage indisponible : sans importance
  }
  return {};
}

async function start() {
  blockPinchZoom();
  setupPrivacy(); // politique de confidentialité : liens utilisables partout, même sans compte
  setupSheetBack(); // bouton « retour » du téléphone : ferme la fiche ouverte au lieu de changer d'écran
  window.addEventListener("hashchange", () => showScreen(currentScreenFromHash()));
  showScreen(currentScreenFromHash());

  let session = null;
  try {
    session = await getSession();
  } catch (err) {
    console.warn("Session :", err);
  }
  setupPasswordRecovery();
  // Lien de tenue partagée (?tenue=CODE) : page publique, sans compte requis.
  const outfitToken = sharedOutfitToken();
  if (outfitToken) {
    document.getElementById("public-cta").addEventListener("click", (e) => {
      e.preventDefault();
      location.href = location.pathname; // on retire ?tenue=… et on ouvre le jeu (ou la connexion)
    });
    showSharedOutfit(outfitToken, { signedIn: !!session });
    return;
  }
  const linkExpired = /error_code=otp_expired|error=access_denied/.test(location.hash);
  if (isRecoveryLink()) showRecovery();                // lien « mot de passe oublié » : nouveau mot de passe d'abord
  else if (session) { rememberAccount(); boot(); }
  else if (linkExpired) showAuth({ message: "Ce lien a expiré. Utilise « Mot de passe oublié ? » pour en recevoir un nouveau.", kind: "error" });
  else showAuth(takeDeletedMessage());

  // Connexion réussie (ou retour du lien de confirmation e-mail) : le jeu démarre.
  supabase.auth.onAuthStateChange((event, newSession) => {
    if (event === "PASSWORD_RECOVERY") { showRecovery(); return; }
    if (newSession && !booted && !recovering) boot();
    if (event === "SIGNED_OUT" && booted) location.reload();
  });
}

start();
