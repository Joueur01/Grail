-- Grail — migration 0033 : tour du Videur plus progressive, indices plus directs. Voir CLAUDE.md, section 16.
-- À exécuter APRÈS la 0032 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Décisions du développeur (30 octobre 2026), après la revue de la tour :
--  * La difficulté monte PROGRESSIVEMENT sur ~2 à 4 semaines (niveau 76 = difficulté maximale ; à 5 niveaux
--    par jour, c'est 15 jours sans aucun blocage), puis reste au maximum. Le maximum doit rester compliqué
--    mais jamais inatteignable.
--  * Rareté demandée PLAFONNÉE : elle monte de 3 / 4 / 5 points (Bar / Club / VIP, niveau 1) à 14 / 18 / 22
--    (niveau 76 et +). 22 points ≈ une Légendaire + quelques Rares, ou 4 Épiques. Le seuil reste toujours
--    limité à ce que la tenue cible (tirée dans tes cartes) atteint : la règle est TOUJOURS réalisable avec
--    les cartes possédées.
--  * Les « portes exigeantes » (+30 % de rareté au-delà de la collection) sont COUPÉES (stretchShare = 0) :
--    elles n'apparaissaient que quand la collection était déjà au maximum, donc elles étaient impossibles
--    sans que le joueur le sache.
--  * La tenue cible a 5 pièces au maximum (avant : jusqu'à 7). Sinon, en haut de la tour, la règle devenait
--    « porte ta meilleure pièce à chaque emplacement » et les critères « pas de sac », « N pièces au maximum »
--    disparaissaient.
--  * Indices : « X critères sur N » à TOUTES les portes dès le niveau 4 (le mode « indice seul » du VIP est
--    supprimé). À partir du niveau 26, un ton « medium » : plus direct que les anciens indices vagues (il dit
--    ce qui manque), sans tout dire (ni la marque, ni le nombre de pièces). Les marques sont évoquées par leur
--    univers (« Pas assez de techwear sur toi. »), qui est affiché dans le kit de départ.
--  * Après un refus, l'indice porte en priorité sur un critère raté DONT LE JOUEUR N'A PAS ENCORE EU L'INDICE
--    (avant : au hasard, le même indice pouvait revenir 3 fois). Chaque essai apprend donc quelque chose.
--  * Pas de remise à zéro du niveau en cours d'un jour à l'autre (les portes passées restent passées).
--
-- Paliers (economy_config.VIDEUR_TOWER.tiers) :
--   niveaux  1-3  : règles en clair + aperçu gratuit · 2 / 2 / 3 critères · 3 essais
--   niveaux  4-10 : « X sur N » + indice clair       · 2 / 3 / 3          · 4 essais
--   niveaux 11-25 : « X sur N » + indice clair       · 3 / 3 / 4          · 4 essais
--   niveaux 26-45 : « X sur N » + indice medium      · 3 / 4 / 4          · 5 essais
--   niveaux 46-75 : « X sur N » + indice medium      · 3 / 4 / 5          · 5 essais
--   niveau  76 +  : « X sur N » + indice medium      · 4 / 5 / 6          · 5 essais (maximum)
-- (critères = rareté comprise). Les minimums des critères montent aussi : « au moins N pièces de la marque /
-- de la couleur » vaut 1 jusqu'au niveau 10, 2 jusqu'au 45, 3 ensuite (midFrom = 11, hardFrom = 46).
--
-- Les règles déjà tirées aujourd'hui (videur_tower_rules) ne changent pas : les nouveaux réglages s'appliquent
-- aux règles tirées à partir de maintenant (au plus tard demain pour une porte déjà commencée).
--
-- SECRET INCHANGÉ (CLAUDE.md, section 16) : get_videur_tower et videur_tower_enter ne renvoient toujours ni les
-- règles, ni les seuils, ni les points en mode caché. Le site ne connaît que les paliers affichables.

-- ============================================================
-- 1. Réglages (version 2 de VIDEUR_TOWER ; les réglages non cités ici sont gardés)
-- ============================================================
update public.economy_config
   set config = jsonb_set(config, '{VIDEUR_TOWER}', coalesce(config -> 'VIDEUR_TOWER', '{}'::jsonb) || '{
         "version": 2,
         "rarity": {"start": {"bar": 3, "club": 4, "vip": 5}, "max": {"bar": 14, "club": 18, "vip": 22}, "plateau": 76},
         "maxOutfitPieces": 5,
         "midFrom": 11,
         "hardFrom": 46,
         "stretchShare": 0,
         "tiers": [
           {"from": 1,  "criteria": {"bar": 2, "club": 2, "vip": 3}, "tries": 3,
            "mode": {"bar": "visible", "club": "visible", "vip": "visible"}, "tone": "clear"},
           {"from": 4,  "criteria": {"bar": 2, "club": 3, "vip": 3}, "tries": 4,
            "mode": {"bar": "count", "club": "count", "vip": "count"}, "tone": "clear"},
           {"from": 11, "criteria": {"bar": 3, "club": 3, "vip": 4}, "tries": 4,
            "mode": {"bar": "count", "club": "count", "vip": "count"}, "tone": "clear"},
           {"from": 26, "criteria": {"bar": 3, "club": 4, "vip": 4}, "tries": 5,
            "mode": {"bar": "count", "club": "count", "vip": "count"}, "tone": "medium"},
           {"from": 46, "criteria": {"bar": 3, "club": 4, "vip": 5}, "tries": 5,
            "mode": {"bar": "count", "club": "count", "vip": "count"}, "tone": "medium"},
           {"from": 76, "criteria": {"bar": 4, "club": 5, "vip": 6}, "tries": 5,
            "mode": {"bar": "count", "club": "count", "vip": "count"}, "tone": "medium"}
         ]
       }'::jsonb),
       updated_at = now()
 where id = 1 and coalesce((config #>> '{VIDEUR_TOWER,version}')::integer, 1) < 2;

-- ============================================================
-- 2. Seuil de rareté : montée linéaire du niveau 1 au plateau, puis plafond
-- ============================================================
-- Nouveau format : start / max par porte et plateau. L'ancien format (a, b, c, club, vip de la 0032) reste lu
-- si quelqu'un le remet à la main.
create or replace function private.tower_rarity(p_level integer, p_door text)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when r ? 'max' then
      round((r -> 'start' ->> p_door)::numeric
            + ((r -> 'max' ->> p_door)::numeric - (r -> 'start' ->> p_door)::numeric)
              * least(1, greatest(0, (p_level - 1)::numeric / greatest(1, (r ->> 'plateau')::numeric - 1))))::integer
    else
      round(((r ->> 'a')::numeric + (r ->> 'b')::numeric * p_level + (r ->> 'c')::numeric * p_level * p_level)
            * coalesce((r ->> p_door)::numeric, 1))::integer
  end
    from (select private.cfg() -> 'VIDEUR_TOWER' -> 'rarity' as r) x
$$;

-- ============================================================
-- 3. Textes des critères : ajout du ton « medium »
-- ============================================================
-- clear  = en clair (« Pas assez de pièces sombres. ») ;
-- medium = dit ce qui manque, sans la marque ni le nombre (« Il fait nuit dehors : fonce un peu ta tenue. ») ;
-- vague  = indices du Videur d'origine (gardé pour les règles déjà tirées).
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
                  else 'Pas assez de pièces de la bonne marque.' end;
    when 'same_brand' then
      lbl := format('Tenue d''une seule marque (%s pièces minimum)', n);
      hnt := case when vague then 'Faut choisir un camp.'
                  when medium then 'Tu mélanges trop : choisis une seule maison.'
                  else 'Une seule marque, de la tête aux pieds.' end;
    when 'min_brands' then
      lbl := format('Au moins %s marques différentes', n);
      hnt := case when vague then 'Un peu de variété, non ?'
                  when medium then 'Toujours la même maison : mélange un peu.'
                  else 'Mélange davantage de marques.' end;
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
                  else 'Porte plus de pièces.' end;
    when 'max_pieces' then
      lbl := format('%s pièces au maximum', n);
      hnt := case when vague then 'Tu en fais trop.' when medium then 'Tu en fais trop : enlève des pièces.'
                  else 'Trop de pièces : allège ta tenue.' end;
    when 'rarity_min' then
      lbl := format('Au moins %s points de rareté', n);
      hnt := case when vague then 'Ça sent pas la pièce rare.'
                  when medium then 'Ça sent pas la pièce rare : sors tes plus belles cartes.'
                  else 'Pas assez de rareté : porte des pièces plus rares.' end;
    else
      lbl := 'Critère'; hnt := 'Non.';
  end case;
  return p_rule || jsonb_build_object('weight', 0, 'label', coalesce(lbl, 'Critère'), 'hint', coalesce(hnt, 'Non.'));
end;
$$;

-- ============================================================
-- 4. Générateur de règles (copie de la 0032 ; changements marqués « 0033 »)
-- ============================================================
-- 1) une tenue cible T est tirée dans les cartes POSSÉDÉES (3 à 5 pièces, une marque « d'ancrage » favorisée) ;
-- 2) on améliore T (cartes plus rares, emplacements en plus jusqu'à maxOutfitPieces) vers le seuil du niveau ;
-- 3) seuil retenu = min(seuil du niveau, rareté de T) : la règle est réalisable avec les cartes du joueur
--    (portes exigeantes : seulement si stretchShare > 0, coupé par la 0033) ;
-- 4) les autres critères sont DÉDUITS de T (T les respecte tous).
-- → { rules, mode, tone, tries, stretch, threshold, target }
create or replace function private.tower_generate(p_uid uuid, p_level integer, p_day date, p_door text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg      jsonb := private.cfg() -> 'VIDEUR_TOWER';
  rp       jsonb := private.cfg() -> 'VIDEUR' -> 'rarityPoints';
  tier     jsonb := private.tower_tier(p_level);
  seed     text  := p_uid::text || ':' || p_level || ':' || p_day || ':' || p_door;
  n_crit   integer := greatest(2, coalesce((tier -> 'criteria' ->> p_door)::integer, 2));
  v_mode   text := coalesce(tier -> 'mode' ->> p_door, 'count');
  v_tone   text := coalesce(tier ->> 'tone', 'clear');
  v_tries  integer := coalesce((tier ->> 'tries')::integer, 3);
  target   integer := private.tower_rarity(p_level, p_door);
  all_tags text[] := array['sombre', 'clair', 'neutre', 'vif', 'delave', 'terre', 'chaud', 'froid', 'metal'];
  all_slots text[] := array['tete', 'cou', 'haut', 'veste', 'sac', 'bas', 'chaussures'];
  -- 0033 : paliers des minimums réglables (avant : 5 et 15 en dur).
  mid_from  integer := coalesce((cfg ->> 'midFrom')::integer, 6);
  hard_from integer := coalesce((cfg ->> 'hardFrom')::integer, 16);
  max_nb    integer := least(7, greatest(3, coalesce((cfg ->> 'maxOutfitPieces')::integer, 7)));
  lvl_min  integer := case when p_level < mid_from then 1 when p_level < hard_from then 2 else 3 end;
  pool     jsonb := private.tower_pool(p_uid);
  outfit   jsonb := '[]'::jsonb;
  cands    jsonb := '[]'::jsonb;
  rules    jsonb := '[]'::jsonb;
  stretch  boolean;
  anchor   text;
  k        integer;
  s        text;
  t        text;
  b        text;
  card     jsonb;
  gain     integer;
  pts      integer;
  nb       integer;
  n        integer;
  n_brands integer;
  threshold integer;
  max_pts  integer;
  r        jsonb;
begin
  stretch := p_level > coalesce((cfg ->> 'ownedUntilLevel')::integer, 10)
             and private.tower_rand(seed, 'stretch') * 100 < coalesce((cfg ->> 'stretchShare')::numeric, 30);
  if jsonb_array_length(pool) = 0 then pool := private.tower_pool_catalogue(); end if;

  -- 1. Marque d'ancrage et emplacements de la tenue cible.
  select x ->> 'brand' into anchor
    from jsonb_array_elements(pool) x
   group by x ->> 'brand'
   order by private.tower_rand(seed, 'anchor:' || (x ->> 'brand'))
   limit 1;
  k := least(max_nb, 3 + floor(private.tower_rand(seed, 'k') * 3)::integer); -- 3 à 5 pièces
  for s in
    select x ->> 'slot' from jsonb_array_elements(pool) x
     group by x ->> 'slot'
     order by bool_or(x ->> 'brand' = anchor) desc, private.tower_rand(seed, 'slot:' || (x ->> 'slot'))
     limit k
  loop
    select x into card from jsonb_array_elements(pool) x
     where x ->> 'slot' = s
     order by (x ->> 'brand' = anchor) desc, private.tower_rand(seed, 'card:' || (x ->> 'colorway_id') || '|' || (x ->> 'rarity'))
     limit 1;
    outfit := outfit || jsonb_build_array(card);
  end loop;

  -- 2. Monter la rareté de T vers le seuil du niveau (meilleur gain d'abord ; plus de gain possible = on s'arrête).
  --    0033 : un emplacement NOUVEAU n'est ajouté que tant que T a moins de max_nb pièces.
  loop
    select coalesce(sum((x ->> 'pts')::integer), 0) into pts from jsonb_array_elements(outfit) x;
    exit when pts >= target;
    card := null;
    select y, (y ->> 'pts')::integer - coalesce(cur.pts, 0) into card, gain
      from jsonb_array_elements(pool) y
      left join lateral (select (o ->> 'pts')::integer as pts from jsonb_array_elements(outfit) o
                          where o ->> 'slot' = y ->> 'slot') cur on true
     where cur.pts is not null or jsonb_array_length(outfit) < max_nb
     order by 2 desc, (cur.pts is not null) desc, (y ->> 'brand' = anchor) desc,
              private.tower_rand(seed, 'up:' || (y ->> 'colorway_id') || '|' || (y ->> 'rarity'))
     limit 1;
    exit when card is null or gain <= 0;
    select coalesce(jsonb_agg(o), '[]'::jsonb) into outfit from jsonb_array_elements(outfit) o where o ->> 'slot' <> card ->> 'slot';
    outfit := outfit || jsonb_build_array(card);
  end loop;
  select coalesce(sum((x ->> 'pts')::integer), 0) into pts from jsonb_array_elements(outfit) x;

  -- 3. Seuil de rareté retenu.
  max_pts := array_length(all_slots, 1) * coalesce((rp ->> 'legendaire')::integer, 10);
  if stretch then
    threshold := least(target, max_pts,
                       pts + greatest(2, ceil(pts * coalesce((cfg ->> 'stretchRarityPercent')::numeric, 30) / 100)::integer));
  else
    threshold := least(target, pts);
  end if;
  threshold := greatest(threshold, 1);
  stretch := threshold > pts; -- la porte n'est « exigeante » que si elle demande vraiment plus que T

  -- 4. Critères candidats, tous respectés par T. Poids = chance d'être choisi.
  nb := jsonb_array_length(outfit);
  select count(distinct x ->> 'brand') into n_brands from jsonb_array_elements(outfit) x;

  -- Marque : la plus présente dans T (l'ancrage en cas d'égalité).
  select x ->> 'brand', count(*) into b, n from jsonb_array_elements(outfit) x
   group by x ->> 'brand' order by count(*) desc, (x ->> 'brand' = anchor) desc limit 1;
  if b is not null then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 3, 'r', jsonb_build_object('type', 'brand', 'brand', b, 'min', least(n, lvl_min))));
  end if;
  -- Une seule marque (T d'une seule marque, 3 pièces au moins).
  if n_brands = 1 and nb >= 3 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1.5, 'r', jsonb_build_object('type', 'same_brand', 'min', least(nb, 4))));
  end if;
  -- Plusieurs marques.
  if n_brands >= 2 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'min_brands',
               'min', least(n_brands, case when p_level < hard_from then 2 else 3 end))));
  end if;
  -- Couleur présente dans T.
  select tg, count(*) into t, n
    from jsonb_array_elements(outfit) x, jsonb_array_elements_text(x -> 'tags') tg
   where tg = any (all_tags)
   group by tg order by private.tower_rand(seed, 'pal:' || tg) limit 1;
  if t is not null then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 3, 'r', jsonb_build_object('type', 'palette', 'tags', jsonb_build_array(t), 'min', least(n, lvl_min))));
  end if;
  -- Couleur absente de T.
  select tg into t from unnest(all_tags) tg
   where not exists (select 1 from jsonb_array_elements(outfit) x where (x -> 'tags') ? tg)
   order by private.tower_rand(seed, 'forbid:' || tg) limit 1;
  if t is not null then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 2, 'r', jsonb_build_object('type', 'forbid_tag', 'tag', t)));
  end if;
  -- Emplacement rempli dans T.
  select x ->> 'slot' into s from jsonb_array_elements(outfit) x order by private.tower_rand(seed, 'slot+:' || (x ->> 'slot')) limit 1;
  if s is not null then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'slot', 'slot', s)));
  end if;
  -- Emplacement vide dans T (accessoires et veste seulement : « pas de chaussures » n'a pas de sens).
  select sl into s from unnest(array['tete', 'cou', 'sac', 'veste']) sl
   where not exists (select 1 from jsonb_array_elements(outfit) x where x ->> 'slot' = sl)
   order by private.tower_rand(seed, 'slot-:' || sl) limit 1;
  if s is not null then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'no_slot', 'slot', s)));
  end if;
  -- Tenue complète : seulement si T a un haut, un bas et des chaussures (jamais pour une tenue 100 % SIGNAL/9).
  if (select count(distinct x ->> 'slot') from jsonb_array_elements(outfit) x
       where x ->> 'slot' in ('haut', 'bas', 'chaussures')) = 3 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'complete')));
  end if;
  -- Nombre de pièces (marge d'une pièce avant hardFrom).
  if nb >= 3 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'min_pieces',
               'min', greatest(2, nb - case when p_level < hard_from then 1 else 0 end))));
  end if;
  if nb <= 5 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'max_pieces',
               'max', nb + case when p_level < hard_from then 1 else 0 end)));
  end if;

  -- 5. Choix de n_crit − 1 critères (tirage pondéré sans remise), puis le seuil de rareté en dernier.
  for r in
    select c -> 'r' from jsonb_array_elements(cands) c
     order by power(private.tower_rand(seed, 'pick:' || (c -> 'r' ->> 'type')), 1.0 / (c ->> 'w')::numeric) desc
     limit n_crit - 1
  loop
    rules := rules || jsonb_build_array(private.tower_describe(r, v_tone));
  end loop;
  rules := rules || jsonb_build_array(private.tower_describe(jsonb_build_object('type', 'rarity_min', 'min', threshold), v_tone));

  return jsonb_build_object('rules', rules, 'mode', v_mode, 'tone', v_tone, 'tries', v_tries,
                            'stretch', stretch, 'threshold', threshold,
                            'target', (select coalesce(jsonb_agg(jsonb_build_object('slot', x ->> 'slot',
                                         'colorway_id', x ->> 'colorway_id', 'rarity', x ->> 'rarity')), '[]'::jsonb)
                                         from jsonb_array_elements(outfit) x));
