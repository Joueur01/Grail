-- Grail — migration 0031 : Club et VIP plus faciles (correctif rapide). Voir CLAUDE.md, section 16.
-- À exécuter APRÈS la 0013 et la 0024 (SQL Editor de Supabase). Peut être relancée sans risque :
-- une 2e exécution ne change plus rien.
--
-- Retours de la bêta : le Club (4 critères) et le VIP (5) étaient trop durs (minimum de rareté de 7 à 26 points,
-- alors qu'un joueur au 2e jour en a ~8 à 10) et les indices de couleur trop cryptiques.
-- Cette migration modifie les énigmes existantes (table videur_riddles, 28 au Club et 28 au VIP) :
--  1. un critère « de remplissage » de moins par énigme : Club 4 → 3, VIP 5 → 4. Types retirés, dans cet
--     ordre de préférence : complete, min_pieces, max_pieces, slot, no_slot. Marque, couleur et rareté restent.
--     On ne retire que tant que l'énigme a PLUS de critères que la cible : relancer ne retire rien de plus.
--     Retirer un critère ne peut que rendre l'énigme plus facile : elle reste réalisable.
--  2. minimum de rareté plafonné (rarity_min) : Club 9 points, VIP 14 points. Les maximums (rarity_max)
--     ne changent pas.
--  3. indices des critères de couleur (palette, forbid_tag) réécrits en clair (« Pas assez de pièces sombres. »).
--     Les indices de marque restent évasifs (ils ne nomment pas la marque).
--  4. le VIP passe en mode « count » : après chaque essai, « X critères sur N » + un indice, comme au Club.
--
-- SECRET INCHANGÉ : les règles restent dans videur_riddles (illisible par le site) ; get_videur_night et
-- videur_enter ne renvoient toujours ni règles, ni seuils, ni points pour le Club et le VIP.
-- Le nombre d'énigmes actives ne change pas : la rotation du jour (cycle de 28 jours) ne bouge pas.

-- ============================================================
-- 1. Énigmes : un critère de moins, rareté plafonnée, indices de couleur en clair
-- ============================================================
do $$
declare
  -- Réglages de ce correctif (valeurs du brief du développeur, à ajuster avec analytics_videur_daily).
  c_target   constant jsonb := '{"club": 3, "vip": 4}';   -- nombre de critères visé par porte
  c_cap      constant jsonb := '{"club": 9, "vip": 14}';  -- plafond du minimum de rareté
  c_filler   constant text[] := array['complete', 'min_pieces', 'max_pieces', 'slot', 'no_slot'];
  -- Nom de chaque couleur (étiquettes de colorway_tags) au pluriel et au singulier, pour les indices.
  c_plural   constant jsonb := '{"sombre": "sombres", "clair": "claires", "neutre": "neutres",
                                 "vif": "de couleur vive", "delave": "délavées", "metal": "à reflet métal",
                                 "chaud": "aux tons chauds", "froid": "aux tons froids", "terre": "aux tons terre"}';
  c_singular constant jsonb := '{"sombre": "sombre", "clair": "claire", "neutre": "neutre",
                                 "vif": "de couleur vive", "delave": "délavée", "metal": "à reflet métal",
                                 "chaud": "aux tons chauds", "froid": "aux tons froids", "terre": "aux tons terre"}';
  rec      record;
  v_rules  jsonb;
  v_idx    integer;
  v_target integer;
  v_cap    integer;
  v_done   integer := 0;
