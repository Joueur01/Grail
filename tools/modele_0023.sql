-- Grail — migration 0023 : 4 nouvelles marques (Ferrant & Fils, Brume, A.S. Faubourg 78, Orbite 2000).
-- Voir CLAUDE.md, section 5. À exécuter APRÈS la 0022 (SQL Editor de Supabase). Peut être relancée sans risque.
-- Fichier ÉCRIT par tools/ajouter_marques.py (à partir de tools/modele_0023.sql) : ne pas le modifier à la main.
--
-- Ajoute au catalogue du serveur : 4 marques, 28 pièces, 100 coloris (le catalogue passe à 175 coloris,
-- soit 700 cartes) et les étiquettes de couleur des nouveaux coloris (colorway_tags, pour le Videur).
--
-- Les migrations 0001 à 0004 (tables brands, pieces, colorways) ne sont pas dans le dépôt : on ne connaît
-- donc que leurs colonnes id / brand_id / slot / piece_id. Chaque ligne est donc créée en COPIANT une ligne
-- existante de la même table (pour une pièce : une pièce du même emplacement), puis en remplaçant les valeurs
-- ci-dessous ; les colonnes inconnues gardent la valeur de la ligne copiée. Si une colonne de ces tables
-- est nommée autrement que ci-dessous, vérifier les lignes ajoutées dans le Table Editor.
--
-- Effets : les nouveaux coloris entrent dans les tirages de boosters, la roue (« coloris au hasard parmi ceux du
-- modèle »), le Market et l'album (les 28 nouveaux Ultimes se gagnent comme les 20 premiers) SI les fonctions
-- du serveur lisent la table colorways (et non une liste écrite en dur).

do $$
declare
  data jsonb := '@@DONNEES@@'::jsonb;
  b jsonb; p jsonb; c jsonb;
begin
  -- Marques
  for b in select * from jsonb_array_elements(data -> 'brands') loop
    if not exists (select 1 from public.brands x where x.id = b ->> 'id') then
      insert into public.brands
      select (jsonb_populate_record(null::public.brands, to_jsonb(t) || b)).*
        from public.brands t order by t.id limit 1;
    end if;
  end loop;

  -- Pièces (le modèle copié est une pièce du même emplacement)
  for p in select * from jsonb_array_elements(data -> 'pieces') loop
    if not exists (select 1 from public.pieces x where x.id = p ->> 'id') then
      insert into public.pieces
      select (jsonb_populate_record(null::public.pieces, to_jsonb(t) || p)).*
        from public.pieces t
       where t.slot = p ->> 'slot' and t.id not in (select q ->> 'id' from jsonb_array_elements(data -> 'pieces') q)
       order by t.id limit 1;
    end if;
  end loop;

  -- Coloris
  for c in select * from jsonb_array_elements(data -> 'colorways') loop
    if not exists (select 1 from public.colorways x where x.id = c ->> 'id') then
      insert into public.colorways
      select (jsonb_populate_record(null::public.colorways, to_jsonb(t) || c)).*
        from public.colorways t
       where t.id not in (select q ->> 'id' from jsonb_array_elements(data -> 'colorways') q)
       order by t.id limit 1;
    end if;
  end loop;
end;
$$;

-- Étiquettes de couleur des nouveaux coloris (règles « palette » du Videur)
insert into public.colorway_tags (colorway_id, tags) values
@@TAGS@@
on conflict (colorway_id) do nothing;
