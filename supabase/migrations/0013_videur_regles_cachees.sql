-- Grail — migration 0013 : Videur à règles CACHÉES, par paliers de difficulté. Voir CLAUDE.md, section 16.
-- À exécuter APRÈS la 0012 (SQL Editor de Supabase). Peut être relancée sans risque
-- (elle ne touche ni aux essais déjà enregistrés ni au Flow).
--
--  * BAR   : règles VISIBLES (comme avant) : aperçu gratuit, jauges Style / Rareté. 3 essais par jour.
--  * CLUB  : règles CACHÉES. Après chaque essai : « X critères sur N » + un indice vague sur UN critère raté.
--            Pas d'aperçu, pas de jauge. 5 essais par jour.
--  * VIP   : règles CACHÉES. Après chaque essai : UNIQUEMENT l'indice vague (pas de compte). 5 essais par jour.
--  Au Club et au VIP, on entre quand TOUS les critères du jour sont respectés. La règle du jour n'est
--  révélée qu'à la fin (réussite ou essais épuisés). Le seuil de rareté est un critère comme les autres
--  (minimum OU maximum selon les jours).
--
-- SÉCURITÉ : pour le Club et le VIP, le serveur ne renvoie JAMAIS les règles, les seuils, les points ni le détail
-- du score : seulement accepté / refusé, le compte (Club), l'indice, les essais restants et, à la fin, la règle.
-- Le même dress code pour tous les joueurs un jour donné ; les essais sont comptés ICI (recharger la page ne
-- rend aucun essai). Pas d'essai supplémentaire achetable.

-- ============================================================
-- 1. Réglages par porte
-- ============================================================
-- mode : visible | count (compte + indice) | hint (indice seul) ; tries : essais par jour.
-- Le Flow, les seuils du Bar et le bonus de série ne changent pas.
update public.economy_config
   set config = jsonb_set(config, '{VIDEUR,doors}', (
         select jsonb_agg(
                  d || case d ->> 'id'
                         when 'bar'  then jsonb_build_object('mode', 'visible', 'tries', 3)
                         when 'club' then jsonb_build_object('mode', 'count', 'tries', 5,
                                            'venue', 'Le Sous-sol',
                                            'intro', 'Pas de liste à l''entrée. Le videur te regarde et parle peu : à toi de comprendre ce qu''il veut.')
                         else             jsonb_build_object('mode', 'hint', 'tries', 5,
                                            'venue', 'Le Toit',
                                            'intro', 'Ici, il ne te dira presque rien. Un mot, et c''est tout.')
                       end
                  order by ord)
           from jsonb_array_elements(config -> 'VIDEUR' -> 'doors') with ordinality t(d, ord))),
       updated_at = now()
 where id = 1 and config ? 'VIDEUR';

-- ============================================================
-- 2. Tables
-- ============================================================
-- Énigmes du Club et du VIP : une liste de critères (tous obligatoires). Illisible par le site.
-- Chaque critère : { type, …, label (révélé à la fin), hint (indice vague) }.
create table if not exists public.videur_riddles (
  id     bigint generated always as identity primary key,
  door   text not null check (door in ('club', 'vip')),
  name   text not null,
  rules  jsonb not null,
  active boolean not null default true,
  unique (door, name)
);
alter table public.videur_riddles enable row level security;
revoke all on public.videur_riddles from anon, authenticated;

alter table public.videur_attempts add column if not exists riddle_id bigint references public.videur_riddles (id);
alter table public.videur_attempts add column if not exists matched integer;
alter table public.videur_attempts add column if not exists total integer;
alter table public.videur_attempts add column if not exists hint text;

-- Les anciens dress codes du Club et du VIP (règles visibles) ne servent plus.
update public.videur_codes set active = false where door in ('club', 'vip');

