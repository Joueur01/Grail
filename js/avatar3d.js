// avatar3d.js — l'avatar en 3D (voxels), qu'on fait tourner en glissant le doigt.
//
// Principe :
//   1. On construit une grille de petits cubes (voxels) : le corps de base, puis
//      chaque pièce portée qui a un modèle (wear-models.js), dans l'ordre de dessin.
//      Les couleurs de chaque pièce sont lues dans le sprite 32 × 32 du coloris.
//   2. Pour dessiner, on lance un rayon par pixel du canvas (petit : 46 × 88, recadré sur l'avatar) à
//      travers la grille ; le premier cube touché donne la couleur, assombrie
//      selon l'orientation de sa face. Puis un contour noir d'1 pixel, comme les
//      sprites. Le canvas est agrandi d'un facteur entier en CSS : rendu pixel art.
//   Aucune bibliothèque : tout est calculé ici, en JavaScript.

import { getBody, BODY_COLOR, DRAW_ORDER, WEAR_MODELS } from "./wear-models.js?v=57";

// --- La grille ---
const GX = 48, GY = 84, GZ = 48;      // taille en voxels
const OX = 24, OZ = 24;               // décalage : x = -24 → colonne 0
const OUTLINE = [20, 20, 26];         // couleur du contour (celle des sprites)
const PITCH = 0.2;                    // la caméra regarde un peu vers le bas (radians)
const DEFAULT_YAW = 0.5;               // vue de trois quarts au départ
const CENTER_Y = 38;                  // hauteur autour de laquelle on cadre

function idx(x, y, z) { return (y * GZ + (z + OZ)) * GX + (x + OX); }

// --- Lecture des sprites (pixels + infos utiles), mise en cache ---
const spriteCache = new Map();

function loadSpriteData(src) {
  if (!spriteCache.has(src)) {
    spriteCache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const cctx = c.getContext("2d");
        cctx.drawImage(img, 0, 0);
        resolve(analyseSprite(cctx.getImageData(0, 0, c.width, c.height)));
      };
      img.onerror = reject;
      img.src = src;
    }));
  }
  return spriteCache.get(src);
}

/**
 * Prépare un sprite : couleur de chaque pixel (ou null si transparent) et
 * repère le CONTOUR extérieur (pixels du trait noir collés au vide). Ce contour
 * n'est pas repris en 3D : le rendu redessine son propre contour.
 */
function analyseSprite({ data, width, height }) {
  const px = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const i = (y * width + x) * 4;
    return data[i + 3] > 0 ? [data[i], data[i + 1], data[i + 2]] : null;
  };
  // Couleur du trait : la plus fréquente parmi les pixels collés au vide.
  const counts = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = px(x, y);
      if (!c) continue;
      if (!px(x - 1, y) || !px(x + 1, y) || !px(x, y - 1) || !px(x, y + 1)) {
        const key = c.join();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  const outlineKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const isEdge = (x, y) => {
    const c = px(x, y);
    if (!c || c.join() !== outlineKey) return false;
    return !px(x - 1, y) || !px(x + 1, y) || !px(x, y - 1) || !px(x, y + 1);
  };
  /** Couleur « utile » d'un pixel : null si vide ou si c'est le contour extérieur. */
  const color = (x, y) => (isEdge(x, y) ? null : px(x, y));
  return { width, height, color, outlineKey };
}

/**
 * Couleur dominante d'une zone du sprite (sans le trait noir).
 * Renvoie { c: [r, g, b], share: part de la zone qu'elle occupe } ou null.
 */
function dominant(sprite, x0, w, y0, h = 1) {
  const counts = new Map();
  let total = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const c = sprite.color(x, y);
      if (!c || c.join() === sprite.outlineKey) continue;
      const key = c.join();
      if (!counts.has(key)) counts.set(key, { c, n: 0 });
      counts.get(key).n++;
      total++;
    }
  }
  let best = null;
  for (const v of counts.values()) if (!best || v.n > best.n) best = v;
  return best && { c: best.c, share: best.n / total };
}

