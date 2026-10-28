-- Grail — migration 0026 : le Videur donne des BOOSTERS. Voir CLAUDE.md, sections 6 et 16.
-- À exécuter APRÈS la 0025 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Récompense (une seule fois par jour et par porte, quand on y entre) :
--   Bar : 1 booster · Club : 1 booster · VIP : 2 boosters   (economy_config.VIDEUR.doors[].boosters)
-- Pas de pièces (décision du développeur : elles n'ont presque aucune façon de disparaître du jeu, donner
-- des pièces au Videur ferait monter les prix du Market).
--
-- Comment : ces boosters s'ajoutent dans une colonne À PART (`profiles.bonus_stock`), HORS du plafond du
-- stock gratuit (3) et sans toucher à private.refill (les migrations 0001 à 0004 ne sont pas dans le dépôt).
-- On les ouvre APRÈS le stock gratuit : tant qu'il reste un booster gratuit, c'est lui qui part, donc le
-- minuteur de recharge repart tout de suite et rien n'est perdu. Un booster offert est un booster comme les
-- autres : mêmes taux, mêmes garanties (pity), et il compte dans le compteur « Signature ».
--
-- Redéfinit get_booster_state, open_booster (copies des versions du serveur + la colonne bonus_stock)
-- et videur_enter (copie de la 0013 + la récompense).

-- ============================================================
-- 1. Colonnes et réglages
-- ============================================================
alter table public.profiles add column if not exists bonus_stock integer not null default 0 check (bonus_stock >= 0);
alter table public.videur_attempts add column if not exists boosters_gained integer not null default 0;

-- Boosters par porte (on ne remplace pas une valeur déjà réglée à la main).
update public.economy_config
   set config = jsonb_set(config, '{VIDEUR,doors}', (
         select jsonb_agg(
                  case when d ? 'boosters' then d
                       else d || jsonb_build_object('boosters', case d ->> 'id' when 'vip' then 2 else 1 end)
                  end
                  order by ord)
           from jsonb_array_elements(config -> 'VIDEUR' -> 'doors') with ordinality t(d, ord))),
       updated_at = now()
 where id = 1 and config ? 'VIDEUR';

-- ============================================================
-- 2. État des boosters : + les boosters offerts
-- ============================================================
create or replace function public.get_booster_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  cfg       jsonb := private.cfg();
  p         public.profiles%rowtype;
  r         record;
  max_stock integer := (cfg -> 'BOOSTER' ->> 'maxStock')::integer;
  every     integer := (cfg -> 'BOOSTER' ->> 'signatureEvery')::integer;
  refill_s  numeric := (cfg -> 'BOOSTER' ->> 'refillHours')::numeric * 3600;
  next_in   integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Profil introuvable'; end if;

  select * into r from private.refill(p.booster_stock, p.stock_updated_at, cfg);
  if r.new_stock <> p.booster_stock then
    update public.profiles set booster_stock = r.new_stock, stock_updated_at = r.new_updated where id = uid;
  end if;

  next_in := case
    when r.new_stock >= max_stock then null
    else greatest(0, round(refill_s - extract(epoch from (now() - r.new_updated))))::integer
  end;

  return jsonb_build_object(
    'stock', r.new_stock,
    'bonus_stock', p.bonus_stock,
    'max_stock', max_stock,
    'next_in_seconds', next_in,
    'signature_next', ((p.free_opened + 1) % every = 0),
    'until_signature', every - (p.free_opened % every),
    'pity_legendary', p.pity_legendary,
    'pity_epic', p.pity_epic,
    'coins', p.coins,
    'tutorial_done', p.tutorial_done
  );
end;
$$;

