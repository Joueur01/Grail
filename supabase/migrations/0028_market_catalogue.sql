-- Grail — migration 0028 : Marché « Bazaar », phase 1 (catalogue complet, offres par carte, dernières ventes).
-- Voir CLAUDE.md, section 6 (Market). À exécuter APRÈS la 0027 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Avant, le site ne recevait que l'offre la MOINS CHÈRE de chaque carte (vue market_best_offers), sans nombre d'offres.
-- Le Marché devient un catalogue : pour chaque carte, le nombre d'offres, le meilleur prix, le dernier prix de vente
-- et le nombre de ventes récentes ; et, sur la page d'une carte, TOUTES ses offres.
--
--  * market_catalog()        : une ligne par carte qui a des offres ou des ventes (les autres cartes n'ont rien à
--                              dire : le site les connaît par son catalogue et affiche « aucune offre »).
--  * market_card_offers(c,r) : les offres actuelles d'une carte, triées par prix. Le vendeur n'est JAMAIS révélé :
--                              seulement « Boutique Grail » ou « joueur » (shop), et « c'est la mienne » (mine).
-- Réglages : economy_config.MARKET.recentDays (7 : fenêtre des « ventes récentes») et MARKET.offersPerCard (30 :
-- nombre maximum d'offres listées par carte). Un réglage déjà modifié à la main n'est pas écrasé.
--
-- Les offres de la boutique ne comptent que si la boutique est activée (public.shop_enabled(), 0027).
-- Les ventes de la boutique comptent comme des ventes. Rien d'autre n'est exposé (ni pseudo, ni identifiant de joueur).

-- ============================================================
-- 1. Réglages et index
-- ============================================================
update public.economy_config
   set config = jsonb_set(config, '{MARKET}',
         jsonb_build_object('recentDays', 7, 'offersPerCard', 30) || (config -> 'MARKET')),
       updated_at = now()
 where id = 1 and config ? 'MARKET';

create index if not exists market_listings_card_idx on public.market_listings (colorway_id, rarity, status);

-- ============================================================
-- 2. Le catalogue du Marché
-- ============================================================
create or replace function public.market_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  days integer := coalesce((private.cfg() -> 'MARKET' ->> 'recentDays')::integer, 7);
  shop boolean := public.shop_enabled();
  out  jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  with a as (            -- offres actuelles
    select colorway_id, rarity,
           count(*) as offers, min(price) as best,
           count(*) filter (where seller_id = uid) as mine, bool_or(is_system) as has_shop
      from public.market_listings
     where status = 'active' and (not is_system or shop)
     group by colorway_id, rarity
  ), s as (              -- dernière vente de chaque carte
    select distinct on (colorway_id, rarity) colorway_id, rarity, price as last_price, closed_at as last_at
      from public.market_listings
     where status = 'sold'
     order by colorway_id, rarity, closed_at desc nulls last, id desc
  ), rc as (             -- ventes récentes
    select colorway_id, rarity, count(*) as n
      from public.market_listings
     where status = 'sold' and closed_at > now() - make_interval(days => days)
     group by colorway_id, rarity
  ), k as (
    select colorway_id, rarity from a union select colorway_id, rarity from s
  )
  select jsonb_build_object(
           'recent_days', days,
           'cards', coalesce(jsonb_agg(jsonb_build_object(
              'c', k.colorway_id, 'r', k.rarity,
              'offers', coalesce(a.offers, 0), 'best', a.best, 'mine', coalesce(a.mine, 0),
              'shop', coalesce(a.has_shop, false),
              'last', s.last_price, 'last_at', s.last_at, 'recent', coalesce(rc.n, 0))), '[]'::jsonb))
    into out
    from k
    left join a  on a.colorway_id  = k.colorway_id and a.rarity  = k.rarity
    left join s  on s.colorway_id  = k.colorway_id and s.rarity  = k.rarity
    left join rc on rc.colorway_id = k.colorway_id and rc.rarity = k.rarity;
  return out;
end;
$$;

-- ============================================================
-- 3. Les offres d'une carte
-- ============================================================
create or replace function public.market_card_offers(p_colorway text, p_rarity public.rarity)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  lim  integer := least(greatest(coalesce((private.cfg() -> 'MARKET' ->> 'offersPerCard')::integer, 30), 1), 100);
  shop boolean := public.shop_enabled();
  rows_ jsonb;
  total integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select count(*) into total
    from public.market_listings
   where colorway_id = p_colorway and rarity = p_rarity and status = 'active' and (not is_system or shop);

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'price', x.price, 'shop', x.is_system, 'mine', x.mine)
                            order by x.price, x.id), '[]'::jsonb)
    into rows_
    from (select id, price, is_system, coalesce(seller_id = uid, false) as mine
            from public.market_listings
           where colorway_id = p_colorway and rarity = p_rarity and status = 'active' and (not is_system or shop)
           order by price, id
           limit lim) x;

  return jsonb_build_object('total', total, 'offers', rows_);
end;
$$;

-- ============================================================
-- 4. Droits
-- ============================================================
revoke execute on function public.market_catalog()                         from public, anon;
revoke execute on function public.market_card_offers(text, public.rarity)  from public, anon;
grant  execute on function public.market_catalog()                         to authenticated;
grant  execute on function public.market_card_offers(text, public.rarity)  to authenticated;
