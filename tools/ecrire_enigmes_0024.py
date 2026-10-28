"""Écrit la migration 0024 : le Videur connaît les 4 marques de la 2e vague (Ferrant & Fils, Brume,
A.S. Faubourg 78, Orbite 2000). Voir CLAUDE.md, sections 5 et 16.

  * 4 dress codes du Bar (règles visibles) : un par marque ;
  * 8 énigmes du Club et 8 du VIP (règles CACHÉES) : deux par marque et par porte.

Chaque énigme est vérifiée RÉALISABLE avant d'être écrite : une recherche aléatoire trouve une tenue
(un coloris par emplacement au plus, une rareté au choix) qui respecte tous les critères. Les étiquettes de
couleur viennent de la migration 0012 (anciens coloris) et de tools/ajouter_marques.py (nouveaux coloris).

Utilisation (depuis la racine du dépôt) :  python3 tools/ecrire_enigmes_0024.py
"""

import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ajouter_marques import MARQUES, catalogue_marque, tags_coloris  # noqa: E402

RACINE = Path(__file__).resolve().parent.parent
POINTS = {"commun": 1, "rare": 3, "epique": 6, "legendaire": 10}   # VIDEUR.rarityPoints (0012)
EMPLACEMENTS = ["tete", "cou", "haut", "veste", "sac", "bas", "chaussures"]

NOMS = {"ferrant_fils": "Ferrant & Fils", "brume": "Brume", "faubourg_78": "A.S. Faubourg 78", "orbite_2000": "Orbite 2000"}
# Indices vagues par critère (même ton sec que les énigmes de la 0013) ; l'indice de marque ne la nomme pas.
INDICE_MARQUE = {
    "ferrant_fils": "T'as jamais bossé de tes mains.",
    "brume": "Tu sors jamais de la ville, toi.",
    "faubourg_78": "T'as pas l'air de supporter grand monde.",
    "orbite_2000": "Il manque de l'éclat, ce soir.",
}
# Critères réutilisables : (type, paramètres, libellé révélé à la fin, indice vague)
def marque(m, n=2):
    return {"type": "brand", "brand": m, "min": n, "weight": 0, "label": f"Au moins {n} pièces {NOMS[m]}", "hint": INDICE_MARQUE[m]}