insert into public.videur_riddles (door, name, rules) values
  ('club', 'Club 01', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["clair"], "min": 2, "weight": 0, "label": "Au moins 2 pièces claires", "hint": "Trop sombre pour moi."}, {"type": "slot", "slot": "cou", "weight": 0, "label": "Une écharpe au cou", "hint": "T''as pas froid au cou ?"}, {"type": "rarity_min", "min": 9, "weight": 0, "label": "Au moins 9 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 02', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_max", "max": 11, "weight": 0, "label": "Pas plus de 11 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 03', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "palette", "tags": ["delave"], "min": 2, "weight": 0, "label": "Au moins 2 pièces délavées", "hint": "Trop neuf, tout ça."}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "rarity_min", "min": 9, "weight": 0, "label": "Au moins 9 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 04', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "palette", "tags": ["neutre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces neutres", "hint": "Ça part dans tous les sens."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_max", "max": 13, "weight": 0, "label": "Pas plus de 13 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 05', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "forbid_tag", "tag": "vif", "weight": 0, "label": "Aucune couleur vive", "hint": "Trop flashy."}, {"type": "min_pieces", "min": 5, "weight": 0, "label": "Au moins 5 pièces portées", "hint": "Sois plus habillé."}, {"type": "rarity_min", "min": 11, "weight": 0, "label": "Au moins 11 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 06', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "palette", "tags": ["chaud"], "min": 2, "weight": 0, "label": "Au moins 2 pièces aux tons chauds", "hint": "Ça manque de chaleur."}, {"type": "no_slot", "slot": "sac", "weight": 0, "label": "Pas de sac", "hint": "Tu traînes trop de choses."}, {"type": "rarity_max", "max": 11, "weight": 0, "label": "Pas plus de 11 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 07', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["vif"], "min": 1, "weight": 0, "label": "Au moins une touche de couleur vive", "hint": "C''est triste. Il manque un éclat."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_min", "min": 9, "weight": 0, "label": "Au moins 9 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 08', '[{"type": "min_brands", "min": 2, "weight": 0, "label": "Au moins 2 marques différentes", "hint": "Un peu de variété, non ?"}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "rarity_max", "max": 13, "weight": 0, "label": "Pas plus de 13 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 09', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["metal"], "min": 1, "weight": 0, "label": "Au moins une pièce à liseré métal", "hint": "Pas un reflet, pas un éclat."}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_min", "min": 7, "weight": 0, "label": "Au moins 7 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 10', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "forbid_tag", "tag": "delave", "weight": 0, "label": "Rien de délavé", "hint": "Ça fait lavé, ton truc."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_max", "max": 11, "weight": 0, "label": "Pas plus de 11 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 11', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["neutre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces neutres", "hint": "Ça part dans tous les sens."}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "rarity_min", "min": 9, "weight": 0, "label": "Au moins 9 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 12', '[{"type": "min_brands", "min": 2, "weight": 0, "label": "Au moins 2 marques différentes", "hint": "Un peu de variété, non ?"}, {"type": "palette", "tags": ["clair"], "min": 2, "weight": 0, "label": "Au moins 2 pièces claires", "hint": "Trop sombre pour moi."}, {"type": "slot", "slot": "veste", "weight": 0, "label": "Une veste par-dessus", "hint": "Il y a un courant d''air."}, {"type": "rarity_max", "max": 13, "weight": 0, "label": "Pas plus de 13 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 13', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_min", "min": 7, "weight": 0, "label": "Au moins 7 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 14', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["froid"], "min": 2, "weight": 0, "label": "Au moins 2 pièces aux tons froids", "hint": "Ça manque de fraîcheur."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_max", "max": 11, "weight": 0, "label": "Pas plus de 11 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 15', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["terre"], "min": 2, "weight": 0, "label": "Au moins 2 pièces aux tons terre", "hint": "Trop citadin."}, {"type": "no_slot", "slot": "tete", "weight": 0, "label": "Rien sur la tête", "hint": "Je veux voir ton visage."}, {"type": "rarity_min", "min": 9, "weight": 0, "label": "Au moins 9 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 16', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "palette", "tags": ["chaud"], "min": 2, "weight": 0, "label": "Au moins 2 pièces aux tons chauds", "hint": "Ça manque de chaleur."}, {"type": "min_pieces", "min": 5, "weight": 0, "label": "Au moins 5 pièces portées", "hint": "Sois plus habillé."}, {"type": "rarity_min", "min": 11, "weight": 0, "label": "Au moins 11 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 17', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "forbid_tag", "tag": "vif", "weight": 0, "label": "Aucune couleur vive", "hint": "Trop flashy."}, {"type": "slot", "slot": "veste", "weight": 0, "label": "Une veste par-dessus", "hint": "Il y a un courant d''air."}, {"type": "rarity_max", "max": 11, "weight": 0, "label": "Pas plus de 11 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 18', '[{"type": "min_brands", "min": 2, "weight": 0, "label": "Au moins 2 marques différentes", "hint": "Un peu de variété, non ?"}, {"type": "palette", "tags": ["metal"], "min": 1, "weight": 0, "label": "Au moins une pièce à liseré métal", "hint": "Pas un reflet, pas un éclat."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_min", "min": 9, "weight": 0, "label": "Au moins 9 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('club', 'Club 19', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "palette", "tags": ["neutre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces neutres", "hint": "Ça part dans tous les sens."}, {"type": "slot", "slot": "cou", "weight": 0, "label": "Une écharpe au cou", "hint": "T''as pas froid au cou ?"}, {"type": "rarity_max", "max": 13, "weight": 0, "label": "Pas plus de 13 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('club', 'Club 20', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "forbid_tag", "tag": "delave", "weight": 0, "label": "Rien de délavé", "hint": "Ça fait lavé, ton truc."}, {"type": "max_pieces", "max": 4, "weight": 0, "label": "4 pièces au maximum", "hint": "Tu en fais trop."}, {"type": "rarity_min", "min": 7, "weight": 0, "label": "Au moins 7 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 01', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["clair"], "min": 2, "weight": 0, "label": "Au moins 2 pièces claires", "hint": "Trop sombre pour moi."}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_min", "min": 18, "weight": 0, "label": "Au moins 18 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 02', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "rarity_max", "max": 12, "weight": 0, "label": "Pas plus de 12 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 03', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "min_pieces", "min": 5, "weight": 0, "label": "Au moins 5 pièces portées", "hint": "Sois plus habillé."}, {"type": "forbid_tag", "tag": "vif", "weight": 0, "label": "Aucune couleur vive", "hint": "Trop flashy."}, {"type": "rarity_min", "min": 18, "weight": 0, "label": "Au moins 18 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 04', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["neutre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces neutres", "hint": "Ça part dans tous les sens."}, {"type": "slot", "slot": "cou", "weight": 0, "label": "Une écharpe au cou", "hint": "T''as pas froid au cou ?"}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_max", "max": 12, "weight": 0, "label": "Pas plus de 12 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 05', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["vif"], "min": 1, "weight": 0, "label": "Au moins une touche de couleur vive", "hint": "C''est triste. Il manque un éclat."}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_min", "min": 22, "weight": 0, "label": "Au moins 22 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 06', '[{"type": "min_brands", "min": 2, "weight": 0, "label": "Au moins 2 marques différentes", "hint": "Un peu de variété, non ?"}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "min_pieces", "min": 5, "weight": 0, "label": "Au moins 5 pièces portées", "hint": "Sois plus habillé."}, {"type": "rarity_max", "max": 14, "weight": 0, "label": "Pas plus de 14 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 07', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "palette", "tags": ["delave"], "min": 2, "weight": 0, "label": "Au moins 2 pièces délavées", "hint": "Trop neuf, tout ça."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_min", "min": 18, "weight": 0, "label": "Au moins 18 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 08', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["metal"], "min": 1, "weight": 0, "label": "Au moins une pièce à liseré métal", "hint": "Pas un reflet, pas un éclat."}, {"type": "no_slot", "slot": "tete", "weight": 0, "label": "Rien sur la tête", "hint": "Je veux voir ton visage."}, {"type": "rarity_max", "max": 14, "weight": 0, "label": "Pas plus de 14 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 09', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "slot", "slot": "veste", "weight": 0, "label": "Une veste par-dessus", "hint": "Il y a un courant d''air."}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_min", "min": 22, "weight": 0, "label": "Au moins 22 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 10', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["clair"], "min": 2, "weight": 0, "label": "Au moins 2 pièces claires", "hint": "Trop sombre pour moi."}, {"type": "forbid_tag", "tag": "vif", "weight": 0, "label": "Aucune couleur vive", "hint": "Trop flashy."}, {"type": "min_pieces", "min": 5, "weight": 0, "label": "Au moins 5 pièces portées", "hint": "Sois plus habillé."}, {"type": "rarity_max", "max": 14, "weight": 0, "label": "Pas plus de 14 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 11', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "palette", "tags": ["chaud"], "min": 2, "weight": 0, "label": "Au moins 2 pièces aux tons chauds", "hint": "Ça manque de chaleur."}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "rarity_min", "min": 22, "weight": 0, "label": "Au moins 22 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 12', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["neutre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces neutres", "hint": "Ça part dans tous les sens."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "no_slot", "slot": "sac", "weight": 0, "label": "Pas de sac", "hint": "Tu traînes trop de choses."}, {"type": "rarity_max", "max": 12, "weight": 0, "label": "Pas plus de 12 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 13', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["metal"], "min": 1, "weight": 0, "label": "Au moins une pièce à liseré métal", "hint": "Pas un reflet, pas un éclat."}, {"type": "slot", "slot": "veste", "weight": 0, "label": "Une veste par-dessus", "hint": "Il y a un courant d''air."}, {"type": "slot", "slot": "cou", "weight": 0, "label": "Une écharpe au cou", "hint": "T''as pas froid au cou ?"}, {"type": "rarity_min", "min": 18, "weight": 0, "label": "Au moins 18 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 14', '[{"type": "min_brands", "min": 2, "weight": 0, "label": "Au moins 2 marques différentes", "hint": "Un peu de variété, non ?"}, {"type": "forbid_tag", "tag": "delave", "weight": 0, "label": "Rien de délavé", "hint": "Ça fait lavé, ton truc."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "rarity_max", "max": 14, "weight": 0, "label": "Pas plus de 14 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 15', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "slot", "slot": "tete", "weight": 0, "label": "Un couvre-chef sur la tête", "hint": "T''as la tête nue."}, {"type": "rarity_min", "min": 26, "weight": 0, "label": "Au moins 26 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 16', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 0, "label": "Au moins 2 pièces Pigeon Social Club", "hint": "T''es pas du coin."}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 0, "label": "Au moins 3 pièces sombres", "hint": "Il fait nuit dehors, t''as pas vu ?"}, {"type": "no_slot", "slot": "sac", "weight": 0, "label": "Pas de sac", "hint": "Tu traînes trop de choses."}, {"type": "min_pieces", "min": 5, "weight": 0, "label": "Au moins 5 pièces portées", "hint": "Sois plus habillé."}, {"type": "rarity_max", "max": 14, "weight": 0, "label": "Pas plus de 14 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 17', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "palette", "tags": ["terre"], "min": 2, "weight": 0, "label": "Au moins 2 pièces aux tons terre", "hint": "Trop citadin."}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_min", "min": 22, "weight": 0, "label": "Au moins 22 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 18', '[{"type": "same_brand", "min": 4, "weight": 0, "label": "Tenue d''une seule marque (4 pièces minimum)", "hint": "Faut choisir un camp."}, {"type": "brand", "brand": "halvane", "min": 2, "weight": 0, "label": "Au moins 2 pièces Halvane", "hint": "Ça manque de coupe, tout ça."}, {"type": "forbid_tag", "tag": "vif", "weight": 0, "label": "Aucune couleur vive", "hint": "Trop flashy."}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "rarity_max", "max": 14, "weight": 0, "label": "Pas plus de 14 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb),
  ('vip', 'VIP 19', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 0, "label": "Au moins 2 pièces SIGNAL/9", "hint": "Rien d''utile là-dedans."}, {"type": "palette", "tags": ["chaud"], "min": 2, "weight": 0, "label": "Au moins 2 pièces aux tons chauds", "hint": "Ça manque de chaleur."}, {"type": "slot", "slot": "veste", "weight": 0, "label": "Une veste par-dessus", "hint": "Il y a un courant d''air."}, {"type": "complete", "weight": 0, "label": "Haut, bas et chaussures portés", "hint": "Il manque quelque chose, non ?"}, {"type": "rarity_min", "min": 18, "weight": 0, "label": "Au moins 18 points de rareté", "hint": "Ça sent pas la pièce rare."}]'::jsonb),
  ('vip', 'VIP 20', '[{"type": "min_brands", "min": 2, "weight": 0, "label": "Au moins 2 marques différentes", "hint": "Un peu de variété, non ?"}, {"type": "palette", "tags": ["clair"], "min": 2, "weight": 0, "label": "Au moins 2 pièces claires", "hint": "Trop sombre pour moi."}, {"type": "slot", "slot": "sac", "weight": 0, "label": "Un sac sur soi", "hint": "Tu viens les mains vides ?"}, {"type": "min_pieces", "min": 5, "weight": 0, "label": "Au moins 5 pièces portées", "hint": "Sois plus habillé."}, {"type": "rarity_max", "max": 12, "weight": 0, "label": "Pas plus de 12 points de rareté", "hint": "Pas besoin de tout montrer."}]'::jsonb)
on conflict (door, name) do nothing;

-- ============================================================
-- 3. Fonctions internes
-- ============================================================
-- Énigme du jour : on avance d'un cran chaque jour dans la liste (la liste alterne rareté minimum / maximum),
-- la même pour tous les joueurs.
create or replace function private.videur_riddle_for(p_day date, p_door text)
returns public.videur_riddles
language plpgsql
stable
set search_path = ''
as $$
declare
  n integer;
  r public.videur_riddles;
begin
  select count(*) into n from public.videur_riddles where door = p_door and active;
  if n = 0 then raise exception 'Aucune règle pour cette porte'; end if;
  select * into r from public.videur_riddles where door = p_door and active
   order by id offset ((p_day - date '2026-01-01') % n) limit 1;
  return r;
end;
$$;

-- Évaluation de la tenue contre une liste de règles (remplace celle de la 0012 : nouveaux types
-- min_brands, no_slot, max_pieces, rarity_min, rarity_max ; l'indice « hint » est transmis).
create or replace function private.videur_eval(p_uid uuid, p_rules jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  worn  jsonb := private.videur_worn(p_uid);
  rp    jsonb := private.cfg() -> 'VIDEUR' -> 'rarityPoints';
  nb    integer := jsonb_array_length(worn);
  pts   integer := 0;
  style integer := 0;
  res   jsonb := '[]'::jsonb;
  w     jsonb;
  r     jsonb;
  ok    boolean;
  n     integer;
  wt    integer;
begin
  for w in select * from jsonb_array_elements(worn) loop
    pts := pts + coalesce((rp ->> (w ->> 'rarity'))::integer, 0);
  end loop;

  for r in select * from jsonb_array_elements(p_rules) loop
    wt := coalesce((r ->> 'weight')::integer, 0);
    case r ->> 'type'
      when 'brand' then
        select count(*) into n from jsonb_array_elements(worn) x where x ->> 'brand' = r ->> 'brand';
        ok := n >= (r ->> 'min')::integer;
      when 'same_brand' then
        ok := nb >= (r ->> 'min')::integer
              and (select count(distinct x ->> 'brand') from jsonb_array_elements(worn) x) = 1;
      when 'min_brands' then
        ok := (select count(distinct x ->> 'brand') from jsonb_array_elements(worn) x) >= (r ->> 'min')::integer;
      when 'palette' then
        select count(*) into n from jsonb_array_elements(worn) x
         where exists (select 1 from jsonb_array_elements_text(x -> 'tags') tg
                        where tg = any (array(select jsonb_array_elements_text(r -> 'tags'))));
        ok := n >= (r ->> 'min')::integer;
      when 'forbid_tag' then
        ok := not exists (select 1 from jsonb_array_elements(worn) x where (x -> 'tags') ? (r ->> 'tag'));
      when 'complete' then
        ok := (select count(distinct x ->> 'slot') from jsonb_array_elements(worn) x
                where x ->> 'slot' in ('haut', 'bas', 'chaussures')) = 3;
      when 'slot' then
        ok := exists (select 1 from jsonb_array_elements(worn) x where x ->> 'slot' = r ->> 'slot');
      when 'no_slot' then
        ok := not exists (select 1 from jsonb_array_elements(worn) x where x ->> 'slot' = r ->> 'slot');
      when 'min_pieces' then
        ok := nb >= (r ->> 'min')::integer;
      when 'max_pieces' then
        ok := nb <= (r ->> 'max')::integer;
      when 'rarity_min' then
        ok := pts >= (r ->> 'min')::integer;
      when 'rarity_max' then
        ok := pts <= (r ->> 'max')::integer;
      else
        ok := false;
    end case;
    ok := ok and nb > 0; -- une tenue vide ne marque aucun point
    if ok then style := style + wt; end if;
    res := res || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
             'label', r ->> 'label', 'weight', wt, 'ok', ok, 'hint', r ->> 'hint')));
  end loop;

  return jsonb_build_object(
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('slot', x ->> 'slot', 'colorway_id', x ->> 'colorway_id', 'rarity', x ->> 'rarity')), '[]'::jsonb)
                 from jsonb_array_elements(worn) x),
    'rarity_points', pts, 'style', style, 'rules', res);