/** Couleur dominante d'une ligne du sprite entre les colonnes x0 et x0+w. */
function rowColor(sprite, x0, w, y) {
  return dominant(sprite, x0, w, y)?.c || null;
}

/**
 * Couleur du dos et des côtés pour une ligne : celle de la ligne si c'est une
 * vraie bande (ourlet, poignet : 75 % de la ligne au moins), sinon la couleur
 * principale de la pièce (pas de logo ni de poche dans le dos).
 */
function backColor(sprite, [sx, sy, sw, sh], y) {
  const row = dominant(sprite, sx, sw, y);
  if (row && row.share >= 0.75) return row.c;
  return dominant(sprite, sx, sw, sy, sh)?.c || row?.c || null;
}

/**
 * Correspondance « voxel → pixel du sprite » sur un axe, en gardant les bords
 * à l'échelle 1 : keepA pixels au début et keepB à la fin sont copiés tels
 * quels (ourlet, poignet…), seul le milieu est étiré ou resserré.
 * i : position dans le bloc (0 … n-1) ; m : taille de la zone du sprite.
 */
function mapAxis(i, n, m, keepA, keepB) {
  if (keepA + keepB >= n) return Math.min(m - 1, Math.floor((i * m) / n));
  if (i < keepA) return i;
  if (i >= n - keepB) return m - (n - i);
  const midN = n - keepA - keepB;
  const midM = m - keepA - keepB;
  return keepA + Math.floor(((i - keepA) * midM) / midN);
}

// --- Construction de la grille ---

/** Un modèle prêt à dessiner : la grille de couleurs (0 = vide). */
function newGrid() {
  return new Int32Array(GX * GY * GZ);
}

function setVoxel(grid, x, y, z, rgb) {
  if (x < -OX || x >= GX - OX || z < -OZ || z >= GZ - OZ || y < 0 || y >= GY) return;
  grid[idx(x, y, z)] = (1 << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

/** Pavé : la coque extérieure seulement (l'intérieur garde le corps). */
function paintBox(grid, part, sprite) {
  const [x0, x1, y0, y1, z0, z1] = part.box;
  const w = x1 - x0, h = y1 - y0;
  const [top = 0, bottom = 0, left = 0, right = 0] = part.keep || [];
  // Partie du corps (sans sprite) : sa couleur propre ; pièce : couleur lue dans le sprite.
  // Si le pixel demandé est vide ou sur le trait, on retombe sur la couleur principale de la pièce.
  const plain = sprite
    ? (part.plain ? sprite.color(...part.plain) || dominant(sprite, 0, sprite.width, 0, sprite.height)?.c || BODY_COLOR : null)
    : (part.color || BODY_COLOR);

  /** Couleur de façade au voxel (colonne i, ligne j depuis le haut). */
  function frontColor(i, j) {
    if (plain || !sprite) return plain || BODY_COLOR;
    const [sx, sy, sw, sh] = part.front;
    let u = mapAxis(i, w, sw, left, right);
    if (part.flipX) u = sw - 1 - u;
    const v = mapAxis(j, h, sh, top, bottom);
    return sprite.color(sx + u, sy + v) || rowColor(sprite, sx, sw, sy + v) || BODY_COLOR;
  }
  /** Couleur du dos et des côtés : bandes gardées, logos et poches retirés. */
  function plainColor(j) {
    if (plain || !sprite) return plain || BODY_COLOR;
    const [, sy, , sh] = part.front;
    return backColor(sprite, part.front, sy + mapAxis(j, h, sh, top, bottom)) || BODY_COLOR;
  }

  for (let y = y0; y < y1; y++) {
    const j = y1 - 1 - y; // ligne comptée depuis le haut du bloc
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const onX = x === x0 || x === x1 - 1;
        const onZ = z === z0 || z === z1 - 1;
        const onY = y === y1 - 1 || y === y0;
        if (!onX && !onZ && !onY) continue; // intérieur : on garde ce qu'il y a dessous
        if (part.round && onX && onZ) continue; // coin vertical arrondi
        let color;
        if (z === z1 - 1) color = frontColor(x - x0, j);
        else color = plainColor(j);
        setVoxel(grid, x, y, z, color);
      }
    }
  }
}

