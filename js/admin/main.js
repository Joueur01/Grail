// main.js (admin) — point d'entrée du panel admin (admin.html), en LECTURE SEULE.
//
// Même connexion que le jeu (api.js, même session Supabase dans le navigateur). Le serveur décide qui est
// administrateur (is_admin) : sinon, la page n'affiche que « Accès réservé ». Même si quelqu'un modifiait ce
// fichier, les fonctions admin_* refusent tout appel d'un compte qui n'est pas dans la table admins.
//
// Navigation par l'ancre de l'URL (le bouton retour marche), période commune dans la partie « ?… » :
//   #overview?periode=30   Vue d'ensemble        #economy?periode=7     Économie
//   #players               Joueurs               #market?periode=tout   Market
//   #player/<id>           Fiche d'un joueur     #videur, #collection, #usage (+ ?du=…&au=…)

import { getSession, isAdmin, adminFirstDay } from "../api.js?v=105";
import { el } from "./format.js?v=105";
import { readPeriod, periodBar, setFirstDay } from "./period.js?v=105";
import { renderPlayers } from "./players.js?v=105";
import { renderPlayer } from "./player.js?v=105";
import { renderOverview } from "./overview.js?v=105";
import { renderEconomy } from "./economy.js?v=105";
import { renderMarket } from "./market.js?v=105";
import { renderVideur } from "./videur.js?v=105";
import { renderCollection } from "./collection.js?v=105";
import { renderUsage } from "./usage.js?v=105";

const view = document.getElementById("admin-view");
const nav = document.getElementById("admin-nav");
const playerTab = document.getElementById("tab-player");

// Onglets qui suivent la période choisie.
const PERIOD_TABS = {
  overview: { title: "Vue d'ensemble", render: renderOverview },
  economy: { title: "Économie", render: renderEconomy },
  market: { title: "Market", render: renderMarket },
  videur: { title: "Videur", render: renderVideur },
  collection: { title: "Collection", render: renderCollection },
  usage: { title: "Usage", render: renderUsage },
};

function denied() {
  document.body.dataset.state = "denied";
  view.replaceChildren(el("h1", "page-title denied", "Accès réservé"));
}

let lastQuery = "periode=30"; // période gardée d'un onglet à l'autre
let renderId = 0;

async function route() {
  const raw = location.hash.replace("#", "") || "overview";
  const [path, query = ""] = raw.split("?");
  const [name, arg] = path.split("/");
  const tab = name === "player" && arg ? "player" : name === "players" ? "players" : PERIOD_TABS[name] ? name : "overview";
  if (PERIOD_TABS[tab] && query) lastQuery = query;

  // Les onglets à période gardent la période en cours dans leur lien.
  for (const a of nav.querySelectorAll("a")) {
    if (PERIOD_TABS[a.dataset.tab]) a.href = `#${a.dataset.tab}?${lastQuery}`;
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  playerTab.hidden = tab !== "player";
  if (tab === "player") playerTab.href = `#player/${arg}`;
  nav.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  window.scrollTo(0, 0);

  if (tab === "player") return renderPlayer(view, arg);
  if (tab === "players") return renderPlayers(view);

  const id = ++renderId;
  const p = readPeriod(lastQuery);
  const page = el("div", "tab-page");
  page.append(el("h1", "page-title", PERIOD_TABS[tab].title), periodBar(p, (q) => { location.hash = `#${tab}?${q}`; }));
  const body = el("div");
  body.append(el("p", "muted", "Chargement…"));
  page.append(body);
  view.replaceChildren(page);
  const content = el("div");
  try {
    await PERIOD_TABS[tab].render(content, p);
  } catch (e) {
    content.replaceChildren(el("p", "error-box", e.message || "Erreur"));
    console.error(e);
  }
  if (id === renderId) body.replaceWith(content); // un autre onglet a pu être ouvert entre-temps
}

async function start() {
  try {
    const session = await getSession();
    if (!session || (await isAdmin()) !== true) return denied();
  } catch {
    return denied();
  }
  // Premier jour du jeu pour la période « Tout » (migration 0040 ; sans elle : 90 derniers jours).
  try { setFirstDay(await adminFirstDay()); } catch { /* migration 0040 absente */ }
  document.body.dataset.state = "ready";
  nav.hidden = false;
  window.addEventListener("hashchange", route);
  route();
}

start();
