// effects.js — petits effets de l'ouverture de booster : sons, vibrations, particules.
//
// Les sons sont SYNTHÉTISÉS par le navigateur (Web Audio) : aucun fichier,
// aucun service externe. Sur iPhone, ils sont coupés si le téléphone est en
// mode silencieux, comme tous les sons de jeux.

// Mettre à false pour couper tous les sons du jeu.
const SONS_ACTIFS = true;

let audio = null; // créé au premier toucher (les navigateurs l'exigent)

function ctx() {
  if (!SONS_ACTIFS) return null;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    return audio;
  } catch {
    return null; // pas de son sur cet appareil : tant pis, le jeu continue
  }
}

/** Joue une note (fréquence en Hz) avec une petite enveloppe de volume. */
function note(a, freq, start, duration, { type = "triangle", volume = 0.08 } = {}) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(a.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Bruit de déchirure : un souffle de bruit blanc filtré, qui faiblit. */
function rip(a, start) {
  const length = Math.floor(a.sampleRate * 0.35);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2200;
  filter.Q.value = 0.8;
  const gain = a.createGain();
  gain.gain.value = 0.25;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(start);
}

/** Joue le son d'un moment de l'ouverture. */
export function playSound(kind) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime;
  switch (kind) {
    case "tear": rip(a, t); break;
    case "flip": note(a, 520, t, 0.08, { type: "square", volume: 0.03 }); break;
    case "rare": [660, 880].forEach((f, i) => note(a, f, t + i * 0.08, 0.25)); break;
    case "epique": [523, 659, 784, 1047].forEach((f, i) => note(a, f, t + i * 0.09, 0.45)); break;
    case "legendaire":
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => note(a, f, t + i * 0.1, 0.7, { volume: 0.09 }));
      [1047, 1319, 1568].forEach((f) => note(a, f, t + 0.7, 1.4, { type: "sine", volume: 0.05 }));
      break;
    case "charge": note(a, 180, t, 0.5, { type: "sawtooth", volume: 0.025 }); break;
  }
}

/** Vibre si le téléphone le permet (Android ; Safari sur iPhone ne vibre pas). */
export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignoré
  }
}

/**
 * Gerbe de particules carrées (façon pixels) qui partent d'un point de l'écran.
 * - x, y : centre en pixels de l'écran ; color : couleur CSS ; count : nombre
 */
export function burst(x, y, color, count = 16, spread = 140) {
  const layer = document.createElement("div");
  layer.className = "fx-layer";
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "fx-particle";
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random() * 0.6);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = i % 3 === 0 ? "#f2f1ee" : color;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    p.style.animationDelay = `${Math.random() * 80}ms`;
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1200);
}