begin
  for rec in select id, door, rules from public.videur_riddles where door in ('club', 'vip') order by id loop
    v_rules  := rec.rules;
    v_target := (c_target ->> rec.door)::integer;
    v_cap    := (c_cap ->> rec.door)::integer;

    -- 1. Retirer des critères de remplissage tant qu'il y en a trop (le moins utile d'abord).
    while jsonb_array_length(v_rules) > v_target loop
      select (t.ord - 1)::integer into v_idx
        from jsonb_array_elements(v_rules) with ordinality t(r, ord)
       where t.r ->> 'type' = any (c_filler)
       order by array_position(c_filler, t.r ->> 'type'), t.ord
       limit 1;
      exit when v_idx is null; -- plus aucun critère de remplissage : on garde l'énigme telle quelle
      v_rules := v_rules - v_idx;
    end loop;

    -- 2 et 3. Plafond de rareté et indices de couleur en clair (l'ordre des critères est conservé).
    select jsonb_agg(
             case
               when t.r ->> 'type' = 'rarity_min' and (t.r ->> 'min')::integer > v_cap then
                 t.r || jsonb_build_object('min', v_cap, 'label', format('Au moins %s points de rareté', v_cap))
               -- palette à une seule couleur connue : « Il manque une pièce sombre. » / « Pas assez de pièces sombres. »
               when t.r ->> 'type' = 'palette' and jsonb_array_length(t.r -> 'tags') = 1
                    and c_plural ? (t.r -> 'tags' ->> 0) then
                 t.r || jsonb_build_object('hint',
                   case when coalesce((t.r ->> 'min')::integer, 1) <= 1
                        then format('Il manque une pièce %s.', c_singular ->> (t.r -> 'tags' ->> 0))
                        else format('Pas assez de pièces %s.', c_plural ->> (t.r -> 'tags' ->> 0)) end)
               -- couleur interdite : « Enlève tes pièces de couleur vive. »
               when t.r ->> 'type' = 'forbid_tag' and c_plural ? (t.r ->> 'tag') then
                 t.r || jsonb_build_object('hint', format('Enlève tes pièces %s.', c_plural ->> (t.r ->> 'tag')))
               else t.r
             end
             order by t.ord)
      into v_rules
      from jsonb_array_elements(v_rules) with ordinality t(r, ord);

    if v_rules is distinct from rec.rules then
      update public.videur_riddles set rules = v_rules where id = rec.id;
      v_done := v_done + 1;
    end if;
  end loop;
  raise notice 'Migration 0031 : % énigme(s) modifiée(s).', v_done;
end;
$$;

-- ============================================================
-- 2. VIP en mode « count » (« X critères sur N » + indice, comme le Club)
-- ============================================================
-- L'introduction du VIP disait « il ne te dira presque rien » : elle est adaptée au nouveau mode.
update public.economy_config
   set config = jsonb_set(config, '{VIDEUR,doors}', (
         select jsonb_agg(
                  case when d ->> 'id' = 'vip'
                       then d || jsonb_build_object('mode', 'count',
                              'intro', 'Ici, le videur compte ce qui va et lâche un mot sur ce qui manque. Pas plus.')
                       else d end
                  order by ord)
           from jsonb_array_elements(config -> 'VIDEUR' -> 'doors') with ordinality t(d, ord))),
       updated_at = now()
 where id = 1
   and config ? 'VIDEUR'
   and exists (select 1 from jsonb_array_elements(config -> 'VIDEUR' -> 'doors') d
                where d ->> 'id' = 'vip' and d ->> 'mode' is distinct from 'count');

-- ============================================================
-- 3. Vérification (à lire dans le résultat du SQL Editor)
-- ============================================================
-- Une ligne par porte : nombre d'énigmes, critères par énigme (min / max), plus haut minimum de rareté,
-- nombre de critères « complete » restants et mode de la porte. Attendu :
--   club | 28 | 3 | 3 | 9  | 0 | count
--   vip  | 28 | 4 | 4 | 14 | 0 | count
select r.door,
       count(*) as enigmes,
       min(jsonb_array_length(r.rules)) as criteres_min,
       max(jsonb_array_length(r.rules)) as criteres_max,
       max((select max((x ->> 'min')::integer) from jsonb_array_elements(r.rules) x where x ->> 'type' = 'rarity_min')) as rarete_min_max,
       sum((select count(*) from jsonb_array_elements(r.rules) x where x ->> 'type' = 'complete')) as complete_restants,
       (select d ->> 'mode' from public.economy_config e, jsonb_array_elements(e.config -> 'VIDEUR' -> 'doors') d
         where e.id = 1 and d ->> 'id' = r.door) as mode
  from public.videur_riddles r
 where r.active
 group by r.door
 order by r.door;
