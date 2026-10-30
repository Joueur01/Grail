-- Grail — migration 0040 : données des graphiques globaux du panel admin (lecture seule).
-- À exécuter APRÈS la 0039 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Nouvelles fonctions, sur le même modèle que la 0038 : `security definer`, `set search_path = ''`,
-- `perform private.admin_check()` en premier (« Accès refusé » si l'appelant n'est pas admin), exécutables
-- seulement par `authenticated`, jamais d'e-mail, aucun appel à private.cfg(), rien n'est modifié.
--   admin_first_day()                      premier jour du jeu (1re inscription) : période « Tout »
--   admin_economy_flows(p_from, p_to)      pièces reçues par source et détruites par puits, par jour ;
--                                          pièces en circulation à la fin de chaque jour ; répartition des soldes
--   admin_market_daily(p_from, p_to)       ventes par jour et par rareté (joueurs / Boutique)
--   admin_first_sessions(p_from, p_to)     premières sessions : répartition de la durée, dernier écran
--   admin_booster_drops(p_from, p_to)      cartes sorties des boosters par rareté (tirage normal / carte Signature)

-- ============================================================
-- 1. Premier jour du jeu
-- ============================================================
create or replace function public.admin_first_day()
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.admin_check();
  return coalesce((select min((created_at at time zone 'Europe/Paris')::date) from public.profiles),
                  (now() at time zone 'Europe/Paris')::date);
end;
$$;

-- ============================================================
-- 2. Flux de pièces par jour + circulation + soldes
-- ============================================================
-- Reçues : bonus (daily_bonus, bonus d'inscription compris), défausse, ventes au Market (prix − taxe : un
-- TRANSFERT entre joueurs, pas une création), autres gains. Créées = bonus + défausse + autres gains.
-- Détruites : taxe du Market, achats à la Boutique Grail, autres (= créées − variation totale − taxe − Boutique).
-- Circulation à la fin d'un jour = soldes actuels − variation des pièces après ce jour (lue dans `transactions`).
create or replace function public.admin_economy_flows(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  per record;
  today date := (now() at time zone 'Europe/Paris')::date;
  total_now bigint;
begin
  perform private.admin_check();
  select * into per from private.admin_period(p_from, p_to);
  select coalesce(sum(coins), 0) into total_now from public.profiles;

  return (
    with days as (
      select generate_series(per.d_from, greatest(per.d_to, today), interval '1 day')::date as day
    ),
    tx as (
      select (created_at at time zone 'Europe/Paris')::date as day,
             coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind = 'daily_bonus'), 0) as bonus,
             coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind = 'discard'), 0) as discard,
             coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind = 'market_sale'), 0) as sales,
             coalesce(sum(coins_delta) filter (where coins_delta > 0 and kind not in ('daily_bonus', 'discard', 'market_sale')), 0) as other_in,
             coalesce(sum(coins_delta), 0) as net
        from public.transactions where created_at >= per.t_from group by 1
    ),
    mk as (
      select (closed_at at time zone 'Europe/Paris')::date as day,
             coalesce(sum(tax) filter (where not is_system), 0) as tax,
             coalesce(sum(price) filter (where is_system), 0) as shop
        from public.market_listings
       where status = 'sold' and closed_at >= per.t_from and closed_at < per.t_to group by 1
    ),
    d as (
      select days.day,
             coalesce(tx.bonus, 0) as bonus, coalesce(tx.discard, 0) as discard, coalesce(tx.sales, 0) as sales,
             coalesce(tx.other_in, 0) as other_in, coalesce(tx.net, 0) as net,
             coalesce(mk.tax, 0) as tax, coalesce(mk.shop, 0) as shop,
             -- variation de TOUS les jours suivants (jusqu'à aujourd'hui)
             coalesce(sum(coalesce(tx.net, 0)) over (order by days.day rows between 1 following and unbounded following), 0) as after
        from days left join tx on tx.day = days.day left join mk on mk.day = days.day
    )
    select jsonb_build_object(
      'from', per.d_from, 'to', per.d_to,
      'circulation_now', total_now,
      'daily', coalesce((select jsonb_agg(jsonb_build_object(
                  'day', day, 'bonus', bonus, 'discard', discard, 'sales', sales, 'other_in', other_in,
                  'created', bonus + discard + other_in,
                  'tax', tax, 'shop', shop,
                  'destroyed', bonus + discard + other_in - net,
                  'other_out', greatest(bonus + discard + other_in - net - tax - shop, 0),
                  'circulation', total_now - after) order by day)
                  from d where day <= per.d_to), '[]'::jsonb),
      'balances', coalesce((select jsonb_agg(jsonb_build_object('bucket', label, 'players', n) order by ord)
                  from (select b.ord, b.label, count(p.id) as n
                          from (values (1, '0', 0, 0), (2, '1-49', 1, 49), (3, '50-99', 50, 99), (4, '100-249', 100, 249),
                                       (5, '250-499', 250, 499), (6, '500-999', 500, 999), (7, '1 000-2 499', 1000, 2499),
                                       (8, '2 500 et +', 2500, 2147483647)) as b(ord, label, lo, hi)
                          left join public.profiles p on p.coins between b.lo and b.hi
                         group by b.ord, b.label) x), '[]'::jsonb)
    )
  );
