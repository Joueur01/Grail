// main.js (admin) — point d'entrée du panel admin (admin.html), en LECTURE SEULE.
//
// Même connexion que le jeu (api.js, même session Supabase dans le navigateur). Le serveur décide qui est
// administrateur (is_admin) : sinon, la page n'affiche que « Accès réservé ». Même si quelqu'un modifiait ce
// fichier, les fonctions admin_* refusent tout appel d'un compte qui n'est pas dans la table admins.
//
// Navigation par l'ancre de l'URL (le bouton retour marche) :
//   #overview            Vue d'ensemble (à venir)
//   #players             Joueurs
//   #player/<id>         Fiche d'un joueur

import { getSession, isAdmin } from "../api.js?v=104";
import { el } from "./format.js?v=104";
import { renderPlayers } from "./players.js?v=104";
import { renderPlayer } from "./player.js?v=104";

const view = document.getElementById("admin-view");
const nav = document.getElementById("admin-nav");
const playerTab = document.getElementById("tab-player");

function denied() {
  document.body.dataset.state = "denied";
  view.replaceChildren(el("h1", "page-title denied", "Accès réservé"));
}

function route() {
  const hash = location.hash.replace("#", "") || "players";
  const [name, arg] = hash.split("/");
  const tab = name === "player" && arg ? "player" : name === "overview" ? "overview" : "players";
  for (const a of nav.querySelectorAll("a")) {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  playerTab.hidden = tab !== "player";
  if (tab === "player") playerTab.href = `#player/${arg}`;
  window.scrollTo(0, 0);

  if (tab === "overview") {
    const box = el("div");
    box.append(el("h1", "page-title", "Vue d'ensemble"), el("p", "muted", "À venir."));
    view.replaceChildren(box);
  } else if (tab === "player") {
    renderPlayer(view, arg);
  } else {
    renderPlayers(view);
  }
}

async function start() {
  try {
    const session = await getSession();
    if (!session || (await isAdmin()) !== true) return denied();
  } catch {
    return denied();
  }
  document.body.dataset.state = "ready";
  nav.hidden = false;
  window.addEventListener("hashchange", route);
  route();
}

start();
