"""Crée le sprite « Ultime » de chaque modèle (20 PNG 32×32).

Principe : on garde la silhouette et le contour exacts de la pièce, les
détails communs à tous les coloris (pigeon, fermetures…) et on recolore le
reste dans un style unique « Ultime » : corps noir obsidienne avec un
reflet nacré en diagonale, accents holographiques (le dégradé de couleur
change en diagonale). Seul le Pigeon Social Club garde ses détails communs
(le pigeon garde toujours ses couleurs).

Utilisation (depuis la racine du dépôt) :
  python3 tools/creer_ultimes.py
Sortie : assets/pieces/<piece_id>_ultime.png (un sprite par modèle, 20 au total).
Le 3D (js/avatar3d.js) relit ces sprites et ajoute son propre reflet irisé.
"""
import colorsys, json, sys
from pathlib import Path
from PIL import Image

RACINE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
SORTIE = Path(sys.argv[2]) if len(sys.argv) > 2 else RACINE / "assets/pieces"

# Teintes du corps, du plus sombre au plus clair (obsidienne bleutée).
CORPS = [(22, 20, 34), (34, 31, 52), (48, 44, 72), (66, 62, 96), (92, 88, 128)]
# Dégradé holographique des accents (cyan → violet → rose → or pâle).
HOLO = [(90, 230, 230), (120, 160, 255), (190, 120, 255), (255, 120, 210), (255, 200, 140), (150, 255, 190)]


def lum(c):
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255


def sat(c):
    return colorsys.rgb_to_hsv(*(v / 255 for v in c[:3]))[1]


def holo(x, y, clair):
    """Couleur holographique selon la diagonale (x + y)."""
    t = ((x + y) / 64 * len(HOLO)) % len(HOLO)
    i = int(t); f = t - i
    a, b = HOLO[i], HOLO[(i + 1) % len(HOLO)]
    c = [a[k] + (b[k] - a[k]) * f for k in range(3)]
    # un peu plus sombre si le pixel d'origine était sombre
    k = 0.65 + 0.35 * clair
    return tuple(int(v * k) for v in c)


def creer(piece, garder_fixes):
    imgs = [Image.open(RACINE / cw["sprite"]).convert("RGBA") for cw in piece["colorways"]]
    base = imgs[0]
    px = [im.load() for im in imgs]
    out = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    o = out.load()
    # pixels qui changent d'un coloris à l'autre : ceux qu'on recolore
    variables = []
    for y in range(32):
        for x in range(32):
            p = px[0][x, y]
            if p[3] == 0:
                continue
            identique = all(q[x, y] == p for q in px[1:])
            contour = lum(p) < 0.16
            if contour and identique:
                o[x, y] = p
            elif identique and garder_fixes and len(px) > 1:
                o[x, y] = p  # détail commun (le pigeon garde ses couleurs)
            else:
                variables.append((x, y))
    # couleur dominante (corps) de chaque coloris
    from collections import Counter
    dominants = []
    for im in px:
        cnt = Counter(im[x, y][:3] for x, y in variables)
        dominants.append(cnt.most_common(1)[0][0] if cnt else (0, 0, 0))
    lums = [lum(px[0][x, y]) for x, y in variables]
    lo, hi = (min(lums), max(lums)) if lums else (0, 1)
    for x, y in variables:
        accent = False
        for im, dom in zip(px, dominants):
            c = im[x, y]
            # accent = vraie couleur différente du corps (pas un simple
            # reflet plus clair de la même teinte, comme les textures usées)
            hc = colorsys.rgb_to_hsv(*(v / 255 for v in c[:3]))
            hd = colorsys.rgb_to_hsv(*(v / 255 for v in dom))
            dh = min(abs(hc[0] - hd[0]), 1 - abs(hc[0] - hd[0]))
            if hc[1] > 0.45 and hc[2] > 0.35 and (dh > 0.08 or hd[1] < 0.25):
                accent = True
        p = px[0][x, y]
        l = (lum(p) - lo) / (hi - lo) if hi > lo else 0.5
        if accent:
            o[x, y] = holo(x, y, l) + (255,)
        else:
            n = min(len(CORPS) - 1, int(l * len(CORPS)))
            # reflet nacré : une bande en diagonale éclaircit le corps d'un cran
            if (x - y + 64) % 22 in (0, 1, 2):
                n = min(len(CORPS) - 1, n + 1)
                o[x, y] = tuple((a * 3 + b) // 4 for a, b in zip(CORPS[n], holo(x, y, 1))) + (255,)
            else:
                o[x, y] = CORPS[n] + (255,)
    return out


def main():
    cat = json.loads((RACINE / "data/pieces.json").read_text(encoding="utf-8"))
    SORTIE.mkdir(parents=True, exist_ok=True)
    for piece in cat["pieces"]:
        # seuls les détails communs du Pigeon Social Club (le pigeon) sont
        # gardés tels quels ; ailleurs, les détails dorés / orange passent
        # aussi en holographique.
        im = creer(piece, garder_fixes=piece["brand"] == "pigeon_social_club")
        im.save(SORTIE / f"{piece['id']}_ultime.png")
        print("ok", piece["id"])


if __name__ == "__main__":
    main()
