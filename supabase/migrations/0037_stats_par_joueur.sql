-- Grail — migration 0037 : statistiques par joueur plus précises (sessions, temps par écran, première session).
-- À exécuter APRÈS la 0036 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Ce qui change
--  * `analytics_sessions` : une ligne par session (début, fin, temps actif, écrans vus, premier et dernier écran,
--    première session du compte…). Remplie par `track_events` au fil de l'eau, et reconstruite UNE fois depuis
--    `analytics_events` pour l'historique (seulement si la table est encore vide).
--  * `player_screen_days` : temps passé par joueur, par jour (Paris) et par écran, calculé à partir des « ping »
--    de 30 s (le site y ajoute maintenant l'écran affiché ; pour l'historique, l'écran est celui du dernier
--    `screen_view` de la même session).
--  * Vue `analytics_first_session` : la première session de chaque joueur (durée, boosters, tenue, Videur,
--    Market, dernier écran, revenu le lendemain).
--  * `analytics_player_summary` : colonnes ajoutées À LA FIN (niveau du Videur, album, kit de départ, tenues
--    enregistrées, durée des sessions, temps du jour, écran favori).
--  * Nettoyage : `private.purge_analytics_events()` supprime les événements détaillés de plus de 90 jours,
--    chaque jour par pg_cron. Les totaux (`player_days`, `analytics_sessions`, `player_screen_days`) sont gardés.
--  * Kit de départ : la marque choisie est maintenant enregistrée (`profiles.starter_kit_brand`).
--
-- Rien n'est lisible par le site ni par les joueurs (anon / authenticated) : lecture dans le SQL Editor.
-- Tout est supprimé avec le compte (on delete cascade, et delete_my_account nettoie les colonnes user_id).

-- ============================================================
-- 1. Tables
-- ============================================================

create table if not exists public.analytics_sessions (
  session_id       uuid primary key,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz not null default now(),   -- dernier événement reçu
  active_seconds   integer not null default 0,           -- somme des « ping » (jeu affiché)
  events           integer not null default 0,
  screens_viewed   integer not null default 0,           -- nombre de `screen_view`
  screens          text[] not null default '{}',         -- écrans différents vus (gardé après le nettoyage des événements)
  first_screen     text,
  last_screen      text,                                 -- dernier écran affiché (screen_view ou ping)
  is_first_session boolean not null default false,       -- première session connue du compte
  platform         text,                                 -- ios / android / desktop (session_start)
  outfit_changes   integer not null default 0,
  shares           integer not null default 0            -- share_native + share_copy + share_image
);
create index if not exists analytics_sessions_user_idx on public.analytics_sessions (user_id, started_at);

create table if not exists public.player_screen_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,                                 -- jour de Paris
  screen  text not null,                                 -- « inconnu » si l'écran n'est pas connu
  seconds integer not null default 0,
  pings   integer not null default 0,
  primary key (user_id, day, screen)
);

alter table public.analytics_sessions enable row level security;
alter table public.player_screen_days enable row level security;
revoke all on public.analytics_sessions from anon, authenticated;
revoke all on public.player_screen_days from anon, authenticated;

-- Marque du kit de départ (inconnue pour les kits pris avant cette migration).
alter table public.profiles add column if not exists starter_kit_brand text;

