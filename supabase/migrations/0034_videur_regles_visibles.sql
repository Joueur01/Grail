-- Grail — migration 0034 : règles du Videur VISIBLES à tous les niveaux, indices qui disent ce qui manque.
-- Voir CLAUDE.md, section 16. À exécuter APRÈS la 0033 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Décision du développeur (30 octobre 2026), après avoir joué la tour :
--  * Les règles cachées (mode « count » à partir du niveau 4) ne marchaient pas : les indices étaient trop
--    vagues (« Pas assez de pièces de la bonne marque. » ne dit pas laquelle, parmi 7), et les étiquettes de
--    couleur (sombre, terre, chaud…) ne sont visibles nulle part : on ne peut pas deviner ce qu'on ne voit pas.
--  * Désormais TOUTES les portes sont en mode « visible » : règles écrites en clair et aperçu gratuit
--    (✔ / ✖ par critère) à tous les niveaux. La difficulté vient du nombre de critères et de la rareté demandée
--    (inchangés : paliers de la 0033), pas du flou.
--  * Indices « clairs » plus précis : la marque est NOMMÉE (« Il te faut au moins 2 pièces Brume. ») et la
--    rareté donne le seuil (« Pas assez de rareté : il te faut 12 points. »).
--  * Les règles déjà tirées AUJOURD'HUI passent aussi en mode visible, avec les nouveaux indices (les joueurs
--    en cours de partie voient la règle tout de suite). Les essais déjà joués restent comptés.
--
-- Le code des modes cachés (« count », « hint ») et des tons « medium » / « vague » reste en place : il suffit
-- de remettre un mode caché dans economy_config.VIDEUR_TOWER.tiers pour y revenir. Le site sait déjà tout
-- afficher.