end;
$$;

-- ============================================================
-- 4. Fonctions du jeu (remplacent celles de la 0012)
-- ============================================================
-- La soirée du jour. Bar : règles et seuils. Club / VIP : AUCUNE règle, seulement l'état et l'historique
-- des essais du jour (compte au Club, indices) ; la règle n'apparaît (« reveal ») qu'une fois la porte terminée.
create or replace function public.get_videur_night()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  today   date := private.videur_day();
  cfg     jsonb := private.cfg() -> 'VIDEUR';
  d       jsonb;
  v_mode  text;
  v_tries integer;
  code    public.videur_codes;
  riddle  public.videur_riddles;
  used    integer;
  done    boolean;
  finished boolean;
  prev    boolean := true;
  doors   jsonb := '[]'::jsonb;
  one     jsonb;
  streak  integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  for d in select * from jsonb_array_elements(cfg -> 'doors') loop
    v_mode := coalesce(d ->> 'mode', 'visible');
    v_tries := coalesce((d ->> 'tries')::integer, (cfg ->> 'triesPerDoor')::integer);
    select count(*) into used from public.videur_attempts where user_id = uid and day = today and door = d ->> 'id';
    select exists (select 1 from public.videur_attempts where user_id = uid and day = today and door = d ->> 'id' and passed) into done;
    finished := done or used >= v_tries;

    one := jsonb_build_object('id', d ->> 'id', 'name', d ->> 'name', 'mode', v_mode, 'flow', (d ->> 'flow')::integer,
                              'tries', v_tries, 'tries_left', greatest(v_tries - used, 0), 'passed', done, 'locked', not prev);

    if v_mode = 'visible' then
      code := private.videur_code_for(today, d ->> 'id');
      one := one || jsonb_build_object(
        'venue', code.name, 'intro', code.intro,
        'min_style', (d ->> 'minStyle')::integer, 'min_rarity', (d ->> 'minRarity')::integer,
        'rules', (select jsonb_agg(jsonb_build_object('label', x ->> 'label', 'weight', (x ->> 'weight')::integer))
                    from jsonb_array_elements(code.rules) x));
    else
      riddle := private.videur_riddle_for(today, d ->> 'id');
      one := one || jsonb_build_object('venue', d ->> 'venue', 'intro', d ->> 'intro',
        'attempts', (select coalesce(jsonb_agg(
            case when v_mode = 'count'
                 then jsonb_build_object('passed', a.passed, 'hint', a.hint, 'matched', a.matched, 'total', a.total)
                 else jsonb_build_object('passed', a.passed, 'hint', a.hint) end
            order by a.id), '[]'::jsonb)
           from public.videur_attempts a where a.user_id = uid and a.day = today and a.door = d ->> 'id'));
      if finished then
        one := one || jsonb_build_object('reveal', (select jsonb_agg(x ->> 'label') from jsonb_array_elements(riddle.rules) x));
      end if;
    end if;

    doors := doors || jsonb_build_array(one);
    prev := done;
  end loop;

  streak := case when exists (select 1 from public.videur_attempts where user_id = uid and day = today and door = 'bar' and passed)
                 then private.videur_streak(uid, today) else private.videur_streak(uid, today - 1) end;

  return jsonb_build_object(
    'day', today, 'flow', (select flow from public.profiles where id = uid), 'streak', streak,
    'streak_bonus_cap', (cfg ->> 'streakBonusCap')::integer, 'doors', doors);
