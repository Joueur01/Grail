-- Grail — migration 0038 : fonctions du futur panel admin, en LECTURE SEULE (pas encore de page).
-- À exécuter APRÈS la 0037 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Principe
--  * `public.admins` : la liste des comptes administrateurs (illisible directement, remplie à la main dans le
--    SQL Editor : aucun identifiant n'est écrit dans le dépôt).
--  * `public.is_admin()` : oui / non pour l'appelant (le futur panel s'en sert pour s'afficher ou non).
--  * `public.admin_*` : une fonction par écran du panel. TOUTES commencent par `perform private.admin_check()`
--    qui refuse (« Accès refusé ») un appelant qui n'est pas dans `admins`. Elles sont `security definer`
--    (elles lisent les tables et les vues `analytics_*`, illisibles par les joueurs), `set search_path = ''`,
--    et exécutables seulement par `authenticated` (anon refusé). Elles ne modifient RIEN.
--  * Jamais d'e-mail : seul le pseudo est renvoyé (auth.users n'est jamais lu).
--  * Aucune n'appelle private.cfg() (voir les pièges de CLAUDE.md, section 19).
--
-- Dates : p_from / p_to = jours de Paris inclus ; vides = les 30 derniers jours ; 400 jours au plus.

-- ============================================================
-- 1. Administrateurs
-- ============================================================
create table if not exists public.admins (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- Refus commun à toutes les fonctions admin_*.
create or replace function private.admin_check()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Accès refusé';
  end if;
end;
$$;
revoke execute on function private.admin_check() from public, anon, authenticated;

-- Période demandée → jours de Paris (début, fin) et instants correspondants (pour les index sur created_at).
create or replace function private.admin_period(p_from date, p_to date,
  out d_from date, out d_to date, out t_from timestamptz, out t_to timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  d_to   := coalesce(p_to, (now() at time zone 'Europe/Paris')::date);
  d_from := coalesce(p_from, d_to - 29);
  if d_from > d_to then raise exception 'Période invalide'; end if;
  if d_to - d_from > 400 then d_from := d_to - 400; end if;
  t_from := d_from::timestamp at time zone 'Europe/Paris';
  t_to   := (d_to + 1)::timestamp at time zone 'Europe/Paris';
end;
$$;
revoke execute on function private.admin_period(date, date) from public, anon, authenticated;

-- Jours actifs : `track_events` écrit TOUJOURS une ligne dans `player_days` le jour de chaque événement
-- (même transaction, même jour de Paris) : lire aussi `analytics_events` (200 000 lignes et plus) ne
-- change pas le résultat mais rendait toutes les vues de rétention très lentes. Mêmes colonnes qu'en 0010.
create or replace view public.analytics_active_days as
  select user_id, day from public.player_days
  union
  select user_id, (created_at at time zone 'Europe/Paris')::date from public.transactions;
revoke all on public.analytics_active_days from anon, authenticated;

-- Index utiles aux lectures par période (petites tables pendant la bêta : création instantanée).
create index if not exists transactions_created_idx      on public.transactions (created_at);
create index if not exists market_listings_closed_idx    on public.market_listings (closed_at) where status = 'sold';
create index if not exists videur_attempts_created_idx   on public.videur_attempts (created_at);
create index if not exists analytics_sessions_start_idx  on public.analytics_sessions (started_at);
create index if not exists player_screen_days_day_idx    on public.player_screen_days (day);
create index if not exists player_days_day_idx           on public.player_days (day);

-- ============================================================
-- 2. Vue d'ensemble : chiffres clés + séries par jour
-- ============================================================
create or replace function public.admin_overview(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  per    record;
  series jsonb;
  res    jsonb;
begin
  perform private.admin_check();
  select * into per from private.admin_period(p_from, p_to);

  with days as (
    select generate_series(per.d_from, per.d_to, interval '1 day')::date as day
  ),
  act as (  -- jours actifs, avec 29 jours d'avance pour le MAU du premier jour
    select distinct user_id, day from public.analytics_active_days where day between per.d_from - 29 and per.d_to
  ),
  sig as (
    select (created_at at time zone 'Europe/Paris')::date as day, count(*) as n
      from public.profiles where created_at >= per.t_from and created_at < per.t_to group by 1
  ),
  pd as (
    select day, sum(sessions) as sessions, round(sum(active_seconds) / 60.0, 1) as minutes
      from public.player_days where day between per.d_from and per.d_to group by day
  ),
  tx as (
    select (created_at at time zone 'Europe/Paris')::date as day,
           count(*) filter (where kind = 'booster') as boosters,
           coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind <> 'market_sale'), 0) as created,
           coalesce(sum(coins_delta), 0) as net
      from public.transactions where created_at >= per.t_from and created_at < per.t_to group by 1
  ),
  mk as (
    select (closed_at at time zone 'Europe/Paris')::date as day, count(*) as sales,
           count(*) filter (where is_system) as shop_sales, coalesce(sum(price), 0) as volume
      from public.market_listings
     where status = 'sold' and closed_at >= per.t_from and closed_at < per.t_to group by 1
  ),
  vd as (
    select (created_at at time zone 'Europe/Paris')::date as day, count(*) as attempts,
           count(*) filter (where passed) as passes, count(distinct user_id) as players
      from public.videur_attempts where created_at >= per.t_from and created_at < per.t_to group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'day', d.day,
           'signups', coalesce(sig.n, 0),
           'dau', (select count(*) from act a where a.day = d.day),
           'wau', (select count(distinct a.user_id) from act a where a.day between d.day - 6 and d.day),
           'mau', (select count(distinct a.user_id) from act a where a.day between d.day - 29 and d.day),
           'sessions', coalesce(pd.sessions, 0),
           'minutes', coalesce(pd.minutes, 0),
           'boosters', coalesce(tx.boosters, 0),
           'coins_created', coalesce(tx.created, 0),
           'coins_destroyed', coalesce(tx.created - tx.net, 0),  -- taxe du Market + achats à la Boutique + autres retraits
           'market_sales', coalesce(mk.sales, 0),
           'market_shop_sales', coalesce(mk.shop_sales, 0),
           'market_volume', coalesce(mk.volume, 0),
           'videur_attempts', coalesce(vd.attempts, 0),
           'videur_passes', coalesce(vd.passes, 0),
           'videur_players', coalesce(vd.players, 0)
         ) order by d.day)
    into series
    from days d
    left join sig on sig.day = d.day
    left join pd  on pd.day = d.day
    left join tx  on tx.day = d.day
    left join mk  on mk.day = d.day
    left join vd  on vd.day = d.day;

  select jsonb_build_object(
    'from', per.d_from, 'to', per.d_to,
    'players_total', (select count(*) from public.profiles),
    'signups', (select coalesce(sum((x ->> 'signups')::int), 0) from jsonb_array_elements(series) x),
    'active_players', (select count(distinct user_id) from public.analytics_active_days where day between per.d_from and per.d_to),
    'dau', series -> -1 -> 'dau', 'wau', series -> -1 -> 'wau', 'mau', series -> -1 -> 'mau',
    'sessions', (select coalesce(sum((x ->> 'sessions')::numeric), 0) from jsonb_array_elements(series) x),
    'minutes', (select coalesce(sum((x ->> 'minutes')::numeric), 0) from jsonb_array_elements(series) x),
    'boosters', (select coalesce(sum((x ->> 'boosters')::int), 0) from jsonb_array_elements(series) x),
    'coins_created', (select coalesce(sum((x ->> 'coins_created')::bigint), 0) from jsonb_array_elements(series) x),
    'coins_destroyed', (select coalesce(sum((x ->> 'coins_destroyed')::bigint), 0) from jsonb_array_elements(series) x),
    'coins_in_circulation', (select coalesce(sum(coins), 0) from public.profiles),
    'market_sales', (select coalesce(sum((x ->> 'market_sales')::int), 0) from jsonb_array_elements(series) x),
    'videur_attempts', (select coalesce(sum((x ->> 'videur_attempts')::int), 0) from jsonb_array_elements(series) x),
    'series', coalesce(series, '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

-- ============================================================
-- 3. Rétention et entonnoir (vues de la 0010)
-- ============================================================
create or replace function public.admin_retention()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare res jsonb;
begin
  perform private.admin_check();
  -- Même calcul que les vues analytics_retention_curve / analytics_retention_cohorts (0010), mais les jours
  -- actifs sont lus une seule fois (les vues refont la lecture pour chaque joueur et chaque jour).
  with act as materialized (
    select distinct user_id, day from public.analytics_active_days
  ),
  s as (
    select id as user_id, (created_at at time zone 'Europe/Paris')::date as signup_day from public.profiles
  ),
  t as (select (now() at time zone 'Europe/Paris')::date as d),
  curve as (
    select n as day_offset,
           count(*) filter (where s.signup_day + n <= t.d) as eligible_players,
           count(a.user_id) as retained_players,
           round(100.0 * count(a.user_id) / nullif(count(*) filter (where s.signup_day + n <= t.d), 0), 1) as retention_pct
      from s cross join t
      cross join unnest(array[0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 60, 90]) as n
      left join act a on a.user_id = s.user_id and a.day = s.signup_day + n
     group by n
  ),
  coh as (
    select s.signup_day, count(*) as cohort_size,
           case when s.signup_day + 1  <= t.d then round(100.0 * count(r1.user_id)  / count(*), 1) end as d1_pct,
           case when s.signup_day + 3  <= t.d then round(100.0 * count(r3.user_id)  / count(*), 1) end as d3_pct,
           case when s.signup_day + 7  <= t.d then round(100.0 * count(r7.user_id)  / count(*), 1) end as d7_pct,
           case when s.signup_day + 14 <= t.d then round(100.0 * count(r14.user_id) / count(*), 1) end as d14_pct,
           case when s.signup_day + 30 <= t.d then round(100.0 * count(r30.user_id) / count(*), 1) end as d30_pct
      from s cross join t
      left join act r1  on r1.user_id  = s.user_id and r1.day  = s.signup_day + 1
      left join act r3  on r3.user_id  = s.user_id and r3.day  = s.signup_day + 3
      left join act r7  on r7.user_id  = s.user_id and r7.day  = s.signup_day + 7
      left join act r14 on r14.user_id = s.user_id and r14.day = s.signup_day + 14
      left join act r30 on r30.user_id = s.user_id and r30.day = s.signup_day + 30
     group by s.signup_day, t.d
  )
  select jsonb_build_object(
    'curve',   coalesce((select jsonb_agg(to_jsonb(c) order by c.day_offset) from curve c), '[]'::jsonb),
    'cohorts', coalesce((select jsonb_agg(to_jsonb(c) order by c.signup_day desc) from coh c), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

create or replace function public.admin_funnel()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.admin_check();
  return coalesce((select jsonb_agg(to_jsonb(f)) from public.analytics_funnel f), '[]'::jsonb);
end;
$$;

-- ============================================================
-- 4. Joueurs : liste paginée et triable, puis fiche d'un joueur
-- ============================================================
-- p_search : morceau de pseudo (ou début d'identifiant) ; p_sort : nom d'une colonne d'analytics_player_summary
-- ou « pseudo » (défaut : last_active_day) ; p_dir : asc / desc ; p_status : actif / a_risque / perdu / inconnu.
create or replace function public.admin_players(p_search text default null, p_sort text default null,
  p_dir text default 'desc', p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cols   text[];
  v_sort   text;
  v_dir    text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  res      jsonb;
begin
  perform private.admin_check();
  -- Tri : seulement une colonne connue (jamais de texte libre dans la requête).
  select array_agg(attname::text) into v_cols
    from pg_catalog.pg_attribute
   where attrelid = 'public.analytics_player_summary'::regclass and attnum > 0 and not attisdropped;
  v_sort := case when p_sort = 'pseudo' or p_sort = any (v_cols) then p_sort else 'last_active_day' end;
  if v_search is not null then
    v_search := replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  execute format($q$
    with s as (
      select p.pseudo, s.*
        from public.analytics_player_summary s
        join public.profiles p on p.id = s.user_id
       where ($1::text is null or p.pseudo ilike '%%' || $1 || '%%' or s.user_id::text like $1 || '%%')
         and ($2::text is null or s.status = $2)
    ),
    page as (
      select * from s order by %1$I %2$s nulls last, user_id limit $3 offset $4
    )
    select jsonb_build_object(
      'total', (select count(*) from s),
      'limit', $3, 'offset', $4, 'sort', %1$L, 'dir', %2$L,
      'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.%1$I %2$s nulls last, x.user_id) from page x), '[]'::jsonb))
  $q$, v_sort, v_dir)
  into res using v_search, p_status, v_limit, v_offset;
  return res;
end;
$$;

create or replace function public.admin_player(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
begin
  perform private.admin_check();
  select * into p from public.profiles where id = p_id;
  if not found then raise exception 'Joueur introuvable'; end if;

  return jsonb_build_object(
    'profile', to_jsonb(p) - 'email',
    'is_admin', exists (select 1 from public.admins a where a.user_id = p_id),
    'summary', (select to_jsonb(s) from public.analytics_player_summary s where s.user_id = p_id),
    'days', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by d.day desc)
                        from (select * from public.player_days where user_id = p_id order by day desc limit 90) d), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' order by s.started_at desc)
                            from (select * from public.analytics_sessions where user_id = p_id
                                   order by started_at desc limit 50) s), '[]'::jsonb),
    'first_session', (select to_jsonb(f) - 'user_id' from public.analytics_first_session f where f.user_id = p_id),
    'screens', coalesce((select jsonb_agg(jsonb_build_object('screen', screen, 'minutes', round(secs / 60.0, 1), 'days', n)
                                          order by secs desc)
                           from (select screen, sum(seconds) as secs, count(*) as n
                                   from public.player_screen_days where user_id = p_id group by screen) x), '[]'::jsonb),
    'collection_by_rarity', coalesce((select jsonb_object_agg(rarity, jsonb_build_object('copies', copies, 'distinct', n))
                                        from (select rarity::text as rarity, sum(count) as copies, count(*) as n
                                                from public.inventory where user_id = p_id and count > 0 group by 1) x), '{}'::jsonb),
    'collection_by_brand', coalesce((select jsonb_agg(jsonb_build_object('brand', brand, 'copies', copies, 'distinct', n) order by copies desc)
                                       from (select pc.brand_id as brand, sum(i.count) as copies, count(*) as n
                                               from public.inventory i
                                               join public.colorways c on c.id = i.colorway_id
                                               join public.pieces pc on pc.id = c.piece_id
                                              where i.user_id = p_id and i.count > 0 group by 1) x), '[]'::jsonb),
    'album_cards', (select count(*) from public.album_cards where user_id = p_id),
    'ultimates', coalesce((select jsonb_agg(piece_id order by piece_id) from public.album_ultimates where user_id = p_id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.created_at desc)
                                from (select * from public.transactions where user_id = p_id
                                       order by created_at desc limit 50) t), '[]'::jsonb),
    'videur_attempts', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id' order by v.created_at desc)
                                   from (select * from public.videur_attempts where user_id = p_id
                                          order by created_at desc limit 50) v), '[]'::jsonb),
    'market_listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'colorway_id', l.colorway_id, 'rarity', l.rarity,
                                                   'price', l.price, 'status', l.status, 'tax', l.tax, 'closed_at', l.closed_at)
                                                   order by l.id desc)
                                   from (select * from public.market_listings where seller_id = p_id order by id desc limit 50) l), '[]'::jsonb),
    'market_purchases', (select count(*) from public.market_listings where buyer_id = p_id and status = 'sold'),
    'friends', (select count(*) from public.friendships f where f.status = 'accepted' and p_id in (f.requester, f.addressee)),
    'friend_requests_pending', (select count(*) from public.friendships f where f.status <> 'accepted' and p_id in (f.requester, f.addressee)),
    -- Partages : jamais le code secret du lien.
    'shares', coalesce((select jsonb_agg(jsonb_build_object('created_at', created_at, 'views', views,
                                         'last_viewed_at', last_viewed_at, 'equipped', equipped) order by created_at desc)
                          from (select * from public.outfit_shares where user_id = p_id order by created_at desc limit 50) o), '[]'::jsonb),
    'share_views', (select coalesce(sum(views), 0) from public.outfit_shares where user_id = p_id),
    'saved_outfits', coalesce((select jsonb_agg(to_jsonb(o) - 'user_id' order by o.slot) from public.saved_outfits o where o.user_id = p_id), '[]'::jsonb)
  );