-- ============================================================
-- 1. Réglages : tous les paliers en mode visible, ton clair (critères et essais gardés)
-- ============================================================
update public.economy_config
   set config = jsonb_set(jsonb_set(config, '{VIDEUR_TOWER,tiers}',
         (select jsonb_agg(t || '{"mode": {"bar": "visible", "club": "visible", "vip": "visible"}, "tone": "clear"}'::jsonb
                           order by i)
            from jsonb_array_elements(config #> '{VIDEUR_TOWER,tiers}') with ordinality x(t, i))),
         '{VIDEUR_TOWER,version}', '3'::jsonb),
       updated_at = now()
 where id = 1
   and jsonb_typeof(config #> '{VIDEUR_TOWER,tiers}') = 'array'
   and coalesce((config #>> '{VIDEUR_TOWER,version}')::integer, 1) < 3;

-- ============================================================
-- 2. Textes des critères (copie de la 0033 ; changements marqués « 0034 »)
-- ============================================================
create or replace function private.tower_describe(p_rule jsonb, p_tone text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  plural   jsonb := '{"sombre": "sombres", "clair": "claires", "neutre": "neutres", "vif": "de couleur vive",
                      "delave": "délavées", "metal": "à reflet métal", "chaud": "aux tons chauds",
                      "froid": "aux tons froids", "terre": "aux tons terre"}';
  singular jsonb := '{"sombre": "sombre", "clair": "claire", "neutre": "neutre", "vif": "de couleur vive",
                      "delave": "délavée", "metal": "à reflet métal", "chaud": "aux tons chauds",
                      "froid": "aux tons froids", "terre": "aux tons terre"}';
  have_lbl jsonb := '{"tete": "Un couvre-chef sur la tête", "cou": "Une écharpe au cou", "sac": "Un sac sur soi",
                      "veste": "Une veste par-dessus", "haut": "Un haut", "bas": "Un bas", "chaussures": "Des chaussures"}';
  none_lbl jsonb := '{"tete": "Rien sur la tête", "cou": "Pas d''écharpe", "sac": "Pas de sac", "veste": "Pas de veste"}';
  have_clr jsonb := '{"tete": "Il te faut quelque chose sur la tête.", "cou": "Il te faut une écharpe.",
                      "sac": "Il te faut un sac.", "veste": "Il te faut une veste.", "haut": "Il te faut un haut.",
                      "bas": "Il te faut un bas.", "chaussures": "Il te faut des chaussures."}';
  none_clr jsonb := '{"tete": "Enlève ce que tu as sur la tête.", "cou": "Enlève ton écharpe.",
                      "sac": "Pose ton sac.", "veste": "Enlève ta veste."}';
  -- Indices « vagues » : ceux du Videur d'origine (la marque n'est jamais nommée).
  brand_vg jsonb := '{"signal9": "Rien d''utile là-dedans.", "halvane": "Ça manque de coupe, tout ça.",
                      "pigeon_social_club": "T''es pas du coin.", "ferrant_fils": "T''as jamais bossé de tes mains.",
                      "brume": "Tu sors jamais de la ville, toi.", "faubourg_78": "T''as pas l''air de supporter grand monde.",
                      "orbite_2000": "Il manque de l''éclat, ce soir."}';
  pal_vg   jsonb := '{"sombre": "Il fait nuit dehors, t''as pas vu ?", "clair": "Trop sombre pour moi.",
                      "neutre": "Ça part dans tous les sens.", "vif": "C''est triste. Il manque un éclat.",
                      "delave": "Trop neuf, tout ça.", "metal": "Pas un reflet, pas un éclat.",
                      "chaud": "Ça manque de chaleur.", "froid": "Ça manque de fraîcheur.", "terre": "Trop citadin."}';
  forb_vg  jsonb := '{"sombre": "T''es pas à un enterrement.", "clair": "Trop pâle pour ici.", "neutre": "Trop sage.",
                      "vif": "Trop flashy.", "delave": "Ça fait lavé, ton truc.", "metal": "Ça brille trop.",
                      "chaud": "Trop chaud, tout ça.", "froid": "Trop froid, tout ça.", "terre": "On n''est pas à la campagne."}';
  have_vg  jsonb := '{"tete": "T''as la tête nue.", "cou": "T''as pas froid au cou ?", "sac": "Tu viens les mains vides ?",
                      "veste": "Il y a un courant d''air."}';
  none_vg  jsonb := '{"tete": "Je veux voir ton visage.", "cou": "Tu étouffes, là-dedans.", "sac": "Tu traînes trop de choses.",
                      "veste": "Tu vas avoir chaud, là-dedans."}';
  -- Indices « medium » : l'univers de la marque (affiché dans le kit de départ), jamais son nom.
  brand_md jsonb := '{"signal9": "Pas assez de techwear sur toi.", "halvane": "Pas assez de luxe discret sur toi.",
                      "pigeon_social_club": "Pas assez de skate sur toi.", "ferrant_fils": "Pas assez de bleu de travail sur toi.",
                      "brume": "Pas assez de plein air sur toi.", "faubourg_78": "Pas assez de tenue de stade sur toi.",
                      "orbite_2000": "Pas assez de chrome et de soirée sur toi."}';
  pal_md   jsonb := '{"sombre": "Il fait nuit dehors : fonce un peu ta tenue.", "clair": "Trop sombre pour moi : éclaircis-toi.",
                      "neutre": "Ça part dans tous les sens : il me faut du sobre.", "vif": "C''est triste : il manque une couleur qui claque.",
                      "delave": "Trop neuf : il me faut du délavé.", "metal": "Pas un reflet : il me faut du métal.",
                      "chaud": "Ça manque de couleurs chaudes.", "froid": "Ça manque de couleurs froides.",
                      "terre": "Trop citadin : il me faut des tons terre."}';
  forb_md  jsonb := '{"sombre": "T''es pas à un enterrement : moins de sombre.", "clair": "Trop pâle pour ici : moins de clair.",
                      "neutre": "Trop sage : moins de tons neutres.", "vif": "Trop flashy : calme les couleurs vives.",
                      "delave": "Ça fait lavé : pas de délavé.", "metal": "Ça brille trop : range le métal.",
                      "chaud": "Trop de couleurs chaudes.", "froid": "Trop de couleurs froides.",
                      "terre": "On n''est pas à la campagne : pas de tons terre."}';
  have_md  jsonb := '{"tete": "T''as la tête nue, ça me gêne.", "cou": "T''as pas froid au cou ?",
                      "sac": "Tu viens les mains vides ?", "veste": "Il y a un courant d''air : couvre-toi.",
                      "haut": "Il te manque quelque chose en haut.", "bas": "Il te manque quelque chose en bas.",
                      "chaussures": "Tu comptes entrer pieds nus ?"}';
  none_md  jsonb := '{"tete": "Je veux voir ton visage.", "cou": "Tu étouffes : dégage ton cou.",
                      "sac": "Tu traînes trop de choses : pose ton sac.", "veste": "Tu vas avoir chaud : tombe la veste."}';
  t      text := p_rule ->> 'type';
  vague  boolean := p_tone = 'vague';
  medium boolean := p_tone = 'medium';
  n      integer := coalesce((p_rule ->> 'min')::integer, (p_rule ->> 'max')::integer, 1);
  tag    text := coalesce(p_rule -> 'tags' ->> 0, p_rule ->> 'tag');
  slot   text := p_rule ->> 'slot';
  bname  text;
  lbl    text;
  hnt    text;