-- ============================================================
-- 3. Ouverture : le stock gratuit d'abord, puis les boosters offerts
-- ============================================================
create or replace function public.open_booster()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  cfg       jsonb := private.cfg();
  p         public.profiles%rowtype;
  rf        record;
  n_cards   integer := (cfg -> 'BOOSTER' ->> 'cardsPerPack')::integer;
  every     integer := (cfg -> 'BOOSTER' ->> 'signatureEvery')::integer;
  is_sig    boolean;
  from_bonus boolean;
  soft_from integer := (cfg -> 'PITY' -> 'legendary' ->> 'softStart')::integer;
  soft_step numeric := (cfg -> 'PITY' -> 'legendary' ->> 'softStep')::numeric;
  guar_leg  integer := (cfg -> 'PITY' -> 'legendary' ->> 'guaranteedAt')::integer;
  guar_epic integer := (cfg -> 'PITY' -> 'epic' ->> 'guaranteedAfter')::integer;
  bonus     numeric := 0;
  rars      public.rarity[] := array[]::public.rarity[];
  cws       text[] := array[]::text[];
  news      boolean[] := array[]::boolean[];
  rates     jsonb;
  forced    text;
  forced_i  integer := 0;
  low_i     integer;
  has_epic  boolean := false;
  has_leg   boolean := false;
  i         integer;
  cards     jsonb := '[]'::jsonb;
  sorted    jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Profil introuvable'; end if;

  -- 1. Stock : il faut au moins un booster (gratuit, sinon offert).
  select * into rf from private.refill(p.booster_stock, p.stock_updated_at, cfg);
  if rf.new_stock <= 0 and p.bonus_stock <= 0 then raise exception 'Aucun booster disponible'; end if;
  from_bonus := rf.new_stock <= 0;
  is_sig := ((p.free_opened + 1) % every = 0);

  -- 2. Les raretés, carte par carte (avec la pity douce).
  if p.pity_legendary >= soft_from then
    bonus := (p.pity_legendary - soft_from + 1) * soft_step;
  end if;
  for i in 1 .. n_cards loop
    rates := case when is_sig and i = n_cards
                  then cfg -> 'DROP_RATES' -> 'signatureLast'
                  else cfg -> 'DROP_RATES' -> 'standard' end;
    rars := rars || private.draw_rarity(private.boosted_rates(rates, bonus));
  end loop;

  -- 3. Les garanties (pity). La carte qui reçoit la garantie : la carte Signature,
  --    sinon la carte la moins rare (la première en cas d'égalité).
  low_i := 1;
  for i in 2 .. n_cards loop
    if private.rarity_rank(rars[i]) < private.rarity_rank(rars[low_i]) then low_i := i; end if;
  end loop;

  for i in 1 .. n_cards loop
    if private.rarity_rank(rars[i]) >= 2 then has_epic := true; end if;
  end loop;

  if p.pity_legendary + 1 >= guar_leg and not ('legendaire'::public.rarity = any (rars)) then
    forced_i := case when is_sig then n_cards else low_i end;
    rars[forced_i] := 'legendaire';
    forced := 'legendaire';
  elsif p.pity_epic >= guar_epic and not has_epic then
    forced_i := case when is_sig then n_cards else low_i end;
    rars[forced_i] := 'epique';
    forced := 'epique';
  end if;

  -- 4. Un coloris au hasard (uniforme sur tout le catalogue) pour chaque carte.
  for i in 1 .. n_cards loop
    cws := cws || (select id from public.colorways order by random() limit 1);
  end loop;

  -- 5. « NOUVEAU » : calculé sur la collection AVANT ce booster.
  for i in 1 .. n_cards loop
    news := news || (not exists (
      select 1 from public.inventory
       where user_id = uid and colorway_id = cws[i] and rarity = rars[i]
    ));
  end loop;

  -- 6. Compteurs de pity, remis à 0 quand la rareté est sortie.
  has_leg := 'legendaire'::public.rarity = any (rars);
  has_epic := false;
  for i in 1 .. n_cards loop
    if private.rarity_rank(rars[i]) >= 2 then has_epic := true; end if;
  end loop;

  -- 7. Écriture : cartes, stock, compteurs.
  for i in 1 .. n_cards loop
    perform private.give_cards(uid, cws[i], rars[i], 1);
    cards := cards || jsonb_build_object(
      'idx', i,
      'key', (case when is_sig and i = n_cards then 100 else 0 end) + private.rarity_rank(rars[i]),
      'colorway_id', cws[i],
      'rarity', rars[i],
      'forced', case when i = forced_i then forced else null end,
      'signature', (is_sig and i = n_cards),
      'is_new', news[i]
    );
  end loop;

  update public.profiles
     set booster_stock = case when from_bonus then rf.new_stock else rf.new_stock - 1 end,
         bonus_stock = case when from_bonus then p.bonus_stock - 1 else p.bonus_stock end,
         stock_updated_at = rf.new_updated,
         free_opened = p.free_opened + 1,
         pity_legendary = case when has_leg then 0 else p.pity_legendary + 1 end,
         pity_epic = case when has_epic then 0 else p.pity_epic + 1 end
   where id = uid;

  -- Ordre de révélation : la plus rare en dernier, la carte Signature toujours en dernier.
  select jsonb_agg((e - 'idx' - 'key') order by (e ->> 'key')::integer, (e ->> 'idx')::integer)
    into sorted
    from jsonb_array_elements(cards) as e;

  insert into public.transactions (user_id, kind, details)
  values (uid, 'booster', jsonb_build_object('signature', is_sig, 'cards', sorted));

  return jsonb_build_object(
    'cards', sorted,
    'signature', is_sig,
    'pity_legendary', case when has_leg then 0 else p.pity_legendary + 1 end,
    'pity_epic', case when has_epic then 0 else p.pity_epic + 1 end
  );
end;
$$;

-- ============================================================
-- 4. Videur : la récompense
-- ============================================================
-- Copie de la 0013 ; ajouts : boosters_gained (lu dans economy_config, versé UNE fois par jour et par porte,
-- grâce au contrôle « déjà entré ici aujourd'hui » et au verrou du joueur) et sa mention dans la réponse.
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
  v_boosters integer := 0;
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
    v_boosters := coalesce((v_door ->> 'boosters')::integer, 0);
    if p_door = 'bar' then
      -- Bonus de série (inchangé) : +1 par jour d'affilée (hier compris), plafonné.
      v_before := private.videur_streak(uid, today - 1);
      v_bonus := least(v_before, (cfg ->> 'streakBonusCap')::integer);
      v_gained := v_gained + v_bonus;
    end if;
    update public.profiles set flow = flow + v_gained, bonus_stock = bonus_stock + v_boosters where id = uid;
  end if;

  insert into public.videur_attempts (user_id, day, door, code_id, riddle_id, style, rarity, passed, flow_gained, boosters_gained, outfit, matched, total, hint)
  values (uid, today, p_door, v_code.id, v_riddle.id,
          case when v_mode = 'visible' then (ev ->> 'style')::integer else 0 end,
          (ev ->> 'rarity_points')::integer, v_passed, v_gained, v_boosters, ev -> 'pieces', v_matched, v_total, v_hint);

  select flow into v_flow from public.profiles where id = uid;

  if v_mode = 'visible' then
    v_kind := case when v_passed then 'enter' when not v_style_ok and not v_rarity_ok then 'refuse_both'
                   when not v_style_ok then 'refuse_style' else 'refuse_rarity' end;
    select l.text into v_line from public.videur_lines l where l.door = p_door and l.kind = v_kind order by random() limit 1;
    return ev || jsonb_build_object(
      'door', p_door, 'mode', v_mode, 'passed', v_passed, 'style_ok', v_style_ok, 'rarity_ok', v_rarity_ok,
      'min_style', (v_door ->> 'minStyle')::integer, 'min_rarity', (v_door ->> 'minRarity')::integer,
      'line', coalesce(v_line, ''), 'flow_gained', v_gained, 'boosters_gained', v_boosters, 'streak_bonus', v_bonus,
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
                            'flow_gained', v_gained, 'boosters_gained', v_boosters, 'streak_bonus', 0, 'tries_left', v_left, 'flow', v_flow);
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
-- (la colonne boosters_given est ajoutée à la fin : les anciennes colonnes ne bougent pas)
create or replace view public.analytics_videur_daily as
  select day, door, count(*) as attempts, count(*) filter (where passed) as passes,
         count(distinct user_id) as players, coalesce(sum(flow_gained), 0) as flow_given,
         round(avg(matched::numeric / nullif(total, 0)) * 100, 0) as avg_matched_pct,
         coalesce(sum(boosters_gained), 0) as boosters_given
    from public.videur_attempts
   group by day, door
   order by day desc, door;
revoke all on public.analytics_videur_daily from anon, authenticated;

revoke execute on function public.get_booster_state() from public, anon;
revoke execute on function public.open_booster()      from public, anon;
revoke execute on function public.videur_enter(text)  from public, anon;
grant  execute on function public.get_booster_state() to authenticated;
grant  execute on function public.open_booster()      to authenticated;
grant  execute on function public.videur_enter(text)  to authenticated;
