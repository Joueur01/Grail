// catalog.js — noms lisibles des marques, modèles et coloris (lus une fois dans data/pieces.json du jeu).

let cat = null;
export async function loadNames() {
  if (cat) return cat;
  cat = { brands: {}, pieces: {}, colorways: {}, pieceOf: {} };
  try {
    const data = await (await fetch("data/pieces.json?v=105")).json();
    for (const b of data.brands) cat.brands[b.id] = b.name;
    for (const p of data.pieces) {
      cat.pieces[p.id] = { name: p.name, brand: p.brand };
      for (const c of p.colorways) {
        cat.colorways[c.id] = { name: `${p.name} · ${c.name}`, brand: p.brand };
        cat.pieceOf[c.id] = p.id;
      }
    }
  } catch {
    // sans catalogue, on affiche les identifiants
  }
  return cat;
}
export const brandName = (id) => cat?.brands[id] || id || "—";
/** Nom d'un modèle (« Shell « Relais » ») ; un Ultime « <modèle>_ultime » donne « … (Ultime) ». */
export function pieceName(id) {
  if (!id) return "—";
  if (cat?.pieces[id]) return cat.pieces[id].name;
  if (id.endsWith("_ultime") && cat?.pieces[id.slice(0, -7)]) return `${cat.pieces[id.slice(0, -7)].name} (Ultime)`;
  return id;
}
export function colorwayName(id) {
  if (!id) return "—";
  if (cat?.colorways[id]) return cat.colorways[id].name;
  return pieceName(id);
}
export const brandOfPiece = (id) => cat?.pieces[id]?.brand || cat?.pieces[String(id).replace(/_ultime$/, "")]?.brand || null;
export const brandOfColorway = (id) => cat?.colorways[id]?.brand || brandOfPiece(id);