begin
  case t
    when 'brand' then
      select coalesce(to_jsonb(b) ->> 'name', b.id) into bname from public.brands b where b.id = p_rule ->> 'brand';
      lbl := format('Au moins %s pièce%s %s', n, case when n > 1 then 's' else '' end, coalesce(bname, p_rule ->> 'brand'));
      hnt := case when vague then coalesce(brand_vg ->> (p_rule ->> 'brand'), 'Pas la bonne maison, ce soir.')
                  when medium then coalesce(brand_md ->> (p_rule ->> 'brand'), 'Pas la bonne maison, ce soir.')
                  -- 0034 : la marque est nommée, avec le nombre de pièces (avant : « de la bonne marque »).
                  else format('Il te faut au moins %s pièce%s %s.', n, case when n > 1 then 's' else '' end,
                              coalesce(bname, p_rule ->> 'brand')) end;
    when 'same_brand' then
      lbl := format('Tenue d''une seule marque (%s pièces minimum)', n);
      hnt := case when vague then 'Faut choisir un camp.'
                  when medium then 'Tu mélanges trop : choisis une seule maison.'
                  else 'Une seule marque, de la tête aux pieds.' end;
    when 'min_brands' then
      lbl := format('Au moins %s marques différentes', n);
      hnt := case when vague then 'Un peu de variété, non ?'
                  when medium then 'Toujours la même maison : mélange un peu.'
                  else format('Il te faut au moins %s marques différentes.', n) end; -- 0034 : le nombre est donné
    when 'palette' then
      lbl := case when n <= 1 then format('Au moins une pièce %s', singular ->> tag)
                  else format('Au moins %s pièces %s', n, plural ->> tag) end;
      hnt := case when vague then pal_vg ->> tag
                  when medium then pal_md ->> tag
                  when n <= 1 then format('Il manque une pièce %s.', singular ->> tag)
                  else format('Pas assez de pièces %s.', plural ->> tag) end;
    when 'forbid_tag' then
      lbl := format('Aucune pièce %s', singular ->> tag);
      hnt := case when vague then forb_vg ->> tag
                  when medium then forb_md ->> tag
                  else format('Enlève tes pièces %s.', plural ->> tag) end;
    when 'slot' then
      lbl := have_lbl ->> slot;
      hnt := case when vague then coalesce(have_vg ->> slot, 'Il manque quelque chose, non ?')
                  when medium then coalesce(have_md ->> slot, 'Il manque quelque chose, non ?')
                  else have_clr ->> slot end;
    when 'no_slot' then
      lbl := none_lbl ->> slot;
      hnt := case when vague then none_vg ->> slot when medium then none_md ->> slot else none_clr ->> slot end;
    when 'complete' then
      lbl := 'Haut, bas et chaussures portés';
      hnt := case when vague then 'Il manque quelque chose, non ?'
                  when medium then 'Il manque une base : haut, bas ou chaussures.'
                  else 'Il faut un haut, un bas et des chaussures.' end;
    when 'min_pieces' then
      lbl := format('Au moins %s pièces portées', n);
      hnt := case when vague then 'Sois plus habillé.' when medium then 'Sois plus habillé : ajoute des pièces.'
                  else format('Porte au moins %s pièces.', n) end; -- 0034 : le nombre est donné
    when 'max_pieces' then
      lbl := format('%s pièces au maximum', n);
      hnt := case when vague then 'Tu en fais trop.' when medium then 'Tu en fais trop : enlève des pièces.'
                  else format('Trop de pièces : %s au maximum.', n) end; -- 0034 : le nombre est donné
    when 'rarity_min' then
      lbl := format('Au moins %s points de rareté', n);
      hnt := case when vague then 'Ça sent pas la pièce rare.'
                  when medium then 'Ça sent pas la pièce rare : sors tes plus belles cartes.'
                  -- 0034 : le seuil est donné.
                  else format('Pas assez de rareté : il te faut %s points.', n) end;
    else
      lbl := 'Critère'; hnt := 'Non.';
  end case;
  return p_rule || jsonb_build_object('weight', 0, 'label', coalesce(lbl, 'Critère'), 'hint', coalesce(hnt, 'Non.'));
end;
$$;

-- ============================================================
-- 3. Règles déjà tirées aujourd'hui (et après) : mode visible, textes refaits (ordre des critères gardé)
-- ============================================================
update public.videur_tower_rules r
   set mode = 'visible',
       tone = 'clear',
       rules = (select jsonb_agg(private.tower_describe(x, 'clear') order by i)
                  from jsonb_array_elements(r.rules) with ordinality y(x, i))
 where r.day >= private.videur_day()
   and (r.mode <> 'visible' or r.tone <> 'clear'
        or exists (select 1 from jsonb_array_elements(r.rules) x
                    where x ->> 'hint' in ('Pas assez de pièces de la bonne marque.',
                                           'Pas assez de rareté : porte des pièces plus rares.')));

-- ============================================================
-- 4. Droits (inchangés ; redits car la fonction est recréée)
-- ============================================================
revoke execute on function private.tower_describe(jsonb, text) from public, anon, authenticated;

-- Vérification : version 3, tous les paliers en visible / clair, plus aucune règle cachée aujourd'hui.
-- Attendu : 3 | 6 | 6 | 0
select (select config #>> '{VIDEUR_TOWER,version}' from public.economy_config where id = 1) as version,
       (select jsonb_array_length(config #> '{VIDEUR_TOWER,tiers}') from public.economy_config where id = 1) as paliers,
       (select count(*) from public.economy_config, jsonb_array_elements(config #> '{VIDEUR_TOWER,tiers}') t
         where id = 1 and t -> 'mode' = '{"bar": "visible", "club": "visible", "vip": "visible"}'::jsonb
           and t ->> 'tone' = 'clear') as paliers_visibles,
       (select count(*) from public.videur_tower_rules where day >= private.videur_day() and mode <> 'visible') as regles_cachees_aujourdhui;