end;
$$;

-- ============================================================
-- 5. Économie, Market, Videur, collection
-- ============================================================
create or replace function public.admin_economy(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare per record;
begin
  perform private.admin_check();
  select * into per from private.admin_period(p_from, p_to);
  return jsonb_build_object(
    'from', per.d_from, 'to', per.d_to,
    -- Pièces en circulation (soldes des joueurs, maintenant).
    'circulation', (select jsonb_build_object(
                      'total', coalesce(sum(coins), 0), 'players', count(*),
                      'average', round(avg(coins), 1),
                      'median', percentile_cont(0.5) within group (order by coins),
                      'p90', percentile_cont(0.9) within group (order by coins),
                      'max', max(coins), 'zero', count(*) filter (where coins = 0))
                      from public.profiles),
    'top_balances', coalesce((select jsonb_agg(jsonb_build_object('user_id', id, 'pseudo', pseudo, 'coins', coins) order by coins desc)
                                from (select id, pseudo, coins from public.profiles order by coins desc limit 10) x), '[]'::jsonb),
    -- Sources (pièces reçues) et puits (pièces dépensées) par type de transaction, sur la période.
    'by_kind', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'count', n, 'coins_in', cin, 'coins_out', cout) order by n desc)
                           from (select kind, count(*) as n,
                                        coalesce(sum(coins_delta) filter (where coins_delta > 0), 0) as cin,
                                        coalesce(-sum(coins_delta) filter (where coins_delta < 0), 0) as cout
                                   from public.transactions
                                  where created_at >= per.t_from and created_at < per.t_to group by kind) x), '[]'::jsonb),
    -- Créées = tout gain sauf le prix reçu par un vendeur ; détruites = créées − variation totale
    -- (= taxe du Market + achats à la Boutique Grail + autres retraits).
    'totals', (select jsonb_build_object(
                 'created', coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind <> 'market_sale'), 0),
                 'destroyed', coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind <> 'market_sale'), 0) - coalesce(sum(coins_delta), 0),
                 'net', coalesce(sum(coins_delta), 0))
                 from public.transactions where created_at >= per.t_from and created_at < per.t_to),
    'market_tax', (select coalesce(sum(tax), 0) from public.market_listings
                    where status = 'sold' and not is_system and closed_at >= per.t_from and closed_at < per.t_to),
    'shop_spent', (select coalesce(sum(price), 0) from public.market_listings
                    where status = 'sold' and is_system and closed_at >= per.t_from and closed_at < per.t_to),
    'series', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'created', created, 'destroyed', created - net) order by day)
                          from (select (created_at at time zone 'Europe/Paris')::date as day,
                                       coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind <> 'market_sale'), 0) as created,
                                       coalesce(sum(coins_delta), 0) as net
                                  from public.transactions where created_at >= per.t_from and created_at < per.t_to group by 1) x), '[]'::jsonb),
    'boosters_waiting', (select jsonb_build_object('bonus_stock', coalesce(sum(bonus_stock), 0)) from public.profiles)
  );
