-- Grail — migration 0010 : mesure de la rétention et statistiques sur les joueurs.
-- À exécuter APRÈS la 0009 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Principe
--  * Le serveur sait déjà beaucoup de choses : `transactions` (inscription, bonus quotidien, boosters,
--    roue, défausse, achats/ventes Market), `profiles`, `inventory`, `friendships`, `outfit_shares`…
--  * On y ajoute ce que seul le site peut savoir : quand le joueur OUVRE le jeu, combien de temps il y reste,
--    quels écrans il regarde, comment il partage, sur quel appareil. Le site envoie ces événements par
--    `track_events` (liste blanche de noms, limites de taille et de volume).
--  * Les statistiques sont des VUES `analytics_*` à lire dans le SQL Editor / Table Editor de Supabase.
--    Elles ne sont lisibles ni par le site ni par les joueurs.
--
-- Vie privée : données « pseudonymes » (identifiant de joueur, jamais l'e-mail ni le pseudo dans les
-- vues), aucune adresse IP, aucun service externe, tout est supprimé avec le compte (on delete cascade).
-- Le site n'envoie rien si le navigateur a activé « Do Not Track ».

-- ============================================================
-- 1. Tables
-- ============================================================

-- Événements envoyés par le site (une ligne par événement).
create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  session_id uuid,
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_user_idx on public.analytics_events (user_id, created_at);
create index if not exists analytics_events_name_idx on public.analytics_events (name, created_at);