end;
$$;

-- ============================================================
-- 5. Se présenter (copie de la 0032 ; seul le choix de l'indice change, marqué « 0033 »)
-- ============================================================
create or replace function public.videur_tower_enter()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  today    date := private.videur_day();
  tc       jsonb := private.cfg() -> 'VIDEUR_TOWER';
  doors    jsonb := private.cfg() -> 'VIDEUR' -> 'doors';
  p        public.profiles;
  r        public.videur_tower_rules;
  v_level  integer;
  v_idx    integer;
  v_door   jsonb;
  v_id     text;
  cleared  integer;
  v_max    integer;
  used     integer;
  v_left   integer;
  ev       jsonb;
  v_matched integer;
  v_total  integer;
  v_passed boolean;
  v_hint   text := null;
  v_line   text := null;
  v_boosters integer := 0;
  v_bonus  integer := 0;
  v_cleared_level boolean := false;
  every    integer;
  n        integer;
  v_out    jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform pg_advisory_xact_lock(hashtext('videur:' || uid::text)); -- pas de double envoi simultané
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Profil introuvable'; end if;

  v_level := p.videur_level + 1;
  v_idx := p.videur_doors;
  v_door := doors -> v_idx;
  v_id := v_door ->> 'id';
  v_max := coalesce((tc ->> 'maxLevelsPerDay')::integer, 5);
  select count(*) into cleared from public.videur_tower_clears where user_id = uid and day = today;
  r := private.tower_rule(uid, v_level, today, v_id);
  select count(*) into used from public.videur_attempts where user_id = uid and day = today and level = v_level and door = v_id;
  if used >= r.tries then raise exception 'Plus d''essai : ce niveau reprend demain, avec une nouvelle règle'; end if;
  if cleared >= v_max then raise exception 'Tu as validé % niveaux aujourd''hui : reviens demain', v_max; end if;
  v_left := r.tries - used - 1;

  ev := private.videur_eval(uid, r.rules);
  if jsonb_array_length(ev -> 'pieces') = 0 then raise exception 'Porte au moins une pièce pour te présenter'; end if;
  v_total := jsonb_array_length(ev -> 'rules');
  select count(*) into v_matched from jsonb_array_elements(ev -> 'rules') x where (x ->> 'ok')::boolean;
  v_passed := v_matched = v_total;

  if v_passed then
    -- Boosters de la porte : une fois par jour et par porte (comme avant la tour).
    if not exists (select 1 from public.videur_attempts a where a.user_id = uid and a.day = today
                     and a.door = v_id and a.passed and a.boosters_gained > 0) then
      v_boosters := coalesce((v_door ->> 'boosters')::integer, 0);
    end if;
    if v_idx < jsonb_array_length(doors) - 1 then
      update public.profiles set videur_doors = v_idx + 1, bonus_stock = bonus_stock + v_boosters where id = uid;
    else
      -- Dernière porte : niveau validé. Booster de palier tous les « levelBonusEvery » niveaux, une seule fois par niveau.
      every := greatest(1, coalesce((tc ->> 'levelBonusEvery')::integer, 5));
      insert into public.videur_tower_clears (user_id, level, day, bonus_boosters)
      values (uid, v_level, today, case when v_level % every = 0 then coalesce((tc ->> 'levelBonusBoosters')::integer, 0) else 0 end)
      on conflict (user_id, level) do nothing
      returning bonus_boosters into v_bonus;
      v_bonus := coalesce(v_bonus, 0);
      v_cleared_level := true;
      update public.profiles set videur_level = v_level, videur_doors = 0,
                                 bonus_stock = bonus_stock + v_boosters + v_bonus
       where id = uid;
    end if;
    select l.text into v_line from public.videur_lines l where l.door = v_id and l.kind = 'enter' order by random() limit 1;
  else
    -- 0033 : un indice sur UN critère raté, en priorité un critère dont le joueur n'a PAS ENCORE reçu l'indice
    -- pour cette règle (chaque essai apprend quelque chose) ; sinon au hasard parmi les critères ratés.
    select x ->> 'hint' into v_hint from jsonb_array_elements(ev -> 'rules') x
     where not (x ->> 'ok')::boolean
     order by exists (select 1 from public.videur_attempts a
                       where a.tower_rule_id = r.id and a.hint = x ->> 'hint'),
              random()
     limit 1;
  end if;

  insert into public.videur_attempts (user_id, day, door, level, tower_rule_id, style, rarity, passed, flow_gained,
                                      boosters_gained, outfit, matched, total, hint)
  values (uid, today, v_id, v_level, r.id, 0, (ev ->> 'rarity_points')::integer, v_passed, 0,
          v_boosters + v_bonus, ev -> 'pieces', v_matched, v_total, v_hint);

  select count(*) into n from public.videur_tower_clears where user_id = uid and day = today;
  v_out := jsonb_build_object(
    'door', v_id, 'level', v_level, 'mode', r.mode, 'passed', v_passed,
    'line', coalesce(v_line, v_hint, ''), 'hint', v_hint, 'tries_left', v_left,
    'boosters_gained', v_boosters, 'level_bonus', v_bonus, 'level_cleared', v_cleared_level,
    'today_cleared', n, 'max_per_day', v_max, 'blocked', not v_passed and v_left <= 0);
  -- Mode visible : le détail ✔/✖ (les règles sont déjà affichées). Count : le compte. Hint : rien de plus.
  if r.mode = 'visible' then
    v_out := v_out || jsonb_build_object('matched', v_matched, 'total', v_total,
      'rules', (select jsonb_agg(jsonb_build_object('label', x ->> 'label', 'ok', (x ->> 'ok')::boolean)) from jsonb_array_elements(ev -> 'rules') x));
  elsif r.mode = 'count' then
    v_out := v_out || jsonb_build_object('matched', v_matched, 'total', v_total);
  end if;
  -- Règle révélée à la fin (réussite ou essais épuisés).
  if r.mode <> 'visible' and (v_passed or v_left <= 0) then
    v_out := v_out || jsonb_build_object('reveal', (select jsonb_agg(x ->> 'label') from jsonb_array_elements(r.rules) x));
  end if;
  return v_out;
end;
$$;

-- ============================================================
-- 6. Droits (inchangés ; redits car les fonctions sont recréées)
-- ============================================================
revoke execute on function private.tower_rarity(integer, text)                from public, anon, authenticated;
revoke execute on function private.tower_describe(jsonb, text)                from public, anon, authenticated;
revoke execute on function private.tower_generate(uuid, integer, date, text)  from public, anon, authenticated;
revoke execute on function public.videur_tower_enter()                        from public, anon;
grant  execute on function public.videur_tower_enter()                        to authenticated;

-- Vérification : seuils de rareté par niveau (Bar / Club / VIP). Attendu : niveau 1 → 3 | 4 | 5 ;
-- niveau 76 → 14 | 18 | 22 ; niveau 120 → 14 | 18 | 22. Et la version des réglages : 2.
select lv as niveau, private.tower_rarity(lv, 'bar') as bar, private.tower_rarity(lv, 'club') as club,
       private.tower_rarity(lv, 'vip') as vip, (select config #>> '{VIDEUR_TOWER,version}' from public.economy_config where id = 1) as version
  from unnest(array[1, 4, 11, 26, 46, 76, 120]) lv;