/** Volume tourné (bonnet…) : chaque ligne du sprite → une tranche arrondie. */
function paintLathe(grid, part, sprite) {
  const [sx, sy, sw, sh] = part.rect;
  const [cx, cz] = part.center;
  const scale = part.scale || 1;
  // Lignes utiles du sprite (du bas vers le haut), puis une tranche par voxel de
  // hauteur : le bonnet est réduit à la même échelle en largeur et en hauteur.
  const rows = [];
  for (let row = sy + sh - 1; row >= sy; row--) {
    for (let x = sx; x < sx + sw; x++) if (sprite.color(x, row)) { rows.push(row); break; }
  }
  const height = Math.round(rows.length * scale);
  for (let j = 0; j < height; j++) {
    const row = rows[Math.min(rows.length - 1, Math.floor(j / scale))];
    const y = part.y0 + j;
    let a = -1, b = -1;
    for (let x = sx; x < sx + sw; x++) {
      if (sprite.color(x, row)) { if (a < 0) a = x; b = x; }
    }
    const half = ((b - a + 1) * scale) / 2;
    const plain = backColor(sprite, [a, sy, b - a + 1, sh], row);
    const r = Math.ceil(half);
    for (let z = -r; z < r; z++) {
      for (let x = -r; x < r; x++) {
        // « Super-ellipse » : forme entre le carré et le rond (aspect voxel).
        const nx = (x + 0.5) / half, nz = (z + 0.5) / half;
        if (nx ** 4 + nz ** 4 > 1) continue;
        let color = plain;
        if (z >= 0) {
          // Face avant : on projette le dessin du sprite.
          const u = Math.min(b, a + Math.floor(((x + half) / (2 * half)) * (b - a + 1)));
          color = sprite.color(u, row) || plain;
        }
        if (color) setVoxel(grid, cx + x, y, cz + z, color);
      }
    }
  }
}

/** Silhouette de profil extrudée sur la largeur (chaussures). */
function paintProfile(grid, part, sprite) {
  const [sx, sy, sw, sh] = part.rect;
  const s = part.scale || 1;
  const len = Math.round(sw * s), hgt = Math.round(sh * s);
  const [x0, x1] = part.x;
  for (let j = 0; j < hgt; j++) {
    const row = sy + sh - 1 - Math.floor(j / s); // du bas vers le haut
    for (let i = 0; i < len; i++) {
      const col = sx + Math.floor(i / s); // le sprite regarde vers la droite = vers l'avant
      const color = sprite.color(col, row);
      if (!color) continue;
      for (let x = x0; x < x1; x++) {
        setVoxel(grid, x, part.y0 + j, part.z0 + i, color);
      }
    }
  }
}

const PAINTERS = { box: paintBox, lathe: paintLathe, profile: paintProfile };

/**
 * Construit la grille pour une tenue.
 * - pieces : { emplacement: coloris du catalogue } (pièces portées)
 * Les pièces sans modèle 3D sont ignorées ici (l'écran les signale).
 */
export async function buildModel(pieces, { type = "homme", skin = "moyenne" } = {}) {
  const grid = newGrid();
  for (const part of getBody(type, skin)) paintBox(grid, part, null);
  for (const slot of DRAW_ORDER) {
    const colorway = pieces[slot];
    const model = colorway && WEAR_MODELS[colorway.piece.id];
    if (!model) continue;
    const sprite = await loadSpriteData(colorway.sprite);
    for (const part of model) {
      const cover = pieces[part.hiddenBy];
      if (cover && WEAR_MODELS[cover.piece.id]) continue;
      PAINTERS[part.type](grid, part, sprite);
    }
  }
  return grid;
}