def meme_marque():
    return {"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d'une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}
def palette(tags, n, label, hint):
    return {"type": "palette", "tags": tags, "min": n, "weight": 0, "label": label, "hint": hint}
def interdit(tag, label, hint):
    return {"type": "forbid_tag", "tag": tag, "weight": 0, "label": label, "hint": hint}
def emplacement(slot, label, hint):
    return {"type": "slot", "slot": slot, "weight": 0, "label": label, "hint": hint}
def sans(slot, label, hint):
    return {"type": "no_slot", "slot": slot, "weight": 0, "label": label, "hint": hint}
COMPLET = {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}
def pieces_min(n):
    return {"type": "min_pieces", "min": n, "weight": 0, "label": f"Au moins {n} pièces portées", "hint": "Sois plus habillé."}
def rarete_min(n):
    return {"type": "rarity_min", "min": n, "weight": 0, "label": f"Au moins {n} points de rareté", "hint": "Ça sent pas la pièce rare."}
def rarete_max(n):
    return {"type": "rarity_max", "max": n, "weight": 0, "label": f"Pas plus de {n} points de rareté", "hint": "Pas besoin de tout montrer."}

CHAUD = lambda n: palette(["chaud"], n, f"Au moins {n} pièces aux tons chauds", "Ça manque de chaleur.")
FROID = lambda n: palette(["froid"], n, f"Au moins {n} pièces aux tons froids", "Ça manque de fraîcheur.")
CLAIR = lambda n: palette(["clair"], n, f"Au moins {n} pièces claires", "Trop sombre pour moi.")
SOMBRE = lambda n: palette(["sombre"], n, f"Au moins {n} pièces sombres", "Il fait nuit dehors, t'as pas vu ?")
NEUTRE = lambda n: palette(["neutre"], n, f"Au moins {n} pièces neutres", "Ça part dans tous les sens.")
TERRE = lambda n: palette(["terre"], n, f"Au moins {n} pièces aux tons terre", "Trop citadin.")
VIF = lambda n: palette(["vif"], n, "Au moins une touche de couleur vive" if n == 1 else f"Au moins {n} pièces de couleur vive", "C'est triste. Il manque un éclat.")
METAL = lambda n: palette(["metal"], n, "Au moins une pièce à reflet métal" if n == 1 else f"Au moins {n} pièces à reflet métal", "Pas un reflet, pas un éclat.")
SAC = emplacement("sac", "Un sac sur soi", "Tu viens les mains vides ?")
TETE = emplacement("tete", "Un couvre-chef sur la tête", "T'as la tête nue.")
COU = emplacement("cou", "Une écharpe au cou", "T'as pas froid au cou ?")
VESTE = emplacement("veste", "Une veste par-dessus", "Il y a un courant d'air.")
SANS_SAC = sans("sac", "Pas de sac", "Tu traînes trop de choses.")

# Dress codes du Bar (règles visibles, poids = 100)
BAR = [
    ("Bleu de travail", "Le Bar ouvre ses portes aux ouvriers. Workwear, du solide.",
     [dict(marque("ferrant_fils"), weight=40), dict(palette(["terre", "neutre"], 3, "Au moins 3 pièces neutres ou aux tons terre", ""), weight=30), dict(COMPLET, weight=30)]),
    ("Sortie en forêt", "Au Bar, ce soir, on reste dehors. Outdoor, couleurs douces.",
     [dict(marque("brume"), weight=40), dict(palette(["froid", "neutre"], 3, "Au moins 3 pièces neutres ou aux tons froids", ""), weight=30), dict(COMPLET, weight=30)]),
    ("Match à domicile", "Le Bar fête le championnat. Aux couleurs du club.",
     [dict(marque("faubourg_78"), weight=40), dict(TETE, weight=30), dict(COMPLET, weight=30)]),
    ("Nuit chromée", "Le Bar passe en mode soirée. Chrome et éclats.",
     [dict(marque("orbite_2000"), weight=40), dict(palette(["metal", "vif"], 2, "Au moins 2 pièces chromées ou de couleur vive", ""), weight=30), dict(COMPLET, weight=30)]),
]
for _, _, regles in BAR:
    for r in regles:
        r.pop("hint", None)

# Énigmes cachées : 2 par marque et par porte (le dernier critère est un seuil de rareté).
CLUB = [
    [marque("ferrant_fils"), TERRE(2), SAC, rarete_min(9)],
    [marque("ferrant_fils"), interdit("vif", "Aucune couleur vive", "Trop flashy."), COMPLET, rarete_max(14)],
    [marque("brume"), FROID(2), TETE, rarete_min(9)],
    [marque("brume"), CLAIR(2), SANS_SAC, rarete_max(12)],
    [marque("faubourg_78"), VIF(1), COU, rarete_min(10)],
    [marque("faubourg_78"), SOMBRE(2), COMPLET, rarete_max(13)],
    [marque("orbite_2000"), METAL(1), TETE, rarete_min(9)],
    [marque("orbite_2000"), VIF(2), VESTE, rarete_max(12)],
]
VIP = [
    [meme_marque(), marque("ferrant_fils"), NEUTRE(3), VESTE, rarete_min(18)],
    [marque("ferrant_fils", 3), interdit("vif", "Aucune couleur vive", "Trop flashy."), COMPLET, TETE, rarete_min(16)],
    [meme_marque(), marque("brume"), FROID(2), pieces_min(5), rarete_min(18)],
    [marque("brume", 3), CLAIR(2), SAC, COMPLET, rarete_min(17)],
    [meme_marque(), marque("faubourg_78"), VIF(2), COU, rarete_min(18)],
    [marque("faubourg_78", 3), SOMBRE(2), COMPLET, TETE, rarete_min(17)],
    [meme_marque(), marque("orbite_2000"), METAL(2), SAC, rarete_min(20)],
    [marque("orbite_2000", 3), VIF(2), COMPLET, TETE, rarete_min(18)],
]


def charger_coloris():
    """[{slot, brand, tags}] pour les 175 coloris (étiquettes : 0012 pour les anciens, calcul pour les nouveaux)."""
    catalogue = json.loads((RACINE / "data/pieces.json").read_text(encoding="utf-8"))
    tags = {}
    for m in re.finditer(r"\('([a-z0-9_]+)', array\[([^\]]*)\]\)", (RACINE / "supabase/migrations/0012_videur.sql").read_text(encoding="utf-8")):
        tags[m.group(1)] = set(re.findall(r"'([a-z]+)'", m.group(2)))
    liste = []
    for p in catalogue["pieces"]:
        for c in p["colorways"]:
            t = tags.get(c["id"]) or set(tags_coloris(c["name"]))
            liste.append({"slot": p["slot"], "brand": p["brand"], "tags": t})
    return liste


def evaluer(regles, tenue, points):
    nb = len(tenue)
    for r in regles:
        t = r["type"]
        if t == "brand": ok = sum(1 for x in tenue if x["brand"] == r["brand"]) >= r["min"]
        elif t == "same_brand": ok = nb >= r["min"] and len({x["brand"] for x in tenue}) == 1
        elif t == "min_brands": ok = len({x["brand"] for x in tenue}) >= r["min"]
        elif t == "palette": ok = sum(1 for x in tenue if x["tags"] & set(r["tags"])) >= r["min"]
        elif t == "forbid_tag": ok = not any(r["tag"] in x["tags"] for x in tenue)
        elif t == "complete": ok = {x["slot"] for x in tenue} >= {"haut", "bas", "chaussures"}
        elif t == "slot": ok = any(x["slot"] == r["slot"] for x in tenue)
        elif t == "no_slot": ok = not any(x["slot"] == r["slot"] for x in tenue)
        elif t == "min_pieces": ok = nb >= r["min"]
        elif t == "max_pieces": ok = nb <= r["max"]
        elif t == "rarity_min": ok = points >= r["min"]
        elif t == "rarity_max": ok = points <= r["max"]
        else: ok = False
        if not (ok and nb > 0):
            return False
    return True


def realisable(regles, coloris, essais=300000):
    """Cherche une tenue valide au hasard ; la rareté est choisie pour viser le seuil (min : le plus haut possible)."""
    rng = random.Random(7)
    par_slot = {s: [c for c in coloris if c["slot"] == s] for s in EMPLACEMENTS}
    vise_haut = any(r["type"] == "rarity_min" for r in regles)
    for _ in range(essais):
        # une fois sur deux, toute la tenue vient d'une seule marque (les énigmes « même marque » sinon trop rares)
        marque_unique = rng.choice(sorted({c["brand"] for c in coloris})) if rng.random() < 0.5 else None
        tenue = []
        for s in EMPLACEMENTS:
            choix = [c for c in par_slot[s] if marque_unique in (None, c["brand"])]
            if choix and rng.random() < 0.85:
                tenue.append(rng.choice(choix))
        if not tenue:
            continue
        points = len(tenue) * (10 if vise_haut else 1)
        if evaluer(regles, tenue, points):
            return True
    return False


def sql_texte(valeur):
    return valeur.replace("'", "''")


def main():
    coloris = charger_coloris()
    for liste, nom in ((CLUB, "Club"), (VIP, "VIP")):
        for i, regles in enumerate(liste):
            if not realisable(regles, coloris):
                raise SystemExit(f"Énigme {nom} #{i + 1} irréalisable : {[r['label'] for r in regles]}")
    print(f"{len(CLUB)} énigmes du Club et {len(VIP)} du VIP vérifiées réalisables.")
    lignes_bar = ",\n".join(
        f"  ('bar', '{sql_texte(nom)}', '{sql_texte(intro)}', '{sql_texte(json.dumps(regles, ensure_ascii=False))}'::jsonb)"
        for nom, intro, regles in BAR)
    def enigmes(porte, liste, depart):
        return ",\n".join(
            f"  ('{porte}', '{porte.upper() if porte == 'vip' else 'Club'} {depart + i}', '{sql_texte(json.dumps(r, ensure_ascii=False))}'::jsonb)"
            for i, r in enumerate(liste))
    sortie = f"""-- Grail — migration 0024 : le Videur connaît les 4 marques de la 2e vague. Voir CLAUDE.md, section 16.
-- À exécuter APRÈS la 0023 (SQL Editor de Supabase). Peut être relancée sans risque.
-- Fichier ÉCRIT par tools/ecrire_enigmes_0024.py : ne pas le modifier à la main.
--
-- Ajoute : 4 dress codes du Bar (un par marque, règles visibles) et 8 énigmes du Club + 8 du VIP
-- (règles CACHÉES : deux par marque et par porte). Chaque énigme a été vérifiée réalisable.
-- L'énigme du jour avance d'un cran par jour dans la liste (cycle = nombre d'énigmes actives : 28 par porte
-- au lieu de 20) : la rotation d'aujourd'hui peut donc changer une seule fois, le jour de la migration.

insert into public.videur_codes (door, name, intro, rules) values
{lignes_bar}
on conflict (door, name) do nothing;

insert into public.videur_riddles (door, name, rules) values
{enigmes('club', CLUB, 21)},
{enigmes('vip', VIP, 21)}
on conflict (door, name) do nothing;
"""
    (RACINE / "supabase/migrations/0024_videur_nouvelles_marques.sql").write_text(sortie, encoding="utf-8")
    print("Migration 0024 écrite.")


if __name__ == "__main__":
    main()