end;
$$;

create or replace function public.admin_market(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare per record;
begin
  perform private.admin_check();
  select * into per from private.admin_period(p_from, p_to);
  return (
    with sold as (
      select * from public.market_listings
       where status = 'sold' and closed_at >= per.t_from and closed_at < per.t_to
    )
    select jsonb_build_object(
      'from', per.d_from, 'to', per.d_to,
      'sales', (select jsonb_build_object(
                  'total', count(*), 'players', count(*) filter (where not is_system), 'shop', count(*) filter (where is_system),
                  'volume', coalesce(sum(price), 0), 'tax', coalesce(sum(tax), 0),
                  'buyers', count(distinct buyer_id), 'sellers', count(distinct seller_id))
                  from sold),
      -- Prix par rareté, joueurs et Boutique séparés.
      'prices', coalesce((select jsonb_agg(jsonb_build_object('rarity', rarity, 'shop', is_system, 'sales', n, 'average', avgp,
                                           'median', medp, 'min', minp, 'max', maxp) order by rarity, is_system)
                            from (select rarity::text as rarity, is_system, count(*) as n, round(avg(price), 1) as avgp,
                                         percentile_cont(0.5) within group (order by price) as medp, min(price) as minp, max(price) as maxp
                                    from sold group by 1, 2) x), '[]'::jsonb),
      'top_cards', coalesce((select jsonb_agg(jsonb_build_object('colorway_id', colorway_id, 'rarity', rarity, 'sales', n,
                                              'average', avgp, 'shop_sales', ns) order by n desc, colorway_id)
                               from (select colorway_id, rarity::text as rarity, count(*) as n, round(avg(price), 1) as avgp,
                                            count(*) filter (where is_system) as ns
                                       from sold group by 1, 2 order by n desc, colorway_id limit 20) x), '[]'::jsonb),
      'active_offers', coalesce((select jsonb_agg(jsonb_build_object('rarity', rarity, 'shop', is_system, 'offers', n, 'min_price', minp,
                                                  'average', avgp) order by rarity, is_system)
                                   from (select rarity::text as rarity, is_system, count(*) as n, min(price) as minp, round(avg(price), 1) as avgp
                                           from public.market_listings where status = 'active' group by 1, 2) x), '[]'::jsonb),
      'shop', jsonb_build_object(
                'state', (select to_jsonb(s) from public.shop_state s where s.id = 1),
                'active_offers', (select count(*) from public.market_listings where status = 'active' and is_system),
                'sold', (select count(*) from sold where is_system),
                'coins_spent', (select coalesce(sum(price), 0) from sold where is_system)),
      'series', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'sales', n, 'shop_sales', ns, 'volume', v, 'tax', t) order by day)
                            from (select (closed_at at time zone 'Europe/Paris')::date as day, count(*) as n,
                                         count(*) filter (where is_system) as ns, sum(price) as v, sum(tax) as t
                                    from sold group by 1) x), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_videur(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare per record;
begin
  perform private.admin_check();
  select * into per from private.admin_period(p_from, p_to);
  return (
    with att as (
      select * from public.videur_attempts where created_at >= per.t_from and created_at < per.t_to
    ),
    doors as (  -- une ligne par joueur, jour, niveau et porte : essais utilisés, passée ou non
      select user_id, day, level, door, count(*) as tries, bool_or(passed) as passed
        from att where level is not null group by 1, 2, 3, 4
    )
    select jsonb_build_object(
      'from', per.d_from, 'to', per.d_to,
      'totals', (select jsonb_build_object('attempts', count(*), 'passes', count(*) filter (where passed),
                   'players', count(distinct user_id), 'boosters_given', coalesce(sum(boosters_gained), 0)) from att),
      -- Réussite par niveau et par porte (tour de niveaux, 0032).
      'by_level_door', coalesce((select jsonb_agg(jsonb_build_object('level', level, 'door', door, 'attempts', a, 'passes', p,
                                       'players', pl, 'pass_rate', round(100.0 * p / nullif(a, 0), 1),
                                       'criteria_pct', cr) order by level, array_position(array['bar','club','vip'], door))
                                   from (select level, door, count(*) as a, count(*) filter (where passed) as p,
                                                count(distinct user_id) as pl,
                                                round(100.0 * avg(matched::numeric / nullif(total, 0)), 1) as cr
                                           from att where level is not null group by 1, 2) x), '[]'::jsonb),
      'doors', coalesce((select jsonb_agg(jsonb_build_object('door', door, 'played', n, 'passed', np,
                                 'blocked', n - np, 'avg_tries_when_passed', avgt) order by array_position(array['bar','club','vip'], door))
                           from (select door, count(*) as n, count(*) filter (where passed) as np,
                                        round(avg(tries) filter (where passed), 2) as avgt
                                   from doors group by door) x), '[]'::jsonb),
      'old_videur', (select jsonb_build_object('attempts', count(*), 'passes', count(*) filter (where passed)) from att where level is null),
      -- Niveau EN COURS des joueurs (niveaux validés + 1).
      'levels', coalesce((select jsonb_agg(jsonb_build_object('level', lvl, 'players', n) order by lvl)
                            from (select videur_level + 1 as lvl, count(*) as n from public.profiles group by 1) x), '[]'::jsonb),
      'clears', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'levels', n, 'players', pl, 'bonus_boosters', b) order by day)
                            from (select day, count(*) as n, count(distinct user_id) as pl, sum(bonus_boosters) as b
                                    from public.videur_tower_clears where day between per.d_from and per.d_to group by day) x), '[]'::jsonb),
      'series', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'attempts', a, 'passes', p, 'players', pl) order by day)
                            from (select (created_at at time zone 'Europe/Paris')::date as day, count(*) as a,
                                         count(*) filter (where passed) as p, count(distinct user_id) as pl
                                    from att group by 1) x), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.admin_collection()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.admin_check();
  return (
    with inv as (
      select i.user_id, i.colorway_id, i.rarity::text as rarity, i.count, c.piece_id, pc.brand_id
        from public.inventory i
        join public.colorways c on c.id = i.colorway_id
        join public.pieces pc on pc.id = c.piece_id
       where i.count > 0
    ),
    worn as (  -- une ligne par pièce portée : « coloris|rareté » (ou « <modèle>_ultime|ultime »)
      select p.id as user_id, split_part(e.value, '|', 1) as colorway_id, split_part(e.value, '|', 2) as rarity
        from public.profiles p, jsonb_each_text(coalesce(p.equipped, '{}'::jsonb)) e
    ),
    worn2 as (
      select w.*, coalesce(c.piece_id, case when w.colorway_id like '%\_ultime' then left(w.colorway_id, -7) end) as piece_id
        from worn w left join public.colorways c on c.id = w.colorway_id
    )
    select jsonb_build_object(
      'catalogue', jsonb_build_object('colorways', (select count(*) from public.colorways),
                                      'cards', (select count(*) * 4 from public.colorways),
                                      'cards_owned_by_someone', (select count(distinct (colorway_id, rarity)) from inv)),
      'by_rarity', coalesce((select jsonb_agg(jsonb_build_object('rarity', rarity, 'copies', copies, 'distinct', n, 'players', pl)
                                              order by array_position(array['commun','rare','epique','legendaire'], rarity))
                               from (select rarity, sum(count) as copies, count(distinct colorway_id) as n, count(distinct user_id) as pl
                                       from inv group by rarity) x), '[]'::jsonb),
      'by_brand', coalesce((select jsonb_agg(jsonb_build_object('brand', brand_id, 'copies', copies, 'players', pl,
                                             'worn', (select count(*) from worn2 w join public.pieces pc on pc.id = w.piece_id
                                                       where pc.brand_id = x.brand_id)) order by copies desc)
                              from (select brand_id, sum(count) as copies, count(distinct user_id) as pl from inv group by brand_id) x), '[]'::jsonb),
      'top_colorways_owned', coalesce((select jsonb_agg(jsonb_build_object('colorway_id', colorway_id, 'copies', copies, 'players', pl) order by copies desc, colorway_id)
                                         from (select colorway_id, sum(count) as copies, count(distinct user_id) as pl
                                                 from inv group by 1 order by copies desc, colorway_id limit 20) x), '[]'::jsonb),
      'top_models_owned', coalesce((select jsonb_agg(jsonb_build_object('piece_id', piece_id, 'copies', copies, 'players', pl) order by copies desc, piece_id)
                                      from (select piece_id, sum(count) as copies, count(distinct user_id) as pl
                                              from inv group by 1 order by copies desc, piece_id limit 20) x), '[]'::jsonb),
      'top_colorways_worn', coalesce((select jsonb_agg(jsonb_build_object('colorway_id', colorway_id, 'players', n) order by n desc, colorway_id)
                                        from (select colorway_id, count(*) as n from worn2 group by 1 order by n desc, colorway_id limit 20) x), '[]'::jsonb),
      'top_models_worn', coalesce((select jsonb_agg(jsonb_build_object('piece_id', piece_id, 'players', n) order by n desc, piece_id)
                                     from (select piece_id, count(*) as n from worn2 where piece_id is not null
                                            group by 1 order by n desc, piece_id limit 20) x), '[]'::jsonb),
      'worn_by_rarity', coalesce((select jsonb_object_agg(rarity, n) from (select rarity, count(*) as n from worn2 group by 1) x), '{}'::jsonb),
      'album', jsonb_build_object('cards', (select count(*) from public.album_cards),
                                  'players', (select count(distinct user_id) from public.album_cards),
                                  'ultimates', (select count(*) from public.album_ultimates),
                                  'top_ultimates', coalesce((select jsonb_agg(jsonb_build_object('piece_id', piece_id, 'players', n) order by n desc)
                                                               from (select piece_id, count(*) as n from public.album_ultimates
                                                                      group by 1 order by n desc limit 20) x), '[]'::jsonb)),
      'starter_kits', coalesce((select jsonb_agg(jsonb_build_object('brand', coalesce(starter_kit_brand, 'inconnue'), 'players', n) order by n desc)
                                  from (select starter_kit_brand, count(*) as n from public.profiles
                                         where starter_kit_at is not null group by 1) x), '[]'::jsonb)
    )
  );
