-- Grail — migration 0032 : le Videur devient une TOUR DE NIVEAUX. Voir CLAUDE.md, section 16.
-- À exécuter APRÈS la 0031 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Décisions du développeur (29 octobre 2026) :
--  * Niveau N = Bar N → Club N → VIP N, dans l'ordre. Les 3 portes quotidiennes (énigme du jour pour tous)
--    sont REMPLACÉES par la tour. 5 niveaux validés par jour au maximum (jour de Paris).
--  * Le niveau remplace le Flow / la réputation comme valeur affichée. Le Flow n'est plus versé ; les colonnes
--    flow, rep_level, rep_next et le déclencheur reputation_rankup restent (on cesse seulement de s'en servir).
--  * Boosters : Bar 1 / Club 1 / VIP 2, une fois par jour et par porte (comme avant) + 1 booster tous les
--    5 niveaux validés (une seule fois par niveau). Jamais de pièces.
--  * La règle d'une porte est PROPRE À CHAQUE JOUEUR (graine = joueur + niveau + jour + porte) et générée ICI
--    à partir de la bibliothèque de critères. Elle est enregistrée (videur_tower_rules) : elle ne change pas
--    dans la journée, même si la collection change. Essais épuisés → niveau bloqué jusqu'au lendemain, et une
--    nouvelle règle est tirée le lendemain.
--  * Niveaux 1 à 10 : la règle est toujours réalisable avec les cartes POSSÉDÉES (on part d'une tenue cible
--    tirée dans la collection du joueur et on en déduit les critères). À partir du niveau 11, ~30 % des portes
--    demandent un peu plus de rareté que ce qu'il possède (pousse à ouvrir, améliorer, acheter).
--  * « Haut, bas et chaussures » (complete) n'est JAMAIS généré pour une tenue cible sans haut : une tenue
--    100 % SIGNAL/9 (aucune pièce « haut ») ne reçoit donc jamais ce critère.
--  * Tous les joueurs démarrent au niveau 1.
--
-- SECRET (CLAUDE.md, section 16) : en mode caché (« count », « hint »), get_videur_tower et videur_tower_enter
-- ne renvoient JAMAIS les règles, les seuils ni les points ; seulement accepté / refusé, « X sur N » (count),
-- l'indice, les essais et, à la fin, la règle. La formule du seuil de rareté et le générateur sont ICI, pas
-- dans le site. Tous les réglages sont dans economy_config.VIDEUR_TOWER.

-- ============================================================
-- 1. Colonnes, tables et réglages
-- ============================================================
alter table public.profiles add column if not exists videur_level integer not null default 0 check (videur_level >= 0); -- niveaux validés
alter table public.profiles add column if not exists videur_doors integer not null default 0 check (videur_doors between 0 and 2); -- portes passées du niveau en cours
alter table public.videur_attempts add column if not exists level integer;          -- niveau de la tour (vide = ancien Videur)
alter table public.videur_attempts add column if not exists tower_rule_id bigint;

-- Règle d'une porte pour un joueur, un niveau et un jour (illisible par le site).
create table if not exists public.videur_tower_rules (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  level      integer not null,
  day        date not null,
  door       text not null check (door in ('bar', 'club', 'vip')),
  mode       text not null check (mode in ('visible', 'count', 'hint')),
  tone       text not null,
  tries      integer not null,
  stretch    boolean not null default false,   -- demande plus de rareté que la collection du joueur
  threshold  integer not null,                 -- minimum de rareté retenu
  rules      jsonb not null,                   -- critères (tous obligatoires), avec label et hint
  target     jsonb not null default '[]'::jsonb, -- tenue cible ayant servi à générer la règle (contrôle, statistiques)
  created_at timestamptz not null default now(),
  unique (user_id, level, day, door)
);
create index if not exists videur_tower_rules_user_idx on public.videur_tower_rules (user_id, day);

-- Niveaux validés (un par joueur et par niveau) : limite quotidienne et booster de palier.
create table if not exists public.videur_tower_clears (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  level          integer not null,
  day            date not null,
  bonus_boosters integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (user_id, level)
);
create index if not exists videur_tower_clears_day_idx on public.videur_tower_clears (user_id, day);
create index if not exists videur_attempts_level_idx on public.videur_attempts (user_id, day, level, door);

alter table public.videur_tower_rules  enable row level security;
alter table public.videur_tower_clears enable row level security;
revoke all on public.videur_tower_rules, public.videur_tower_clears from anon, authenticated;

-- Réglages (on n'écrase pas un réglage déjà modifié à la main).
--  rarity : seuil du Bar N = round(a + b·N + c·N²) ; Club = ×club, VIP = ×vip (sur la valeur non arrondie).
--  tiers  : à partir du niveau « from » : nombre de critères par porte (seuil de rareté compris), essais par
--           porte, mode de chaque porte (visible = règles en clair + aperçu ; count = « X sur N » + indice ;
--           hint = indice seul) et ton des indices (clear = en clair ; vague = indices du Videur d'origine).
update public.economy_config
   set config = config || jsonb_build_object('VIDEUR_TOWER', '{
         "maxLevelsPerDay": 5,
         "rarity": {"a": 2.5, "b": 0.45, "c": 0.01, "club": 1.25, "vip": 1.6},
         "levelBonusEvery": 5,
         "levelBonusBoosters": 1,
         "ownedUntilLevel": 10,
         "stretchShare": 30,
         "stretchRarityPercent": 30,
         "tiers": [
           {"from": 1,  "criteria": {"bar": 2, "club": 2, "vip": 3}, "tries": 3,
            "mode": {"bar": "visible", "club": "visible", "vip": "visible"}, "tone": "clear"},
           {"from": 6,  "criteria": {"bar": 2, "club": 3, "vip": 4}, "tries": 4,
            "mode": {"bar": "count", "club": "count", "vip": "count"}, "tone": "clear"},
           {"from": 16, "criteria": {"bar": 3, "club": 4, "vip": 5}, "tries": 5,
            "mode": {"bar": "count", "club": "count", "vip": "count"}, "tone": "vague"},
           {"from": 31, "criteria": {"bar": 3, "club": 5, "vip": 6}, "tries": 5,
            "mode": {"bar": "count", "club": "count", "vip": "hint"}, "tone": "vague"}
         ]
       }'::jsonb),
       updated_at = now()
 where id = 1 and not (config ? 'VIDEUR_TOWER');

-- ============================================================
-- 2. Fonctions internes : hasard déterministe, paliers, seuil de rareté
-- ============================================================
-- Nombre « au hasard » entre 0 et 1, toujours le même pour une graine et une clé (ne touche pas à random()).
create or replace function private.tower_rand(p_seed text, p_key text)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select (hashtextextended(p_seed || '|' || p_key, 0) & 9223372036854775807)::double precision
         / 9223372036854775807::double precision
$$;

-- Palier d'un niveau (le dernier dont « from » est atteint).
create or replace function private.tower_tier(p_level integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select t from jsonb_array_elements(private.cfg() -> 'VIDEUR_TOWER' -> 'tiers') t
   where (t ->> 'from')::integer <= p_level
   order by (t ->> 'from')::integer desc
   limit 1
$$;

-- Seuil de rareté d'une porte au niveau N (avant plafonnement par la collection).
create or replace function private.tower_rarity(p_level integer, p_door text)
returns integer
language sql
stable
set search_path = ''
as $$
  select round(((r ->> 'a')::numeric + (r ->> 'b')::numeric * p_level + (r ->> 'c')::numeric * p_level * p_level)
               * coalesce((r ->> p_door)::numeric, 1))::integer
    from (select private.cfg() -> 'VIDEUR_TOWER' -> 'rarity' as r) x
$$;

-- Cartes POSSÉDÉES du joueur : [{ colorway_id, rarity, slot, brand, tags, pts }].
create or replace function private.tower_pool(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'colorway_id', c.id, 'rarity', i.rarity::text, 'slot', p.slot, 'brand', p.brand_id,
           'tags', to_jsonb(coalesce(t.tags, '{}'::text[])),
           'pts', coalesce((x.rp ->> i.rarity::text)::integer, 0))), '[]'::jsonb)
    from public.inventory i
    join public.colorways c on c.id = i.colorway_id
    join public.pieces p    on p.id = c.piece_id
    left join public.colorway_tags t on t.colorway_id = c.id
   cross join (select private.cfg() -> 'VIDEUR' -> 'rarityPoints' as rp) x
   where i.user_id = p_uid and i.count > 0
$$;

-- Secours (joueur sans aucune carte) : tout le catalogue, en Commune.
create or replace function private.tower_pool_catalogue()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'colorway_id', c.id, 'rarity', 'commun', 'slot', p.slot, 'brand', p.brand_id,
           'tags', to_jsonb(coalesce(t.tags, '{}'::text[])),
           'pts', coalesce((private.cfg() #>> '{VIDEUR,rarityPoints,commun}')::integer, 1))), '[]'::jsonb)
    from public.colorways c
    join public.pieces p on p.id = c.piece_id
    left join public.colorway_tags t on t.colorway_id = c.id
$$;

-- ============================================================
-- 3. Textes des critères : libellé (révélé à la fin ou affiché en mode visible) et indice
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
  t     text := p_rule ->> 'type';
  vague boolean := p_tone = 'vague';
  n     integer := coalesce((p_rule ->> 'min')::integer, (p_rule ->> 'max')::integer, 1);
  tag   text := coalesce(p_rule -> 'tags' ->> 0, p_rule ->> 'tag');
  slot  text := p_rule ->> 'slot';
  bname text;
  lbl   text;
  hnt   text;
begin
  case t
    when 'brand' then
      select coalesce(to_jsonb(b) ->> 'name', b.id) into bname from public.brands b where b.id = p_rule ->> 'brand';
      lbl := format('Au moins %s pièce%s %s', n, case when n > 1 then 's' else '' end, coalesce(bname, p_rule ->> 'brand'));
      hnt := case when vague then coalesce(brand_vg ->> (p_rule ->> 'brand'), 'Pas la bonne maison, ce soir.')
                  else 'Pas assez de pièces de la bonne marque.' end;
    when 'same_brand' then
      lbl := format('Tenue d''une seule marque (%s pièces minimum)', n);
      hnt := case when vague then 'Faut choisir un camp.' else 'Une seule marque, de la tête aux pieds.' end;
    when 'min_brands' then
      lbl := format('Au moins %s marques différentes', n);
      hnt := case when vague then 'Un peu de variété, non ?' else 'Mélange davantage de marques.' end;
    when 'palette' then
      lbl := case when n <= 1 then format('Au moins une pièce %s', singular ->> tag)
                  else format('Au moins %s pièces %s', n, plural ->> tag) end;
      hnt := case when vague then pal_vg ->> tag
                  when n <= 1 then format('Il manque une pièce %s.', singular ->> tag)
                  else format('Pas assez de pièces %s.', plural ->> tag) end;
    when 'forbid_tag' then
      lbl := format('Aucune pièce %s', singular ->> tag);
      hnt := case when vague then forb_vg ->> tag else format('Enlève tes pièces %s.', plural ->> tag) end;
    when 'slot' then
      lbl := have_lbl ->> slot;
      hnt := case when vague then coalesce(have_vg ->> slot, 'Il manque quelque chose, non ?') else have_clr ->> slot end;
    when 'no_slot' then
      lbl := none_lbl ->> slot;
      hnt := case when vague then none_vg ->> slot else none_clr ->> slot end;
    when 'complete' then
      lbl := 'Haut, bas et chaussures portés';
      hnt := case when vague then 'Il manque quelque chose, non ?' else 'Il faut un haut, un bas et des chaussures.' end;
    when 'min_pieces' then
      lbl := format('Au moins %s pièces portées', n);
      hnt := case when vague then 'Sois plus habillé.' else 'Porte plus de pièces.' end;
    when 'max_pieces' then
      lbl := format('%s pièces au maximum', n);
      hnt := case when vague then 'Tu en fais trop.' else 'Trop de pièces : allège ta tenue.' end;
    when 'rarity_min' then
      lbl := format('Au moins %s points de rareté', n);
      hnt := case when vague then 'Ça sent pas la pièce rare.' else 'Pas assez de rareté : porte des pièces plus rares.' end;
    else
      lbl := 'Critère'; hnt := 'Non.';
  end case;
  return p_rule || jsonb_build_object('weight', 0, 'label', coalesce(lbl, 'Critère'), 'hint', coalesce(hnt, 'Non.'));
end;
$$;

-- ============================================================
-- 4. Générateur de règles
-- ============================================================
-- 1) une tenue cible T est tirée dans les cartes POSSÉDÉES (3 à 5 pièces, une marque « d'ancrage » favorisée) ;
-- 2) on améliore T (cartes plus rares, emplacements en plus) jusqu'au seuil de rareté du niveau, si possible ;
-- 3) seuil retenu = min(seuil du niveau, rareté de T) ; porte « exigeante » (niveau 11+, ~30 %) : un peu plus
--    que T (+30 %, au moins +2), sans dépasser le seuil du niveau ;
-- 4) les autres critères sont DÉDUITS de T (T les respecte tous) : la règle est donc réalisable avec les cartes
--    du joueur, sauf la rareté d'une porte exigeante.
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
  lvl_min  integer := case when p_level <= 5 then 1 when p_level <= 15 then 2 else 3 end;
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
  k := 3 + floor(private.tower_rand(seed, 'k') * 3)::integer; -- 3 à 5 pièces
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
  loop
    select coalesce(sum((x ->> 'pts')::integer), 0) into pts from jsonb_array_elements(outfit) x;
    exit when pts >= target;
    select y, (y ->> 'pts')::integer - coalesce(cur.pts, 0) into card, gain
      from jsonb_array_elements(pool) y
      left join lateral (select (o ->> 'pts')::integer as pts from jsonb_array_elements(outfit) o
                          where o ->> 'slot' = y ->> 'slot') cur on true
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
               'min', least(n_brands, case when p_level <= 15 then 2 else 3 end))));
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
  -- Tenue complète : seulement si T a un haut, un bas et des chaussures. Une tenue 100 % SIGNAL/9 n'a pas de
  -- haut : elle ne reçoit donc jamais ce critère (décision du développeur : ne jamais générer ce cas).
  if (select count(distinct x ->> 'slot') from jsonb_array_elements(outfit) x
       where x ->> 'slot' in ('haut', 'bas', 'chaussures')) = 3 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'complete')));
  end if;
  -- Nombre de pièces.
  if nb >= 3 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'min_pieces',
               'min', greatest(2, nb - case when p_level <= 15 then 1 else 0 end))));
  end if;
  if nb <= 5 then
    cands := cands || jsonb_build_array(jsonb_build_object('w', 1, 'r', jsonb_build_object('type', 'max_pieces',
               'max', nb + case when p_level <= 15 then 1 else 0 end)));
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

