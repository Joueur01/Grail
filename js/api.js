// api.js — SEUL point de contact avec le serveur (Supabase).
//
// Le serveur est la source de vérité : le navigateur LIT ses données (profil, inventaire,
// offres du Market) et demande les actions par des fonctions (RPC). Il n'écrit jamais
// directement dans les tables et ne décide jamais d'un tirage, d'un gain ou d'une
// amélioration. Ne remettre AUCUNE logique de jeu ici ni ailleurs côté client.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js?v=36";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// --- Erreurs lisibles ------------------------------------------------------------

/** Erreur à afficher telle quelle au joueur (message en français). */
export class ApiError extends Error {}

/** Messages du serveur déjà en français : on les garde. Le reste devient un message générique. */
function friendlyMessage(error) {
  const msg = String(error?.message || error || "");
  if (/failed to fetch|networkerror|load failed|network request failed|fetch/i.test(msg)) {
    return "Connexion impossible. Vérifie ta connexion et réessaie.";
  }
  if (/jwt|not authenticated|invalid refresh token/i.test(msg)) {
    return "Ta session a expiré. Reconnecte-toi.";
  }
  if (/could not find the function|schema cache/i.test(msg)) {
    return "Cette fonction n'est pas encore activée sur le serveur.";
  }
  if (/permission denied|violates|invalid input|syntax|duplicate key|could not find/i.test(msg)) {
    return "Une erreur est survenue. Réessaie dans un instant.";
  }
  return msg || "Une erreur est survenue. Réessaie dans un instant.";
}

/** Appelle une fonction du serveur et renvoie sa réponse (ou lève une ApiError lisible). */
async function rpc(name, args = {}) {
  let result;
  try {
    result = await supabase.rpc(name, args);
  } catch (err) {
    throw new ApiError(friendlyMessage(err));
  }
  if (result.error) throw new ApiError(friendlyMessage(result.error));
  return result.data;
}

/** Lecture directe d'une table ou d'une vue (le serveur ne renvoie que ce que le joueur a le droit de voir). */
async function read(query) {
  let result;
  try {
    result = await query;
  } catch (err) {
    throw new ApiError(friendlyMessage(err));
  }
  if (result.error) throw new ApiError(friendlyMessage(result.error));
  return result.data;
}

// --- Compte ----------------------------------------------------------------------

/** Crée un compte. needsConfirmation = true : le joueur doit confirmer son e-mail avant de se connecter. */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw new ApiError(authMessage(error));
  return { needsConfirmation: !data.session };
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new ApiError(authMessage(error));
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Messages de connexion en français. */
function authMessage(error) {
  const msg = String(error?.message || "");
  if (/invalid login credentials/i.test(msg)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(msg)) return "Confirme d'abord ton e-mail (lien reçu par courrier).";
  if (/already registered|already been registered/i.test(msg)) return "Un compte existe déjà avec cet e-mail. Connecte-toi.";
  if (/password.*(at least|short|characters)/i.test(msg)) return "Mot de passe trop court (6 caractères minimum).";
  if (/valid email|invalid email|unable to validate email/i.test(msg)) return "Adresse e-mail invalide.";
  if (/rate limit|too many/i.test(msg)) return "Trop de tentatives. Patiente un moment puis réessaie.";
  return friendlyMessage(error);
}

// --- Lectures directes (uniquement ses propres données) ----------------------------

export const getProfile = async () => read(supabase.from("profiles").select("*").maybeSingle());
export const getInventory = async () => read(supabase.from("inventory").select("colorway_id, rarity, count, locked"));
/** Mes ventes en cours (les ventes terminées ne sont pas utiles à l'écran). */
export const getMyListings = async () =>
  read(supabase.from("market_listings").select("id, colorway_id, rarity, price, created_at").eq("status", "active"));
/** L'offre la moins chère de chaque carte : { id, colorway_id, rarity, price, is_mine }. */
export const getBestOffers = async () =>
  read(supabase.from("market_best_offers").select("id, colorway_id, rarity, price, is_mine"));

// --- Actions (fonctions du serveur) -------------------------------------------------

/** { stock, max_stock, next_in_seconds, signature_next, until_signature, pity_legendary, pity_epic, coins, tutorial_done } */
export const getBoosterState = () => rpc("get_booster_state");
/** { cards: [{ colorway_id, rarity, forced, signature, is_new }], signature, pity_legendary, pity_epic } (déjà dans l'ordre de révélation) */
export const openBooster = () => rpc("open_booster");
/** p_stake = { "<colorway_id>": nombre } → { success, chance, roll, result: { colorway_id, rarity, is_new } | null } */
export const upgradeCards = (rarity, stake) => rpc("upgrade_cards", { p_rarity: rarity, p_stake: stake });
/** p_cards = [{ colorway_id, rarity, count }] → pièces gagnées */
export const discardCards = (cards) => rpc("discard_cards", { p_cards: cards });
/** → pièces gagnées (0 si le bonus du jour est déjà pris) */
export const claimDailyBonus = () => rpc("claim_daily_bonus");
export const setLocked = (colorway, rarity, locked) =>
  rpc("set_locked", { p_colorway: colorway, p_rarity: rarity, p_locked: locked });
/** colorway = null : vide l'emplacement */
export const setEquipped = (slot, colorway, rarity) =>
  rpc("set_equipped", { p_slot: slot, p_colorway: colorway, p_rarity: rarity });
export const setTutorialDone = () => rpc("set_tutorial_done");
/** → id de la vente */
export const marketList = (colorway, rarity, price) =>
  rpc("market_list", { p_colorway: colorway, p_rarity: rarity, p_price: price });
export const marketCancel = (id) => rpc("market_cancel", { p_id: id });
/** → { colorway_id, rarity, price } ; refuse si le prix a changé depuis l'affichage */
export const marketBuy = (id, expectedPrice) => rpc("market_buy", { p_id: id, p_expected_price: expectedPrice });
/** → [{ id, colorway_id, rarity, price }] : ventes terminées pas encore vues */
export const marketAckSales = () => rpc("market_ack_sales");

// --- Amis (migration 0005) ---------------------------------------------------------

/** Choisit ou change son pseudo (validé par le serveur : 3 à 16 caractères, unique, mots interdits). */
export const setPseudo = (pseudo) => rpc("set_pseudo", { p_pseudo: pseudo });
/** → { pseudo, friends: [{ id, friend_id, pseudo }], incoming: [{ id, pseudo }], outgoing: [{ id, pseudo }] } */
export const listFriends = () => rpc("list_friends");
/** Recherche par pseudo EXACT (pas de liste publique). → "pending" ou "accepted" */
export const friendRequest = (pseudo) => rpc("friend_request", { p_pseudo: pseudo });
export const friendRespond = (id, accept) => rpc("friend_respond", { p_id: id, p_accept: accept });
/** Annule une demande envoyée ou retire un ami. */
export const friendRemove = (id) => rpc("friend_remove", { p_id: id });
/** → { pseudo, equipped: { emplacement: "coloris|rareté" }, cards_owned, cards_total } (amis seulement) */
export const getFriendProfile = (friendId) => rpc("get_friend_profile", { p_friend: friendId });