// --- Rendu : un rayon par pixel ---

/**
 * Dessine la grille vue sous l'angle yaw (radians) dans le canvas.
 * Projection orthographique (pas de perspective) : 1 voxel ≈ 1 pixel.
 */
export function renderModel(canvas, grid, yaw) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(W, H);
  const out = image.data;
  const depth = new Float32Array(W * H).fill(Infinity);
  const filled = new Uint8Array(W * H);

  // Repère de la caméra : d = direction du regard, r = droite, u = haut.
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const d = [-sy * cp, -sp, -cy * cp];
  const r = [cy, 0, -sy];
  const u = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
  // Lumière venant d'en haut à gauche de la caméra (elle tourne avec la vue).
  const L = norm([-0.45 * r[0] + 0.8 * u[0] - 0.55 * d[0], -0.45 * r[1] + 0.8 * u[1] - 0.55 * d[1], -0.45 * r[2] + 0.8 * u[2] - 0.55 * d[2]]);

  const far = 60; // départ du rayon, loin devant le personnage
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const a = px + 0.5 - W / 2, b = H / 2 - py - 0.5;
      // Origine dans le repère de la grille (x et z décalés, y absolu)
      const ox = a * r[0] + b * u[0] - far * d[0] + OX;
      const oy = a * r[1] + b * u[1] - far * d[1] + CENTER_Y;
      const oz = a * r[2] + b * u[2] - far * d[2] + OZ;
      const hit = castRay(grid, ox, oy, oz, d);
      if (!hit) continue;
      const k = py * W + px;
      filled[k] = 1;
      depth[k] = hit.t;
      const n = hit.normal;
      const light = 0.64 + 0.36 * Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const c = hit.color;
      out[k * 4] = ((c >> 16) & 255) * light;
      out[k * 4 + 1] = ((c >> 8) & 255) * light;
      out[k * 4 + 2] = (c & 255) * light;
      out[k * 4 + 3] = 255;
    }
  }

  // Contours : trait sombre là où une surface passe derrière une autre (bras
  // devant le buste…), puis contour noir d'1 pixel autour de la silhouette.
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const k = py * W + px;
      if (!filled[k]) continue;
      const near = [k - 1, k + 1, k - W, k + W].some((m, i) =>
        (i === 0 ? px > 0 : i === 1 ? px < W - 1 : i === 2 ? py > 0 : py < H - 1)
        && filled[m] && depth[m] < depth[k] - 2.5);
      if (near) for (let ch = 0; ch < 3; ch++) out[k * 4 + ch] *= 0.55;
    }
  }
  const edge = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const k = py * W + px;
      if (filled[k]) continue;
      if ((px > 0 && filled[k - 1]) || (px < W - 1 && filled[k + 1])
        || (py > 0 && filled[k - W]) || (py < H - 1 && filled[k + W])) edge[k] = 1;
    }
  }
  for (let k = 0; k < W * H; k++) {
    if (!edge[k]) continue;
    out[k * 4] = OUTLINE[0]; out[k * 4 + 1] = OUTLINE[1]; out[k * 4 + 2] = OUTLINE[2]; out[k * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Parcours d'un rayon dans la grille, cube par cube (algorithme « DDA »).
 * Renvoie { color, normal, t } du premier cube plein, ou null.
 */
function castRay(grid, ox, oy, oz, d) {
  // Entrée dans la boîte de la grille
  let tmin = 0, tmax = Infinity, axis = 2;
  const o = [ox, oy, oz], size = [GX, GY, GZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < 0 || o[i] > size[i]) return null;
      continue;
    }
    let t1 = (0 - o[i]) / d[i], t2 = (size[i] - o[i]) / d[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) { tmin = t1; axis = i; } // face d'entrée dans la grille
    tmax = Math.min(tmax, t2);
  }
  if (tmin >= tmax) return null;
  const t0 = tmin + 1e-4;
  let x = Math.floor(ox + d[0] * t0), y = Math.floor(oy + d[1] * t0), z = Math.floor(oz + d[2] * t0);
  const stepX = d[0] > 0 ? 1 : -1, stepY = d[1] > 0 ? 1 : -1, stepZ = d[2] > 0 ? 1 : -1;
  const dX = Math.abs(1 / d[0]), dY = Math.abs(1 / d[1]), dZ = Math.abs(1 / d[2]);
  let tX = d[0] > 0 ? (x + 1 - ox) / d[0] : d[0] < 0 ? (x - ox) / d[0] : Infinity;
  let tY = d[1] > 0 ? (y + 1 - oy) / d[1] : d[1] < 0 ? (y - oy) / d[1] : Infinity;
  let tZ = d[2] > 0 ? (z + 1 - oz) / d[2] : d[2] < 0 ? (z - oz) / d[2] : Infinity;
  let t = tmin;
  while (x >= 0 && y >= 0 && z >= 0 && x < GX && y < GY && z < GZ) {
    const c = grid[(y * GZ + z) * GX + x];
    if (c) {
      const normal = [0, 0, 0];
      normal[axis] = axis === 0 ? -stepX : axis === 1 ? -stepY : -stepZ;
      return { color: c, normal, t };
    }
    if (tX < tY && tX < tZ) { x += stepX; t = tX; tX += dX; axis = 0; }
    else if (tY < tZ) { y += stepY; t = tY; tY += dY; axis = 1; }
    else { z += stepZ; t = tZ; tZ += dZ; axis = 2; }
  }
  return null;
}