-- ============================================================
-- 2. Réception des événements (même liste blanche, mêmes limites qu'en 0010) + sessions + temps par écran
-- ============================================================
create or replace function public.track_events(p_session uuid, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  today   date := (now() at time zone 'Europe/Paris')::date;
  allowed text[] := array['session_start','ping','screen_view','outfit_change','share_native','share_copy','share_image','client_error'];
  e       jsonb;
  nm      text;
  pr      jsonb;
  n_sess  integer := 0;
  n_sec   integer := 0;
  n_ev    integer := 0;
  n_sv    integer := 0;
  n_out   integer := 0;
  n_share integer := 0;
  sec     integer;
  scr     text;
  v_first text;
  v_last  text;
  v_seen  text[] := '{}';
  v_plat  text;
  own     boolean := false;  -- la session appartient bien à ce joueur
  already integer;
begin
  if uid is null then return; end if;
  if jsonb_typeof(p_events) <> 'array' then return; end if;

  -- Plafond quotidien : protège la base d'un client qui s'emballe.
  select events into already from public.player_days where user_id = uid and day = today;
  if coalesce(already, 0) >= 3000 then return; end if;

  -- Session : créée au premier envoi. « Première session » = aucune autre session connue pour ce compte.
  if p_session is not null then
    insert into public.analytics_sessions (session_id, user_id, is_first_session)
    values (p_session, uid, not exists (select 1 from public.analytics_sessions s where s.user_id = uid))
    on conflict (session_id) do nothing;
    select true, s.last_screen into own, v_last
      from public.analytics_sessions s where s.session_id = p_session and s.user_id = uid;
    own := coalesce(own, false);
  end if;

  for e in select * from jsonb_array_elements(p_events) limit 25 loop
    nm := e ->> 'name';
    continue when nm is null or not (nm = any (allowed));
    pr := coalesce(e -> 'props', '{}'::jsonb);
    if jsonb_typeof(pr) <> 'object' or length(pr::text) > 600 then pr := '{}'::jsonb; end if;

    insert into public.analytics_events (user_id, session_id, name, props) values (uid, p_session, nm, pr);
    n_ev := n_ev + 1;
    scr := nullif(left(pr ->> 'screen', 24), '');

    if nm = 'session_start' then
      n_sess := n_sess + 1;
      v_plat := coalesce(v_plat, left(pr ->> 'platform', 16));
    elsif nm = 'screen_view' and scr is not null then
      n_sv := n_sv + 1;
      v_first := coalesce(v_first, scr);
      v_last := scr;
      if not (scr = any (v_seen)) then v_seen := v_seen || scr; end if;
    elsif nm = 'ping' then
      sec := least(greatest(coalesce((pr ->> 's')::integer, 30), 0), 60);
      n_sec := n_sec + sec;
      -- Écran du ping ; ancien site (sans écran) : le dernier écran affiché de la session.
      scr := coalesce(scr, v_last, 'inconnu');
      if scr <> 'inconnu' then
        v_first := coalesce(v_first, scr);
        v_last := scr;
        if not (scr = any (v_seen)) then v_seen := v_seen || scr; end if;
      end if;
      insert into public.player_screen_days (user_id, day, screen, seconds, pings)
      values (uid, today, scr, sec, 1)
      on conflict (user_id, day, screen) do update
         set seconds = public.player_screen_days.seconds + excluded.seconds,
             pings   = public.player_screen_days.pings + 1;
    elsif nm = 'outfit_change' then
      n_out := n_out + 1;
    elsif nm in ('share_native', 'share_copy', 'share_image') then
      n_share := n_share + 1;
    end if;
  end loop;

  if n_ev = 0 then return; end if;
  insert into public.player_days (user_id, day, sessions, active_seconds, events)
  values (uid, today, n_sess, n_sec, n_ev)
  on conflict (user_id, day) do update
     set sessions = public.player_days.sessions + excluded.sessions,
         active_seconds = public.player_days.active_seconds + excluded.active_seconds,
         events = public.player_days.events + excluded.events,
         last_seen = now();

  if own then
    update public.analytics_sessions s
       set ended_at       = now(),
           active_seconds = s.active_seconds + n_sec,
           events         = s.events + n_ev,
           screens_viewed = s.screens_viewed + n_sv,
           screens        = array(select distinct x from unnest(s.screens || v_seen) x order by x),
           first_screen   = coalesce(s.first_screen, v_first),
           last_screen    = coalesce(v_last, s.last_screen),
           platform       = coalesce(s.platform, v_plat),
           outfit_changes = s.outfit_changes + n_out,
           shares         = s.shares + n_share
     where s.session_id = p_session;
  end if;
exception when others then
  return; -- les statistiques ne doivent JAMAIS gêner le jeu
end;
$$;

revoke execute on function public.track_events(uuid, jsonb) from public, anon;
grant  execute on function public.track_events(uuid, jsonb) to authenticated;

-- ============================================================
-- 3. Reconstruction de l'historique (une seule fois : seulement si les deux tables sont vides)
-- ============================================================
do $$
begin
  if exists (select 1 from public.analytics_sessions) or exists (select 1 from public.player_screen_days) then
    raise notice 'Historique déjà reconstruit : rien à faire.';
    return;
  end if;

  -- Écran de chaque événement : le sien (screen_view, ping récent), sinon le dernier screen_view de la session.
  create temporary table tmp_ev on commit drop as
    select a.id, a.user_id, a.session_id, a.name, a.props, a.created_at,
           coalesce(nullif(left(a.props ->> 'screen', 24), ''),
                    case when a.name = 'ping' then
                      (select nullif(left(b.props ->> 'screen', 24), '')
                         from public.analytics_events b
                        where b.session_id = a.session_id and b.user_id = a.user_id
                          and b.name = 'screen_view' and b.id < a.id
                        order by b.id desc limit 1) end) as screen,
           case when a.name = 'ping'
                then least(greatest(coalesce((a.props ->> 's')::integer, 30), 0), 60) else 0 end as sec
      from public.analytics_events a
     where a.session_id is not null;

  insert into public.analytics_sessions
    (session_id, user_id, started_at, ended_at, active_seconds, events, screens_viewed, screens,
     first_screen, last_screen, is_first_session, platform, outfit_changes, shares)
  select t.session_id,
         (array_agg(t.user_id order by t.id))[1],
         min(t.created_at), max(t.created_at),
         sum(t.sec)::integer, count(*)::integer,
         (count(*) filter (where t.name = 'screen_view' and t.screen is not null))::integer,
         coalesce(array_agg(distinct t.screen) filter (where t.screen is not null and t.name in ('screen_view', 'ping')), '{}'),
         (array_agg(t.screen order by t.id) filter (where t.screen is not null and t.name in ('screen_view', 'ping')))[1],
         (array_agg(t.screen order by t.id desc) filter (where t.screen is not null and t.name in ('screen_view', 'ping')))[1],
         false,
         (array_agg(left(t.props ->> 'platform', 16) order by t.id) filter (where t.name = 'session_start'))[1],
         (count(*) filter (where t.name = 'outfit_change'))::integer,
         (count(*) filter (where t.name in ('share_native', 'share_copy', 'share_image')))::integer
    from tmp_ev t
   group by t.session_id
  on conflict (session_id) do nothing;

  -- Première session de chaque compte = la plus ancienne connue.
  update public.analytics_sessions s set is_first_session = true
   where s.session_id in (select distinct on (user_id) session_id
                            from public.analytics_sessions order by user_id, started_at, session_id);

  insert into public.player_screen_days (user_id, day, screen, seconds, pings)
  select t.user_id, (t.created_at at time zone 'Europe/Paris')::date, coalesce(t.screen, 'inconnu'),
         sum(t.sec)::integer, count(*)::integer
    from tmp_ev t where t.name = 'ping'
   group by 1, 2, 3
  on conflict (user_id, day, screen) do nothing;
end;
$$;

-- ============================================================
-- 4. Kit de départ : la marque choisie est enregistrée (copie de la 0030, une ligne changée)
-- ============================================================
create or replace function public.claim_starter_kit(p_brand text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  p     public.profiles%rowtype;
  n     integer := coalesce((private.cfg() -> 'STARTER' ->> 'boosters')::integer, 2);
  v_slot text;
  v_cid  text;
  got    jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Profil introuvable'; end if;
  if p.starter_kit_at is not null then raise exception 'Kit de départ déjà récupéré'; end if;
  if p_brand is null or not exists (select 1 from public.brands b where b.id = p_brand)
     or not private.kit_brand_ok(p_brand) then
    raise exception 'Marque inconnue';
  end if;

  -- Un haut (ou une veste), un bas, des chaussures.
  foreach v_slot in array array[private.kit_top_slot(p_brand), 'bas', 'chaussures'] loop
    select c.id into v_cid
      from public.pieces pc join public.colorways c on c.piece_id = pc.id
     where pc.brand_id = p_brand and pc.slot = v_slot
     order by random() limit 1;
    perform private.give_cards(uid, v_cid, 'commun'::public.rarity, 1);
    got := got || jsonb_build_object('slot', v_slot, 'colorway_id', v_cid, 'rarity', 'commun');
  end loop;

  -- 4e pièce : tête, sinon cou, sinon sac (si la marque en a une).
  select c.id, pc.slot into v_cid, v_slot
    from public.pieces pc join public.colorways c on c.piece_id = pc.id
   where pc.brand_id = p_brand and pc.slot in ('tete', 'cou', 'sac')
   order by array_position(array['tete', 'cou', 'sac'], pc.slot), random() limit 1;
  if found then
    perform private.give_cards(uid, v_cid, 'commun'::public.rarity, 1);
    got := got || jsonb_build_object('slot', v_slot, 'colorway_id', v_cid, 'rarity', 'commun');
  end if;

  update public.profiles
     set bonus_stock = bonus_stock + n, starter_kit_at = now(), starter_kit_brand = p_brand
   where id = uid;

  return jsonb_build_object('brand', p_brand, 'cards', got, 'boosters', n);
end;
$$;
revoke execute on function public.claim_starter_kit(text) from public, anon;
grant  execute on function public.claim_starter_kit(text) to authenticated;

-- ============================================================
-- 5. Vues
-- ============================================================

-- Première session de chaque joueur. Boosters et Videur sont lus dans les tables du jeu (gardées), pendant
-- la session (avec 2 minutes de marge : le dernier envoi part jusqu'à 15 s après la dernière action).
create or replace view public.analytics_first_session as
  select s.user_id,
         s.started_at,
         round(extract(epoch from (s.ended_at - s.started_at)) / 60.0, 1) as duration_minutes,
         round(s.active_seconds / 60.0, 1) as active_minutes,
         s.platform,
         s.first_screen,
         s.screens,
         (select count(*) from public.transactions t
           where t.user_id = s.user_id and t.kind = 'booster'
             and t.created_at between s.started_at - interval '2 minutes' and s.ended_at + interval '2 minutes') as boosters_opened,
         (s.outfit_changes > 0) as outfit_changed,
         exists (select 1 from public.videur_attempts v
                  where v.user_id = s.user_id
                    and v.created_at between s.started_at - interval '2 minutes' and s.ended_at + interval '2 minutes') as videur_tried,
         ('market' = any (s.screens)) as market_seen,
         s.last_screen as last_screen_before_leaving,
         case when (s.started_at at time zone 'Europe/Paris')::date + 1 > (now() at time zone 'Europe/Paris')::date then null
              else exists (select 1 from public.analytics_active_days a
                            where a.user_id = s.user_id
                              and a.day = (s.started_at at time zone 'Europe/Paris')::date + 1) end as came_back_next_day
    from public.analytics_sessions s
   where s.is_first_session;

-- Temps passé par écran et par jour (tous joueurs).
create or replace view public.analytics_screen_time_daily as
  select day, screen, round(sum(seconds) / 60.0, 1) as minutes, count(distinct user_id) as players
    from public.player_screen_days
   group by day, screen
   order by day desc, minutes desc;

-- Résumé par joueur : définition de la 0010 ; plateforme et clics de partage lus dans les sessions (gardées
-- après le nettoyage des événements) ; nouvelles colonnes À LA FIN (create or replace view l'impose).
create or replace view public.analytics_player_summary as
  with act as (
    select user_id, day, day - (dense_rank() over (partition by user_id order by day))::integer as grp
      from public.analytics_active_days
  ),
  runs as (
    select user_id, grp, count(*) as len, max(day) as last_day from act group by user_id, grp
  ),
  streaks as (
    select user_id,
           max(len) as longest_streak,
           coalesce(max(len) filter (where last_day >= (now() at time zone 'Europe/Paris')::date - 1), 0) as current_streak
      from runs group by user_id
  ),
  tx as (
    select user_id,
           count(*) filter (where kind = 'booster')     as boosters_opened,
           count(*) filter (where kind = 'upgrade')     as wheel_spins,
           count(*) filter (where kind = 'discard')     as discards,
           count(*) filter (where kind = 'market_buy')  as market_buys,
           count(*) filter (where kind = 'market_sale') as market_sales,
           coalesce(sum(coins_delta) filter (where coins_delta > 0), 0) as coins_earned,
           coalesce(-sum(coins_delta) filter (where coins_delta < 0), 0) as coins_spent,
           min(created_at) filter (where kind = 'booster') as first_booster_at,
           min(created_at) filter (where kind in ('market_buy', 'market_sale')) as first_market_at
      from public.transactions group by user_id
  ),
  days as (
    select user_id, count(*) as days_active, max(day) as last_active_day
      from public.analytics_active_days group by user_id
  ),
  pd as (
    select user_id, sum(sessions) as sessions, round(sum(active_seconds) / 60.0, 1) as active_minutes
      from public.player_days group by user_id
  ),
  inv as (
    select user_id, sum(count) as cards_owned, count(*) as distinct_cards,
           coalesce(sum(count) filter (where rarity = 'legendaire'), 0) as legendaries,
           coalesce(sum(count) filter (where rarity = 'epique'), 0)     as epics
      from public.inventory group by user_id
  ),
  fr as (
    select p.id as user_id,
           (select count(*) from public.friendships f where f.status = 'accepted' and p.id in (f.requester, f.addressee)) as friends
      from public.profiles p
  ),
  sh as (
    select user_id, count(*) as outfit_shares, coalesce(sum(views), 0) as share_views
      from public.outfit_shares group by user_id
  ),
  ev as (
    select user_id,
           sum(shares) as share_clicks,
           mode() within group (order by platform) as platform,
           round(avg(active_seconds) / 60.0, 1) as avg_session_minutes,
           round((percentile_cont(0.5) within group (order by active_seconds) / 60.0)::numeric, 1) as median_session_minutes
      from public.analytics_sessions group by user_id
  ),
  vid as (
    select user_id, count(*) as videur_attempts, count(*) filter (where passed) as videur_passes
      from public.videur_attempts group by user_id
  ),
  alb as (select user_id, count(*) as album_cards from public.album_cards group by user_id),
  ult as (select user_id, count(*) as ultimates from public.album_ultimates group by user_id),
  so  as (select user_id, count(*) as saved_outfits from public.saved_outfits group by user_id),
  fav as (
    select distinct on (user_id) user_id, screen as favorite_screen
      from (select user_id, screen, sum(seconds) as secs from public.player_screen_days
             where screen <> 'inconnu' group by user_id, screen) x
     order by user_id, secs desc, screen
  )
  select p.id as user_id,
         p.created_at as signup_at,
         (now() at time zone 'Europe/Paris')::date - (p.created_at at time zone 'Europe/Paris')::date as age_days,
         d.last_active_day,
         (now() at time zone 'Europe/Paris')::date - d.last_active_day as days_since_last_active,
         case when d.last_active_day is null then 'inconnu'
              when (now() at time zone 'Europe/Paris')::date - d.last_active_day <= 2 then 'actif'
              when (now() at time zone 'Europe/Paris')::date - d.last_active_day <= 7 then 'a_risque'
              else 'perdu' end as status,
         coalesce(d.days_active, 0) as days_active,
         coalesce(s.longest_streak, 0) as longest_streak,
         coalesce(s.current_streak, 0) as current_streak,
         coalesce(pd.sessions, 0) as sessions,
         coalesce(pd.active_minutes, 0) as active_minutes,
         ev.platform,
         coalesce(tx.boosters_opened, 0) as boosters_opened,
         coalesce(tx.wheel_spins, 0) as wheel_spins,
         coalesce(tx.discards, 0) as discards,
         coalesce(tx.market_buys, 0) as market_buys,
         coalesce(tx.market_sales, 0) as market_sales,
         coalesce(tx.coins_earned, 0) as coins_earned,
         coalesce(tx.coins_spent, 0) as coins_spent,
         p.coins,
         coalesce(inv.cards_owned, 0) as cards_owned,
         coalesce(inv.distinct_cards, 0) as distinct_cards,
         coalesce(inv.epics, 0) as epics,
         coalesce(inv.legendaries, 0) as legendaries,
         (select count(*) from jsonb_object_keys(p.equipped)) as outfit_pieces,
         p.tutorial_done,
         (p.pseudo is not null) as has_pseudo,
         coalesce(fr.friends, 0) as friends,
         coalesce(sh.outfit_shares, 0) as outfit_shares,
         coalesce(sh.share_views, 0) as share_views,
         coalesce(ev.share_clicks, 0) as share_clicks,
         extract(epoch from (tx.first_booster_at - p.created_at)) / 60 as minutes_to_first_booster,
         extract(epoch from (tx.first_market_at  - p.created_at)) / 3600 as hours_to_first_market,
         -- Ajouts de la 0037
         p.videur_level + 1 as videur_level,          -- niveau en cours (videur_level = niveaux validés)
         p.videur_doors,                               -- portes passées du niveau en cours (0 à 2)
         coalesce(vid.videur_attempts, 0) as videur_attempts,
         coalesce(vid.videur_passes, 0) as videur_passes,
         coalesce(alb.album_cards, 0) as album_cards,
         coalesce(ult.ultimates, 0) as ultimates,
         p.starter_kit_brand,
         p.starter_kit_at,
         coalesce(so.saved_outfits, 0) as saved_outfits,
         ev.avg_session_minutes,
         ev.median_session_minutes,
         coalesce((select round(t.active_seconds / 60.0, 1) from public.player_days t
                    where t.user_id = p.id and t.day = (now() at time zone 'Europe/Paris')::date), 0) as today_minutes,
         fav.favorite_screen
    from public.profiles p
    left join days d   on d.user_id = p.id
    left join streaks s on s.user_id = p.id
    left join tx       on tx.user_id = p.id
    left join pd       on pd.user_id = p.id
    left join inv      on inv.user_id = p.id
    left join fr       on fr.user_id = p.id
    left join sh       on sh.user_id = p.id
    left join ev       on ev.user_id = p.id
    left join vid      on vid.user_id = p.id
    left join alb      on alb.user_id = p.id
    left join ult      on ult.user_id = p.id
    left join so       on so.user_id = p.id
    left join fav      on fav.user_id = p.id;

revoke all on public.analytics_first_session, public.analytics_screen_time_daily, public.analytics_player_summary
  from anon, authenticated;

-- ============================================================
-- 6. Nettoyage : événements détaillés de plus de 90 jours (les totaux sont gardés)
-- ============================================================
create or replace function private.purge_analytics_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.analytics_events where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.purge_analytics_events() from public, anon, authenticated;

-- Chaque jour à 3 h 17 (UTC) ; même nom = planification remplacée si la migration est relancée.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('grail-analytics-purge', '17 3 * * *', 'select private.purge_analytics_events()');
    exception when others then
      raise notice 'Planification pg_cron impossible (%) : lancer select private.purge_analytics_events(); à la main.', sqlerrm;
    end;
  else
    raise notice 'pg_cron absent : lancer select private.purge_analytics_events(); à la main de temps en temps.';
  end if;
end;
$$;

-- ============================================================
-- 7. Contrôle : une ligne ; premieres_sessions = joueurs, et minutes_par_ecran ≈ minutes de player_days.
--    Planification : select jobname, schedule from cron.job where jobname = 'grail-analytics-purge';
-- ============================================================
select (select count(*) from public.analytics_sessions) as sessions,
       (select count(distinct user_id) from public.analytics_sessions) as joueurs,
       (select count(*) from public.analytics_sessions where is_first_session) as premieres_sessions,
       (select coalesce(sum(seconds), 0) / 60 from public.player_screen_days) as minutes_par_ecran,
       (select coalesce(sum(active_seconds), 0) / 60 from public.player_days) as minutes_player_days;