-- Une ligne par joueur et par jour (jour de Paris) : nombre de sessions et temps actif.
create table if not exists public.player_days (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  day            date not null,
  sessions       integer not null default 0,
  active_seconds integer not null default 0,
  events         integer not null default 0,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.analytics_events enable row level security;
alter table public.player_days      enable row level security;
revoke all on public.analytics_events from anon, authenticated;
revoke all on public.player_days      from anon, authenticated;

-- Compteur de visites d'une tenue partagée (utile pour mesurer la diffusion du jeu).
alter table public.outfit_shares add column if not exists views integer not null default 0;
alter table public.outfit_shares add column if not exists last_viewed_at timestamptz;

create or replace function public.get_shared_outfit(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare s public.outfit_shares%rowtype;
begin
  update public.outfit_shares set views = views + 1, last_viewed_at = now()
   where token = p_token returning * into s;
  if not found then raise exception 'Ce lien de tenue n''existe pas ou n''est plus valide'; end if;
  return jsonb_build_object('equipped', s.equipped, 'created_at', s.created_at);
end;
$$;
revoke execute on function public.get_shared_outfit(text) from public;
grant  execute on function public.get_shared_outfit(text) to anon, authenticated;

-- ============================================================
-- 2. Réception des événements
-- ============================================================
-- p_events : [{ "name": "screen_view", "props": { "screen": "market" } }, ...]
-- Événements reconnus (les autres sont ignorés) :
--   session_start  le jeu s'ouvre (props : platform, standalone, w, h, dpr, lang, tz, ref, entry)
--   ping           toutes les 30 s tant que le jeu est affiché (props : s = secondes écoulées) → temps actif
--   screen_view    écran affiché (props : screen)
--   outfit_change  la tenue change (props : pieces = nombre de pièces portées)
--   share_native / share_copy / share_image   partage de la tenue
--   client_error   erreur affichée au joueur (props : msg, tronqué)
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
  already integer;
begin
  if uid is null then return; end if;
  if jsonb_typeof(p_events) <> 'array' then return; end if;

  -- Plafond quotidien : protège la base d'un client qui s'emballe.
  select events into already from public.player_days where user_id = uid and day = today;
  if coalesce(already, 0) >= 3000 then return; end if;

  for e in select * from jsonb_array_elements(p_events) limit 25 loop
    nm := e ->> 'name';
    continue when nm is null or not (nm = any (allowed));
    pr := coalesce(e -> 'props', '{}'::jsonb);
    if jsonb_typeof(pr) <> 'object' or length(pr::text) > 600 then pr := '{}'::jsonb; end if;

    insert into public.analytics_events (user_id, session_id, name, props) values (uid, p_session, nm, pr);
    n_ev := n_ev + 1;
    if nm = 'session_start' then n_sess := n_sess + 1; end if;
    if nm = 'ping' then n_sec := n_sec + least(greatest(coalesce((pr ->> 's')::integer, 30), 0), 60); end if;
  end loop;

  if n_ev = 0 then return; end if;
  insert into public.player_days (user_id, day, sessions, active_seconds, events)
  values (uid, today, n_sess, n_sec, n_ev)
  on conflict (user_id, day) do update
     set sessions = public.player_days.sessions + excluded.sessions,
         active_seconds = public.player_days.active_seconds + excluded.active_seconds,
         events = public.player_days.events + excluded.events,
         last_seen = now();
exception when others then
  return; -- les statistiques ne doivent JAMAIS gêner le jeu
end;
$$;

revoke execute on function public.track_events(uuid, jsonb) from public, anon;
grant  execute on function public.track_events(uuid, jsonb) to authenticated;

-- ============================================================
-- 3. Vues de statistiques (à lire dans le SQL Editor : select * from analytics_...)
-- ============================================================

-- Jours (Paris) où chaque joueur a été actif : ouverture du jeu OU action enregistrée.
-- Les actions passées (bonus quotidien, boosters…) comptent aussi : on a donc un historique avant cette migration.
create or replace view public.analytics_active_days as
  select user_id, day from public.player_days
  union
  select user_id, (created_at at time zone 'Europe/Paris')::date from public.transactions
  union
  select user_id, (created_at at time zone 'Europe/Paris')::date from public.analytics_events;

-- Un joueur par ligne : date d'inscription (jour de Paris).
create or replace view public.analytics_signups as
  select id as user_id, created_at as signup_at, (created_at at time zone 'Europe/Paris')::date as signup_day
    from public.profiles;

-- Courbe de rétention globale : parmi les joueurs inscrits depuis au moins N jours,
-- quelle part était active exactement le jour N après l'inscription (J+1, J+7…).
create or replace view public.analytics_retention_curve as
  select n as day_offset,
         count(*) filter (where s.signup_day + n <= (now() at time zone 'Europe/Paris')::date) as eligible_players,
         count(*) filter (where exists (select 1 from public.analytics_active_days a
                                         where a.user_id = s.user_id and a.day = s.signup_day + n)) as retained_players,
         round(100.0 * count(*) filter (where exists (select 1 from public.analytics_active_days a
                                         where a.user_id = s.user_id and a.day = s.signup_day + n))
               / nullif(count(*) filter (where s.signup_day + n <= (now() at time zone 'Europe/Paris')::date), 0), 1) as retention_pct
    from public.analytics_signups s
    cross join unnest(array[0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 60, 90]) as n
   group by n
   order by n;

-- Rétention par cohorte (jour d'inscription) : taille de la cohorte et % actifs à J+1, J+3, J+7, J+14, J+30.
-- NULL = trop tôt pour savoir.
create or replace view public.analytics_retention_cohorts as
  with today as (select (now() at time zone 'Europe/Paris')::date as d)
  select s.signup_day,
         count(*) as cohort_size,
         case when s.signup_day + 1  <= t.d then round(100.0 * count(*) filter (where r1.user_id  is not null) / count(*), 1) end as d1_pct,
         case when s.signup_day + 3  <= t.d then round(100.0 * count(*) filter (where r3.user_id  is not null) / count(*), 1) end as d3_pct,
         case when s.signup_day + 7  <= t.d then round(100.0 * count(*) filter (where r7.user_id  is not null) / count(*), 1) end as d7_pct,
         case when s.signup_day + 14 <= t.d then round(100.0 * count(*) filter (where r14.user_id is not null) / count(*), 1) end as d14_pct,
         case when s.signup_day + 30 <= t.d then round(100.0 * count(*) filter (where r30.user_id is not null) / count(*), 1) end as d30_pct
    from public.analytics_signups s
    cross join today t
    left join public.analytics_active_days r1  on r1.user_id  = s.user_id and r1.day  = s.signup_day + 1
    left join public.analytics_active_days r3  on r3.user_id  = s.user_id and r3.day  = s.signup_day + 3
    left join public.analytics_active_days r7  on r7.user_id  = s.user_id and r7.day  = s.signup_day + 7
    left join public.analytics_active_days r14 on r14.user_id = s.user_id and r14.day = s.signup_day + 14
    left join public.analytics_active_days r30 on r30.user_id = s.user_id and r30.day = s.signup_day + 30
   group by s.signup_day, t.d
   order by s.signup_day desc;

-- Joueurs actifs par jour (DAU), sur 7 jours glissants (WAU) et 30 jours glissants (MAU), et « collant » DAU/MAU.
create or replace view public.analytics_activity_daily as
  with days as (
    select generate_series(
      coalesce((select min(day) from public.analytics_active_days), (now() at time zone 'Europe/Paris')::date),
      (now() at time zone 'Europe/Paris')::date, interval '1 day')::date as day
  )
  select d.day,
         (select count(*) from public.analytics_signups s where s.signup_day = d.day) as new_players,
         (select count(distinct user_id) from public.analytics_active_days a where a.day = d.day) as dau,
         (select count(distinct user_id) from public.analytics_active_days a where a.day between d.day - 6 and d.day) as wau,
         (select count(distinct user_id) from public.analytics_active_days a where a.day between d.day - 29 and d.day) as mau,
         round(100.0 * (select count(distinct user_id) from public.analytics_active_days a where a.day = d.day)
               / nullif((select count(distinct user_id) from public.analytics_active_days a where a.day between d.day - 29 and d.day), 0), 1) as stickiness_pct,
         (select coalesce(sum(active_seconds), 0) / 60 from public.player_days p where p.day = d.day) as active_minutes
    from days d
   order by d.day desc;

-- Un joueur par ligne : tout ce qu'on sait de lui (pour segmenter et comparer les profils).
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
           count(*) filter (where name = 'share_native' or name = 'share_copy' or name = 'share_image') as share_clicks,
           mode() within group (order by props ->> 'platform') filter (where name = 'session_start') as platform
      from public.analytics_events group by user_id
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
         extract(epoch from (tx.first_market_at  - p.created_at)) / 3600 as hours_to_first_market
    from public.profiles p
    left join days d   on d.user_id = p.id
    left join streaks s on s.user_id = p.id
    left join tx       on tx.user_id = p.id
    left join pd       on pd.user_id = p.id
    left join inv      on inv.user_id = p.id
    left join fr       on fr.user_id = p.id
    left join sh       on sh.user_id = p.id
    left join ev       on ev.user_id = p.id;

-- Entonnoir d'activation : combien de joueurs franchissent chaque étape.
create or replace view public.analytics_funnel as
  with p as (select * from public.analytics_player_summary)
  select step, players, round(100.0 * players / nullif((select count(*) from p), 0), 1) as pct_of_signups
    from (
      select 1 as ord, 'Inscrit' as step, count(*) as players from p
      union all select 2, 'Tutoriel terminé', count(*) from p where tutorial_done
      union all select 3, 'A ouvert un booster', count(*) from p where boosters_opened > 0
      union all select 4, 'A porté une pièce', count(*) from p where outfit_pieces > 0
      union all select 5, 'A choisi un pseudo', count(*) from p where has_pseudo
      union all select 6, 'A partagé sa tenue', count(*) from p where outfit_shares > 0 or share_clicks > 0
      union all select 7, 'A un ami', count(*) from p where friends > 0
      union all select 8, 'A utilisé la roue ou la défausse', count(*) from p where wheel_spins + discards > 0
      union all select 9, 'A acheté ou vendu au Market', count(*) from p where market_buys + market_sales > 0
      union all select 10, 'Revenu un autre jour', count(*) from p where days_active >= 2
      union all select 11, 'Actif 3 jours ou plus', count(*) from p where days_active >= 3
      union all select 12, 'Actif 7 jours ou plus', count(*) from p where days_active >= 7
    ) f
   order by ord;

-- Volume des événements par jour et par nom (quelles fonctions sont utilisées).
create or replace view public.analytics_events_daily as
  select (created_at at time zone 'Europe/Paris')::date as day, name,
         count(*) as events, count(distinct user_id) as players
    from public.analytics_events
   group by 1, 2
   order by 1 desc, events desc;

-- Écrans les plus regardés.
create or replace view public.analytics_screens as
  select props ->> 'screen' as screen, count(*) as views, count(distinct user_id) as players
    from public.analytics_events where name = 'screen_view'
   group by 1 order by views desc;

-- Appareils : plateforme, application installée ou non, taille d'écran.
create or replace view public.analytics_devices as
  select props ->> 'platform' as platform,
         coalesce((props ->> 'standalone')::boolean, false) as installed_app,
         case when (props ->> 'w')::int < 400 then '< 400 px'
              when (props ->> 'w')::int < 800 then '400-799 px'
              else '800 px et +' end as screen_width,
         count(*) as sessions, count(distinct user_id) as players
    from public.analytics_events where name = 'session_start'
   group by 1, 2, 3 order by sessions desc;

-- Heure de la journée (Paris) à laquelle le jeu est ouvert.
create or replace view public.analytics_hours as
  select extract(hour from created_at at time zone 'Europe/Paris')::integer as hour,
         count(*) as sessions, count(distinct user_id) as players
    from public.analytics_events where name = 'session_start'
   group by 1 order by 1;

-- Aucun accès depuis le site ni pour les joueurs : lecture réservée au propriétaire du projet (SQL Editor).
revoke all on public.analytics_active_days, public.analytics_signups, public.analytics_retention_curve,
              public.analytics_retention_cohorts, public.analytics_activity_daily, public.analytics_player_summary,
              public.analytics_funnel, public.analytics_events_daily, public.analytics_screens,
              public.analytics_devices, public.analytics_hours
  from anon, authenticated;
