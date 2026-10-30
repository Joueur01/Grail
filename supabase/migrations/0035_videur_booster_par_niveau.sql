-- Grail — migration 0035 : le Videur donne 1 booster par NIVEAU validé (au lieu de boosters par porte).
-- Voir CLAUDE.md, section 16. À exécuter APRÈS la 0034 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Décision du développeur (30 octobre 2026) :
--  * Avant : Bar 1 · Club 1 · VIP 2 boosters, une seule fois par jour et par porte. Le 1er niveau du jour
--    rapportait donc 4 boosters et les niveaux 2 à 5 RIEN (sauf le bonus tous les 5 niveaux) : les joueurs qui
--    progressaient le plus n'étaient pas récompensés.
--  * Maintenant : passer une porte ne donne plus de booster ; VALIDER UN NIVEAU (les 3 portes : Bar, Club, VIP)
--    donne 1 booster (economy_config.VIDEUR_TOWER.levelBoosters), une seule fois par niveau. Le bonus tous les
--    5 niveaux (levelBonusEvery, levelBonusBoosters) est GARDÉ. Avec 5 niveaux par jour au maximum : jusqu'à
--    5 boosters par jour (+1 tous les 5 niveaux), à peu près autant qu'avant, mais pour ceux qui avancent.
--  * Toujours jamais de pièces ; les boosters vont dans profiles.bonus_stock (hors du plafond du stock gratuit).
--
-- Fonctions recréées : get_videur_tower (copie de la 0032) et videur_tower_enter (copie de la 0033). Seules les
-- lignes marquées « 0035 » changent.

-- ============================================================
-- 1. Réglage : 1 booster par niveau validé
-- ============================================================
update public.economy_config
   set config = jsonb_set(config, '{VIDEUR_TOWER,levelBoosters}', '1'::jsonb),
       updated_at = now()
 where id = 1
   and config ? 'VIDEUR_TOWER'
   and not (config -> 'VIDEUR_TOWER' ? 'levelBoosters');

-- ============================================================
-- 2. État de la tour (copie de la 0032)
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
    -- 0035 : boosters gagnés en passant CETTE porte = le booster du niveau, à la dernière porte (VIP) seulement
    -- (le bonus de palier est annoncé à part : level_bonus_boosters / next_bonus_level).
    'boosters', case when v_idx = jsonb_array_length(doors) - 1 then coalesce((tc ->> 'levelBoosters')::integer, 1) else 0 end,
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
    'level_boosters', coalesce((tc ->> 'levelBoosters')::integer, 1), -- 0035 : booster de chaque niveau validé
    'next_bonus_level', ((v_level + every - 1) / every) * every,
    'doors', (select jsonb_agg(jsonb_build_object('id', d ->> 'id', 'name', d ->> 'name',
                'state', case when i - 1 < v_idx then 'passed' when i - 1 = v_idx then 'current' else 'locked' end) order by i)
                from jsonb_array_elements(doors) with ordinality t(d, i)),
    'door', out_door);
end;
$$;

-- ============================================================
-- 3. Se présenter (copie de la 0033)
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
    -- 0035 : passer une porte ne donne plus de booster (avant : Bar 1 · Club 1 · VIP 2, une fois par jour).
    if v_idx < jsonb_array_length(doors) - 1 then
      update public.profiles set videur_doors = v_idx + 1 where id = uid;
    else
      -- Dernière porte : niveau validé. Booster de palier tous les « levelBonusEvery » niveaux, une seule fois par niveau.
      every := greatest(1, coalesce((tc ->> 'levelBonusEvery')::integer, 5));
      insert into public.videur_tower_clears (user_id, level, day, bonus_boosters)
      values (uid, v_level, today, case when v_level % every = 0 then coalesce((tc ->> 'levelBonusBoosters')::integer, 0) else 0 end)
      on conflict (user_id, level) do nothing
      returning bonus_boosters into v_bonus;
      -- 0035 : 1 booster par niveau validé, une seule fois par niveau (seulement si la ligne vient d'être créée).
      if found then v_boosters := coalesce((tc ->> 'levelBoosters')::integer, 1); end if;
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
-- 4. Droits (inchangés ; redits car les fonctions sont recréées)
-- ============================================================
revoke execute on function public.get_videur_tower()   from public, anon;
grant  execute on function public.get_videur_tower()   to authenticated;
revoke execute on function public.videur_tower_enter() from public, anon;
grant  execute on function public.videur_tower_enter() to authenticated;

-- Vérification : attendu « 1 | 5 | 1 » (booster par niveau, bonus tous les 5 niveaux, booster bonus).
select config #>> '{VIDEUR_TOWER,levelBoosters}' as booster_par_niveau,
       config #>> '{VIDEUR_TOWER,levelBonusEvery}' as bonus_tous_les,
       config #>> '{VIDEUR_TOWER,levelBonusBoosters}' as booster_bonus
  from public.economy_config where id = 1;