-- Règle d'une porte pour un joueur, un niveau et un jour : lue si elle existe, sinon générée et enregistrée.
create or replace function private.tower_rule(p_uid uuid, p_level integer, p_day date, p_door text)
returns public.videur_tower_rules
language plpgsql
set search_path = ''
as $$
declare
  r public.videur_tower_rules;
  g jsonb;
begin
  select * into r from public.videur_tower_rules where user_id = p_uid and level = p_level and day = p_day and door = p_door;
  if found then return r; end if;
  g := private.tower_generate(p_uid, p_level, p_day, p_door);
  insert into public.videur_tower_rules (user_id, level, day, door, mode, tone, tries, stretch, threshold, rules, target)
  values (p_uid, p_level, p_day, p_door, g ->> 'mode', g ->> 'tone', (g ->> 'tries')::integer, (g ->> 'stretch')::boolean,
          (g ->> 'threshold')::integer, g -> 'rules', g -> 'target')
  on conflict (user_id, level, day, door) do nothing;
  select * into r from public.videur_tower_rules where user_id = p_uid and level = p_level and day = p_day and door = p_door;
  return r;
end;
$$;

-- ============================================================
-- 5. Fonctions du jeu
-- ============================================================
-- État de la tour : niveau, porte en cours, essais, statut (play | blocked | limit). Règles seulement en mode visible.
create or replace function public.get_videur_tower()
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
  tier     jsonb;
  cleared  integer;
  v_max    integer;
  v_tries  integer;
  v_mode   text;
  used     integer;
  status   text;
  every    integer;
  out_door jsonb;
  streak   integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select * into p from public.profiles where id = uid;
  if not found then raise exception 'Profil introuvable'; end if;

  v_level := p.videur_level + 1;
  v_idx := p.videur_doors;
  v_door := doors -> v_idx;
  v_id := v_door ->> 'id';
  tier := private.tower_tier(v_level);
  v_max := coalesce((tc ->> 'maxLevelsPerDay')::integer, 5);
  select count(*) into cleared from public.videur_tower_clears where user_id = uid and day = today;
  select * into r from public.videur_tower_rules where user_id = uid and level = v_level and day = today and door = v_id;
  select count(*) into used from public.videur_attempts where user_id = uid and day = today and level = v_level and door = v_id;
  v_tries := coalesce(r.tries, (tier ->> 'tries')::integer);
  status := case when used >= v_tries then 'blocked' when cleared >= v_max then 'limit' else 'play' end;
  if status = 'play' and r.id is null then r := private.tower_rule(uid, v_level, today, v_id); end if;
  v_mode := coalesce(r.mode, tier -> 'mode' ->> v_id, 'count');
  v_tries := coalesce(r.tries, v_tries);

  out_door := jsonb_build_object(
    'id', v_id, 'name', v_door ->> 'name', 'mode', v_mode, 'tries', v_tries, 'tries_left', greatest(v_tries - used, 0),
    -- Boosters encore à gagner à cette porte aujourd'hui (une fois par jour et par porte).
    'boosters', case when exists (select 1 from public.videur_attempts a where a.user_id = uid and a.day = today
                                    and a.door = v_id and a.passed and a.boosters_gained > 0)
                     then 0 else coalesce((v_door ->> 'boosters')::integer, 0) end,
    'attempts', (select coalesce(jsonb_agg(
                    case when v_mode = 'hint' then jsonb_build_object('passed', a.passed, 'hint', a.hint)
                         else jsonb_build_object('passed', a.passed, 'hint', a.hint, 'matched', a.matched, 'total', a.total) end
                    order by a.id), '[]'::jsonb)
                   from public.videur_attempts a
                  where a.user_id = uid and a.day = today and a.level = v_level and a.door = v_id));
  -- Mode visible : les règles en clair. Porte bloquée : la règle est révélée.
  if v_mode = 'visible' and r.id is not null then
    out_door := out_door || jsonb_build_object('rules', (select jsonb_agg(jsonb_build_object('label', x ->> 'label')) from jsonb_array_elements(r.rules) x));
  end if;
  if status = 'blocked' and r.id is not null then
    out_door := out_door || jsonb_build_object('reveal', (select jsonb_agg(x ->> 'label') from jsonb_array_elements(r.rules) x));
  end if;

  every := greatest(1, coalesce((tc ->> 'levelBonusEvery')::integer, 5));
  streak := case when exists (select 1 from public.videur_attempts where user_id = uid and day = today and door = 'bar' and passed)
                 then private.videur_streak(uid, today) else private.videur_streak(uid, today - 1) end;

  return jsonb_build_object(
    'day', today, 'level', v_level, 'levels_done', p.videur_level, 'doors_passed', v_idx,
    'today_cleared', cleared, 'max_per_day', v_max, 'status', status, 'streak', streak,
    'played_today', exists (select 1 from public.videur_attempts where user_id = uid and day = today and level is not null),
    'level_bonus_every', every, 'level_bonus_boosters', coalesce((tc ->> 'levelBonusBoosters')::integer, 0),
    'next_bonus_level', ((v_level + every - 1) / every) * every,
    'doors', (select jsonb_agg(jsonb_build_object('id', d ->> 'id', 'name', d ->> 'name',
                'state', case when i - 1 < v_idx then 'passed' when i - 1 = v_idx then 'current' else 'locked' end) order by i)
                from jsonb_array_elements(doors) with ordinality t(d, i)),
    'door', out_door);