end;
$$;

-- Aperçu GRATUIT : réservé au Bar (règles visibles). Refusé au Club et au VIP : il révélerait les règles.
create or replace function public.videur_preview(p_door text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid    uuid := auth.uid();
  cfg    jsonb := private.cfg() -> 'VIDEUR';
  v_door jsonb;
  code   public.videur_codes;
  ev     jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select x into v_door from jsonb_array_elements(cfg -> 'doors') x where x ->> 'id' = p_door;
  if v_door is null then raise exception 'Porte inconnue'; end if;
  if coalesce(v_door ->> 'mode', 'visible') <> 'visible' then
    raise exception 'Pas d''aperçu pour cette porte';
  end if;

  code := private.videur_code_for(private.videur_day(), p_door);
  ev := private.videur_eval(uid, code.rules);
  return ev || jsonb_build_object(
    'door', p_door,
    'min_style', (v_door ->> 'minStyle')::integer, 'min_rarity', (v_door ->> 'minRarity')::integer,
    'style_ok', (ev ->> 'style')::integer >= (v_door ->> 'minStyle')::integer,
    'rarity_ok', (ev ->> 'rarity_points')::integer >= (v_door ->> 'minRarity')::integer);
end;
$$;

-- Se présenter : consomme un essai. Bar : verdict détaillé. Club : accepté / refusé + « X sur N » + indice.
-- VIP : accepté / refusé + indice seulement.
create or replace function public.videur_enter(p_door text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  today    date := private.videur_day();
  cfg      jsonb := private.cfg() -> 'VIDEUR';
  v_door   jsonb;
  v_prev   text := null;
  d        jsonb;
  v_mode   text;
  v_tries  integer;
  v_code   public.videur_codes;
  v_riddle public.videur_riddles;
  v_used   integer;
  ev       jsonb;
  v_style_ok  boolean;
  v_rarity_ok boolean;
  v_passed boolean;
  v_matched integer := null;
  v_total   integer := null;
  v_hint    text := null;
  v_gained integer := 0;
  v_bonus  integer := 0;
  v_before integer := 0;
  v_kind   text;
  v_line   text;
  v_flow   integer;
  v_left   integer;
  v_reveal jsonb := null;
  v_out    jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform pg_advisory_xact_lock(hashtext('videur:' || uid::text)); -- pas de double envoi simultané

  for d in select * from jsonb_array_elements(cfg -> 'doors') loop
    if d ->> 'id' = p_door then v_door := d; exit; end if;
    v_prev := d ->> 'id';
  end loop;
  if v_door is null then raise exception 'Porte inconnue'; end if;
  v_mode := coalesce(v_door ->> 'mode', 'visible');
  v_tries := coalesce((v_door ->> 'tries')::integer, (cfg ->> 'triesPerDoor')::integer);

  if v_prev is not null and not exists (select 1 from public.videur_attempts
                                         where user_id = uid and day = today and door = v_prev and passed) then
    raise exception 'Cette porte est verrouillée : passe d''abord la précédente';
  end if;
  if exists (select 1 from public.videur_attempts where user_id = uid and day = today and door = p_door and passed) then
    raise exception 'Tu es déjà entré ici aujourd''hui';
  end if;
  select count(*) into v_used from public.videur_attempts where user_id = uid and day = today and door = p_door;
  if v_used >= v_tries then raise exception 'Plus d''essai pour cette porte aujourd''hui'; end if;
  v_left := v_tries - v_used - 1;

  if v_mode = 'visible' then
    v_code := private.videur_code_for(today, p_door);
    ev := private.videur_eval(uid, v_code.rules);
    if jsonb_array_length(ev -> 'pieces') = 0 then raise exception 'Porte au moins une pièce pour te présenter'; end if;
    v_style_ok  := (ev ->> 'style')::integer >= (v_door ->> 'minStyle')::integer;
    v_rarity_ok := (ev ->> 'rarity_points')::integer >= (v_door ->> 'minRarity')::integer;
    v_passed := v_style_ok and v_rarity_ok;
  else
    v_riddle := private.videur_riddle_for(today, p_door);
    ev := private.videur_eval(uid, v_riddle.rules);
    if jsonb_array_length(ev -> 'pieces') = 0 then raise exception 'Porte au moins une pièce pour te présenter'; end if;
    v_total := jsonb_array_length(ev -> 'rules');
    select count(*) into v_matched from jsonb_array_elements(ev -> 'rules') r where (r ->> 'ok')::boolean;
    v_passed := v_matched = v_total;
    if not v_passed then
      -- Un indice vague sur UN critère raté, tiré au hasard.
      select r ->> 'hint' into v_hint from jsonb_array_elements(ev -> 'rules') r
       where not (r ->> 'ok')::boolean order by random() limit 1;
    end if;
  end if;

  if v_passed then
    v_gained := (v_door ->> 'flow')::integer;
    if p_door = 'bar' then
      -- Bonus de série (inchangé) : +1 par jour d'affilée (hier compris), plafonné.
      v_before := private.videur_streak(uid, today - 1);
      v_bonus := least(v_before, (cfg ->> 'streakBonusCap')::integer);
      v_gained := v_gained + v_bonus;
    end if;
    update public.profiles set flow = flow + v_gained where id = uid;
  end if;

  insert into public.videur_attempts (user_id, day, door, code_id, riddle_id, style, rarity, passed, flow_gained, outfit, matched, total, hint)
  values (uid, today, p_door, v_code.id, v_riddle.id,
          case when v_mode = 'visible' then (ev ->> 'style')::integer else 0 end,
          (ev ->> 'rarity_points')::integer, v_passed, v_gained, ev -> 'pieces', v_matched, v_total, v_hint);

  select flow into v_flow from public.profiles where id = uid;

  if v_mode = 'visible' then
    v_kind := case when v_passed then 'enter' when not v_style_ok and not v_rarity_ok then 'refuse_both'
                   when not v_style_ok then 'refuse_style' else 'refuse_rarity' end;
    select l.text into v_line from public.videur_lines l where l.door = p_door and l.kind = v_kind order by random() limit 1;
    return ev || jsonb_build_object(
      'door', p_door, 'mode', v_mode, 'passed', v_passed, 'style_ok', v_style_ok, 'rarity_ok', v_rarity_ok,
      'min_style', (v_door ->> 'minStyle')::integer, 'min_rarity', (v_door ->> 'minRarity')::integer,
      'line', coalesce(v_line, ''), 'flow_gained', v_gained, 'streak_bonus', v_bonus,
      'streak', case when v_passed then v_before + 1 else null end,
      'tries_left', v_left, 'flow', v_flow);
  end if;

  -- Club / VIP : on ne renvoie AUCUN détail (ni règles, ni points, ni critères ratés autrement que par l'indice).
  if v_passed then
    select l.text into v_line from public.videur_lines l where l.door = p_door and l.kind = 'enter' order by random() limit 1;
  end if;
  if v_passed or v_left <= 0 then
    v_reveal := (select jsonb_agg(x ->> 'label') from jsonb_array_elements(v_riddle.rules) x);
  end if;
  v_out := jsonb_build_object('door', p_door, 'mode', v_mode, 'passed', v_passed,
                            'line', coalesce(v_line, v_hint, ''), 'hint', v_hint,
                            'flow_gained', v_gained, 'streak_bonus', 0, 'tries_left', v_left, 'flow', v_flow);
  if v_mode = 'count' then
    v_out := v_out || jsonb_build_object('matched', v_matched, 'total', v_total);
  end if;
  if v_reveal is not null then
    v_out := v_out || jsonb_build_object('reveal', v_reveal);
  end if;
  return v_out;
end;
$$;

-- ============================================================
-- 5. Statistiques et droits
-- ============================================================
create or replace view public.analytics_videur_daily as
  select day, door, count(*) as attempts, count(*) filter (where passed) as passes,
         count(distinct user_id) as players, coalesce(sum(flow_gained), 0) as flow_given,
         round(avg(matched::numeric / nullif(total, 0)) * 100, 0) as avg_matched_pct
    from public.videur_attempts
   group by day, door
   order by day desc, door;
revoke all on public.analytics_videur_daily from anon, authenticated;

revoke execute on function public.get_videur_night()   from public, anon;
revoke execute on function public.videur_preview(text) from public, anon;
revoke execute on function public.videur_enter(text)   from public, anon;
grant  execute on function public.get_videur_night()   to authenticated;
grant  execute on function public.videur_preview(text) to authenticated;
grant  execute on function public.videur_enter(text)   to authenticated;