end;
$$;

-- ============================================================
-- 3. Ventes au Market par jour et par rareté
-- ============================================================
create or replace function public.admin_market_daily(p_from date default null, p_to date default null)
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
    'rows', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'rarity', rarity, 'sales', n, 'shop_sales', ns,
                                       'volume', v, 'shop_volume', sv) order by day, rarity)
                        from (select (closed_at at time zone 'Europe/Paris')::date as day, rarity::text as rarity,
                                     count(*) as n, count(*) filter (where is_system) as ns,
                                     coalesce(sum(price), 0) as v, coalesce(sum(price) filter (where is_system), 0) as sv
                                from public.market_listings
                               where status = 'sold' and closed_at >= per.t_from and closed_at < per.t_to
                               group by 1, 2) x), '[]'::jsonb)
  );
end;
$$;

-- ============================================================
-- 4. Premières sessions des joueurs (commencées dans la période)
-- ============================================================
create or replace function public.admin_first_sessions(p_from date default null, p_to date default null)
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
    with f as (
      select * from public.analytics_first_session where started_at >= per.t_from and started_at < per.t_to
    )
    select jsonb_build_object(
      'from', per.d_from, 'to', per.d_to,
      'players', (select count(*) from f),
      'median_minutes', (select round((percentile_cont(0.5) within group (order by active_minutes))::numeric, 1) from f),
      'average_minutes', (select round(avg(active_minutes), 1) from f),
      'came_back_pct', (select round(100.0 * count(*) filter (where came_back_next_day) / nullif(count(came_back_next_day), 0), 1) from f),
      -- Durée = temps actif (jeu affiché).
      'durations', coalesce((select jsonb_agg(jsonb_build_object('bucket', b.label, 'players', b.n, 'came_back', b.back) order by b.ord)
                    from (select r.ord, r.label, count(f.user_id) as n, count(f.user_id) filter (where f.came_back_next_day) as back
                            from (values (1, '< 1 min', 0, 1), (2, '1-3 min', 1, 3), (3, '3-5 min', 3, 5), (4, '5-10 min', 5, 10),
                                         (5, '10-20 min', 10, 20), (6, '20-40 min', 20, 40), (7, '40 min et +', 40, 1e9)) as r(ord, label, lo, hi)
                            left join f on f.active_minutes >= r.lo and f.active_minutes < r.hi
                           group by r.ord, r.label) b), '[]'::jsonb),
      'last_screens', coalesce((select jsonb_agg(jsonb_build_object('screen', s, 'players', n) order by n desc)
                    from (select coalesce(last_screen_before_leaving, 'inconnu') as s, count(*) as n from f group by 1) x), '[]'::jsonb)
    )
  );
end;
$$;

-- ============================================================
-- 5. Cartes sorties des boosters par rareté
-- ============================================================
-- Lu dans transactions.details.cards des boosters ouverts : [{ colorway_id, rarity, signature, forced, … }].
-- « signature » = la carte Signature (3e carte d'un Booster Signature, table à part) ; « standard » = toutes les
-- autres. « forced » = carte imposée par une garantie (pity) : elle fausse un peu la comparaison avec les taux.
create or replace function public.admin_booster_drops(p_from date default null, p_to date default null)
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
    with b as (
      select t.details from public.transactions t
       where t.kind = 'booster' and t.created_at >= per.t_from and t.created_at < per.t_to
    ),
    c as (
      select case when coalesce((e ->> 'signature')::boolean, false) then 'signature' else 'standard' end as draw,
             e ->> 'rarity' as rarity,
             (e ->> 'forced') is not null and e ->> 'forced' <> 'null' as forced
        from b, jsonb_array_elements(case when jsonb_typeof(b.details -> 'cards') = 'array' then b.details -> 'cards' else '[]'::jsonb end) e
    )
    select jsonb_build_object(
      'from', per.d_from, 'to', per.d_to,
      'boosters', (select count(*) from b),
      'signature_boosters', (select count(*) from b where coalesce((details ->> 'signature')::boolean, false)),
      'cards', coalesce((select jsonb_agg(jsonb_build_object('draw', draw, 'rarity', rarity, 'cards', n, 'forced', nf) order by draw, rarity)
                           from (select draw, rarity, count(*) as n, count(*) filter (where forced) as nf from c group by 1, 2) x), '[]'::jsonb)
    )
  );
end;
$$;

-- ============================================================
-- 6. Droits : authenticated seulement (le refus « Accès refusé » est fait dans chaque fonction)
-- ============================================================
do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_first_day()', 'public.admin_economy_flows(date, date)', 'public.admin_market_daily(date, date)',
    'public.admin_first_sessions(date, date)', 'public.admin_booster_drops(date, date)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Contrôle : 18 fonctions admin_*, aucune exécutable par anon, toutes par authenticated.
select count(*) as fonctions_admin,
       count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) as executables_par_anon,
       count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')) as executables_par_authenticated
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'admin\_%';