end;
$$;

-- Aperçu GRATUIT : seulement en mode visible (niveaux 1 à 5). Ne consomme rien.
create or replace function public.videur_tower_preview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  today date := private.videur_day();
  p     public.profiles;
  v_id  text;
  r     public.videur_tower_rules;
  ev    jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select * into p from public.profiles where id = uid;
  v_id := private.cfg() -> 'VIDEUR' -> 'doors' -> p.videur_doors ->> 'id';
  select * into r from public.videur_tower_rules where user_id = uid and level = p.videur_level + 1 and day = today and door = v_id;
  if r.id is null or r.mode <> 'visible' then raise exception 'Pas d''aperçu pour cette porte'; end if;
  ev := private.videur_eval(uid, r.rules);
  return jsonb_build_object(
    'pieces', ev -> 'pieces', 'rarity_points', ev -> 'rarity_points',
    'rules', (select jsonb_agg(jsonb_build_object('label', x ->> 'label', 'ok', (x ->> 'ok')::boolean)) from jsonb_array_elements(ev -> 'rules') x),
    'matched', (select count(*) from jsonb_array_elements(ev -> 'rules') x where (x ->> 'ok')::boolean),
    'total', jsonb_array_length(ev -> 'rules'));
end;
$$;

-- Se présenter à la porte en cours : consomme un essai, avance dans la tour, verse les boosters.
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
    -- Un indice sur UN critère raté, tiré au hasard.
    select x ->> 'hint' into v_hint from jsonb_array_elements(ev -> 'rules') x
     where not (x ->> 'ok')::boolean order by random() limit 1;
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
-- 6. Les anciennes portes quotidiennes sont remplacées
-- ============================================================
-- Un site resté en cache (ancienne version) affiche ce message au lieu de jouer aux anciennes portes
-- (sinon on pourrait gagner deux fois les boosters du jour).
create or replace function public.get_videur_night()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'Le Videur a changé : recharge la page.'; end;
$$;
create or replace function public.videur_preview(p_door text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'Le Videur a changé : recharge la page.'; end;
$$;
create or replace function public.videur_enter(p_door text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'Le Videur a changé : recharge la page.'; end;
$$;

-- ============================================================
-- 7. Profil : le niveau du Videur (copie de la version de la 0022 + videur_level, videur_doors)
-- ============================================================
create or replace function public.get_player_profile(p_player uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  target  uuid;
  is_self boolean;
  p       public.profiles%rowtype;
  today   date := (now() at time zone 'Europe/Paris')::date;
  streak  integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  target := coalesce(p_player, uid);
  is_self := target = uid;

  -- Seul un AMI accepté peut lire le profil d'un autre joueur.
  if not is_self and not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester = uid and addressee = target) or (requester = target and addressee = uid))
  ) then
    raise exception 'Ce joueur n''est pas ton ami';
  end if;

  select * into p from public.profiles where id = target;
  if not found then raise exception 'Profil introuvable'; end if;

  -- Série du Videur : aujourd'hui si le Bar est déjà passé, sinon jusqu'à hier.
  streak := case when exists (select 1 from public.videur_attempts
                               where user_id = target and day = today and door = 'bar' and passed)
                 then private.videur_streak(target, today) else private.videur_streak(target, today - 1) end;

  return jsonb_build_object(
    'is_self', is_self,
    'pseudo', p.pseudo,
    'member_since', p.created_at,
    'avatar_body', p.avatar_body,
    -- Tenue portée ET encore possédée (Ultime compris) : { emplacement: "coloris|rareté" }
    'equipped', (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each_text(coalesce(p.equipped, '{}'::jsonb)) e
       where private.owns_card(target, e.value)
    ),
    -- Collection : cartes différentes (coloris + rareté), album compris, exemplaires, détail par rareté
    'cards_owned', (select count(*) from (
                      select colorway_id, rarity::text from public.inventory where user_id = target and count > 0
                      union
                      select colorway_id, rarity from public.album_cards where user_id = target) u),
    'cards_total', (select count(*) * 4 from public.colorways),
    'copies', (select coalesce(sum(count), 0) from public.inventory where user_id = target and count > 0)
              + (select count(*) from public.album_cards where user_id = target),
    'by_rarity', (
      select jsonb_build_object(
        'commun',     count(*) filter (where rarity = 'commun'),
        'rare',       count(*) filter (where rarity = 'rare'),
        'epique',     count(*) filter (where rarity = 'epique'),
        'legendaire', count(*) filter (where rarity = 'legendaire'))
        from (select colorway_id, rarity::text as rarity from public.inventory where user_id = target and count > 0
              union
              select colorway_id, rarity from public.album_cards where user_id = target) u
    ),
    'album_cards', (select count(*) from public.album_cards where user_id = target),
    'ultimates', (select count(*) from public.album_ultimates where user_id = target),
    -- Vitrine CHOISIE par le joueur, dans son ordre ; seules les cartes encore possédées.
    'showcase', (
      select coalesce(jsonb_agg(jsonb_build_object(
                        'colorway_id', split_part(s.card, '|', 1),
                        'rarity', split_part(s.card, '|', 2),
                        'count', coalesce((select i.count from public.inventory i
                                            where i.user_id = target
                                              and i.colorway_id = split_part(s.card, '|', 1)
                                              and i.rarity::text = split_part(s.card, '|', 2)), 1))
                                order by s.pos), '[]'::jsonb)
        from jsonb_array_elements_text(coalesce(p.showcase, '[]'::jsonb)) with ordinality as s(card, pos)
       where private.owns_card(target, s.card)
    ),
    'showcase_max', private.showcase_max(),
    'boosters_opened', (select count(*) from public.transactions where user_id = target and kind = 'booster'),
    'friends', (select count(*) from public.friendships
                 where status = 'accepted' and (requester = target or addressee = target)),
    -- Ancienne réputation (plus affichée depuis la 0032, gardée pour mémoire)
    'flow', p.flow,
    'rep_level', p.rep_level,
    'rep_next', p.rep_next,
    -- Tour du Videur : niveaux validés et portes passées du niveau en cours (0 à 2)
    'videur_level', p.videur_level,
    'videur_doors', p.videur_doors,
    'videur_streak', streak,
    -- Le solde de pièces reste privé : visible seulement par le joueur lui-même.
    'coins', case when is_self then p.coins else null end
  );