// --- La vue interactive : glisser pour tourner ---

/**
 * Branche un canvas 3D. Renvoie { setOutfit(pieces) }.
 * Glisser horizontalement fait tourner l'avatar (avec un peu d'élan au lâcher).
 */
export function createAvatar3D(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  let grid = null;
  let yaw = DEFAULT_YAW;
  let velocity = 0;       // vitesse de rotation après le lâcher (radians par image)
  let frame = 0;          // requestAnimationFrame en cours
  let buildToken = 0;
  let drag = null;        // { x, yaw, lastX, lastT } pendant le glissement

  // Rotation par pixel CSS glissé : un glissement de la largeur du canvas ≈ un demi-tour.
  const radPerPx = () => Math.PI / Math.max(1, canvas.getBoundingClientRect().width);

  function draw() {
    frame = 0;
    if (!grid) return;
    if (!drag && Math.abs(velocity) > 0.002) {
      yaw += velocity;
      velocity *= 0.9;
      schedule();
    }
    renderModel(canvas, grid, yaw);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, yaw, lastX: e.clientX, lastT: e.timeStamp, speed: 0 };
    velocity = 0;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dt = Math.max(1, e.timeStamp - drag.lastT);
    drag.speed = (-(e.clientX - drag.lastX) * radPerPx()) / dt; // radians par ms
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
    // Glisser vers la droite tourne la face de l'avatar vers la droite.
    yaw = drag.yaw - (e.clientX - drag.x) * radPerPx();
    schedule();
  });
  const release = (e) => {
    if (!drag) return;
    // Élan seulement si le doigt bougeait encore au moment du lâcher.
    velocity = e.timeStamp - drag.lastT < 80 ? drag.speed * 16 : 0;
    drag = null;
    schedule();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  return {
    /**
     * Habille l'avatar : { emplacement: coloris } ; seules les pièces avec un modèle sont dessinées.
     * body : { type: "homme" | "femme", skin } (voir getBody).
     */
    async setOutfit(pieces, body) {
      const token = ++buildToken;
      const built = await buildModel(pieces, body);
      if (token !== buildToken) return; // une tenue plus récente a été demandée entre-temps
      grid = built;
      schedule();
    },
  };
}