end;
$$;

-- ============================================================
-- 6. Écrans, appareils, heures, erreurs
-- ============================================================
create or replace function public.admin_screens(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare per record;
begin
  perform private.admin_check();
  select * into per from private.admin_period(p_from, p_to);
  return jsonb_build_object(
    'from', per.d_from, 'to', per.d_to,
    -- Temps par écran (pings, 0037) ; « vues » = screen_view (événements détaillés : 90 derniers jours).
    'screens', coalesce((select jsonb_agg(jsonb_build_object('screen', x.screen, 'minutes', round(x.secs / 60.0, 1), 'players', x.pl,
                                          'views', coalesce(v.n, 0)) order by x.secs desc)
                           from (select screen, sum(seconds) as secs, count(distinct user_id) as pl
                                   from public.player_screen_days where day between per.d_from and per.d_to group by screen) x
                           left join (select props ->> 'screen' as screen, count(*) as n from public.analytics_events
                                       where name = 'screen_view' and created_at >= per.t_from and created_at < per.t_to group by 1) v
                             on v.screen = x.screen), '[]'::jsonb),
    'series', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'screen', screen, 'minutes', round(secs / 60.0, 1)) order by day, secs desc)
                          from (select day, screen, sum(seconds) as secs from public.player_screen_days
                                 where day between per.d_from and per.d_to group by 1, 2) x), '[]'::jsonb),
    'last_screen_before_leaving', coalesce((select jsonb_agg(jsonb_build_object('screen', last_screen, 'sessions', n) order by n desc)
                                              from (select coalesce(last_screen, 'inconnu') as last_screen, count(*) as n
                                                      from public.analytics_sessions
                                                     where started_at >= per.t_from and started_at < per.t_to group by 1) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_devices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    -- Plateforme par session (gardé après le nettoyage des événements).
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('platform', platform, 'sessions', n, 'players', pl) order by n desc)
                             from (select coalesce(platform, 'inconnu') as platform, count(*) as n, count(distinct user_id) as pl
                                     from public.analytics_sessions group by 1) x), '[]'::jsonb),
    -- Détail (appli installée, largeur d'écran) : 90 derniers jours (vue de la 0010).
    'details', coalesce((select jsonb_agg(to_jsonb(d)) from public.analytics_devices d), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_hours()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.admin_check();
  return jsonb_build_object(
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'sessions', n, 'players', pl) order by h)
                           from (select extract(hour from started_at at time zone 'Europe/Paris')::int as h, count(*) as n,
                                        count(distinct user_id) as pl from public.analytics_sessions group by 1) x), '[]'::jsonb),
    -- 1 = lundi … 7 = dimanche
    'by_weekday', coalesce((select jsonb_agg(jsonb_build_object('weekday', w, 'sessions', n, 'players', pl) order by w)
                              from (select extract(isodow from started_at at time zone 'Europe/Paris')::int as w, count(*) as n,
                                           count(distinct user_id) as pl from public.analytics_sessions group by 1) x), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_errors(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare per record;
begin
  perform private.admin_check();
  select * into per from private.admin_period(p_from, p_to);
  return (
    with err as (
      select e.created_at, e.user_id, e.props ->> 'msg' as msg
        from public.analytics_events e
       where e.name = 'client_error' and e.created_at >= per.t_from and e.created_at < per.t_to
    )
    select jsonb_build_object(
      'from', per.d_from, 'to', per.d_to,
      'by_message', coalesce((select jsonb_agg(jsonb_build_object('msg', msg, 'count', n, 'players', pl, 'last_at', la) order by n desc)
                                from (select coalesce(msg, '') as msg, count(*) as n, count(distinct user_id) as pl, max(created_at) as la
                                        from err group by 1 order by n desc limit 50) x), '[]'::jsonb),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('at', r.created_at, 'msg', r.msg, 'user_id', r.user_id, 'pseudo', p.pseudo)
                                           order by r.created_at desc)
                            from (select * from err order by created_at desc limit 50) r
                            left join public.profiles p on p.id = r.user_id), '[]'::jsonb)
    )
  );
end;
$$;

-- ============================================================
-- 7. Droits : authenticated seulement (le refus « Accès refusé » est fait dans chaque fonction)
-- ============================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_overview(date, date)', 'public.admin_retention()', 'public.admin_funnel()',
    'public.admin_players(text, text, text, text, integer, integer)', 'public.admin_player(uuid)',
    'public.admin_economy(date, date)', 'public.admin_market(date, date)', 'public.admin_videur(date, date)',
    'public.admin_collection()', 'public.admin_screens(date, date)', 'public.admin_devices()',
    'public.admin_hours()', 'public.admin_errors(date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- ============================================================
-- 8. Contrôle : 13 fonctions admin_*, aucune exécutable par anon ; admins = nombre d'administrateurs
-- ============================================================
select count(*) as fonctions_admin,
       count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) as executables_par_anon,
       count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')) as executables_par_authenticated,
       (select count(*) from public.admins) as admins
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'admin\_%';