end;
$$;

-- ============================================================
-- 8. Statistiques et droits
-- ============================================================
-- Par jour, niveau et porte : essais, réussites, joueurs, % moyen de critères respectés, boosters, portes exigeantes.
create or replace view public.analytics_videur_tower as
  select a.day, a.level, a.door, count(*) as attempts, count(*) filter (where a.passed) as passes,
         count(distinct a.user_id) as players,
         round(avg(a.matched::numeric / nullif(a.total, 0)) * 100, 0) as avg_matched_pct,
         coalesce(sum(a.boosters_gained), 0) as boosters_given,
         count(*) filter (where r.stretch) as stretch_attempts
    from public.videur_attempts a
    left join public.videur_tower_rules r on r.id = a.tower_rule_id
   where a.level is not null
   group by a.day, a.level, a.door
   order by a.day desc, a.level, a.door;
-- Répartition des joueurs par niveau en cours.
create or replace view public.analytics_videur_levels as
  select videur_level + 1 as level, count(*) as players
    from public.profiles
   group by videur_level
   order by videur_level;
revoke all on public.analytics_videur_tower, public.analytics_videur_levels from anon, authenticated;

revoke execute on function private.tower_rand(text, text)                     from public, anon, authenticated;
revoke execute on function private.tower_tier(integer)                        from public, anon, authenticated;
revoke execute on function private.tower_rarity(integer, text)                from public, anon, authenticated;
revoke execute on function private.tower_pool(uuid)                           from public, anon, authenticated;
revoke execute on function private.tower_pool_catalogue()                     from public, anon, authenticated;
revoke execute on function private.tower_describe(jsonb, text)                from public, anon, authenticated;
revoke execute on function private.tower_generate(uuid, integer, date, text)  from public, anon, authenticated;
revoke execute on function private.tower_rule(uuid, integer, date, text)      from public, anon, authenticated;

revoke execute on function public.get_videur_tower()        from public, anon;
revoke execute on function public.videur_tower_preview()    from public, anon;
revoke execute on function public.videur_tower_enter()      from public, anon;
revoke execute on function public.get_videur_night()        from public, anon;
revoke execute on function public.videur_preview(text)      from public, anon;
revoke execute on function public.videur_enter(text)        from public, anon;
revoke execute on function public.get_player_profile(uuid)  from public, anon;
grant  execute on function public.get_videur_tower()        to authenticated;
grant  execute on function public.videur_tower_preview()    to authenticated;
grant  execute on function public.videur_tower_enter()      to authenticated;
grant  execute on function public.get_videur_night()        to authenticated;
grant  execute on function public.videur_preview(text)      to authenticated;
grant  execute on function public.videur_enter(text)        to authenticated;
grant  execute on function public.get_player_profile(uuid)  to authenticated;
