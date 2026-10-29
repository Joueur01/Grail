#!/usr/bin/env node
/*
 * Dessine l'image d'aperçu des liens (WhatsApp, Snapchat, iMessage, Discord…) : assets/brand/og-image.png.
 *
 * 1200 × 630 px (le format attendu par les messageries), faite uniquement avec des éléments du jeu :
 * le titre en Archivo (la police du jeu), trois sprites du catalogue et l'avatar 3D de l'accueil
 * (assets/ui/accueil-avatar.png). Aucune image générée par IA, aucune marque réelle.
 *
 * Utilisation : node tools/creer_apercu_og.js
 * Demande Playwright (déjà installé dans l'environnement de Claude) et un accès à Google Fonts.
 * Tous les agrandissements de pixel art sont des facteurs entiers (section 4 de CLAUDE.md).
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");

const RACINE = path.resolve(__dirname, "..");
const SORTIE = path.join(RACINE, "assets", "brand", "og-image.png");

// [sprite, couleur de rareté] : un exemple de chaque rareté visible, comme sur les cartes du jeu.
const CARTES = [
  ["pigeon_social_club_hoodie_dalle_moutarde", "#4d8dff"],     // Rare
  ["halvane_manteau_atelier_camel_or", "#a56bff"],              // Épique
  ["orbite_2000_veste_satellite_chrome_violet", "#f2c230"],     // Légendaire
];

const cartes = CARTES.map(([sprite, couleur]) =>
  `<div class="carte" style="border-color:${couleur}"><img src="file://${RACINE}/assets/pieces/${sprite}.png" alt=""></div>`
).join("");

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #0f0f11; color: #f2f1ee;
         font-family: "Archivo", sans-serif; position: relative; overflow: hidden; }
  img { image-rendering: pixelated; display: block; }
  .titre { position: absolute; left: 72px; top: 64px; font-size: 150px; font-weight: 900;
           font-stretch: 125%; letter-spacing: 0.01em; line-height: 1; }
  .phrase { position: absolute; left: 76px; top: 244px; font-size: 40px; font-weight: 700; line-height: 1.3; }
  .cartes { position: absolute; left: 76px; top: 424px; display: flex; gap: 20px; }
  .carte { width: 132px; height: 132px; background: #cccac4; border: 6px solid; border-radius: 16px;
           display: grid; place-items: center; }
  .carte img { width: 96px; height: 96px; }
  .adresse { position: absolute; left: 76px; top: 572px; font-size: 26px; font-weight: 700; color: #8f8d88; }
  .cadre { position: absolute; right: 72px; top: 64px; width: 330px; height: 502px; background: #242429;
           border: 1px solid #2c2c33; border-radius: 24px; display: grid; place-items: center; }
  .cadre img { width: 230px; height: 440px; }
</style></head>
<body>
  <div class="titre">GRAIL</div>
  <div class="phrase">Ouvre des boosters.<br>Habille ton avatar.<br>Passe le Videur.</div>
  <div class="cartes">${cartes}</div>
  <div class="adresse">huntgrail.eu</div>
  <div class="cadre"><img src="file://${RACINE}/assets/ui/accueil-avatar.png" alt=""></div>
</body></html>`;

(async () => {
  const page_html = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "og-")), "apercu.html");
  fs.writeFileSync(page_html, html);
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto("file://" + page_html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: SORTIE });
  await navigateur.close();
  console.log("écrit :", SORTIE);
})();
