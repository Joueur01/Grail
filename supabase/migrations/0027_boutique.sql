-- Grail — migration 0027 : « Boutique Grail » (vendeur système du Market) + bonus d'inscription de 50 pièces.
-- Voir CLAUDE.md, section 6 (Market). À exécuter APRÈS la 0026 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- BOUTIQUE GRAIL
--  * Un seul marché : les offres de la boutique apparaissent dans la liste normale, mélangées à celles des joueurs
--    (vue market_best_offers : une offre par carte, la moins chère). Elles portent l'indicateur is_shop (badge
--    « Boutique Grail » côté site) : elles ne passent pas pour des offres de joueurs.
--  * Vendeur système = offres SANS vendeur (market_listings.seller_id vide, is_system = true) : pas de faux compte.
--  * Renouvellement chaque jour à 6 h (Paris) : supprime UNIQUEMENT les offres système encore actives, puis tire de
--    nouvelles offres. Déclenché (1) par pg_cron chaque heure si l'extension est installée, (2) à l'ouverture du
--    Market (get_market_shop) si le jour de boutique a changé : la boutique ne reste jamais figée.
--  * Tirage, pour chaque coloris et chaque rareté : chance d'apparaître, puis stock tiré selon une répartition.
--    Prix = prix de référence du Market + 25 %, arrondi. TOUT est dans economy_config.SHOP (rien en dur).
--  * Achat d'une offre système : le vendeur ne reçoit RIEN (les pièces disparaissent de l'économie, c'est voulu),
--    aucune taxe, aucune écriture côté vendeur. Elle ne compte pas dans la limite de 10 offres par joueur
--    (cette limite compte les offres du joueur : seller_id = lui).
--  * Un seul réglage pour tout couper : economy_config.SHOP.enabled = false (les offres disparaissent de la vue et
--    deviennent inachetables tout de suite, puis sont supprimées au prochain passage).
--
-- BONUS D'INSCRIPTION : le tout premier bonus du compte (colonne last_daily_bonus vide) vaut COINS.signupBonus
-- (50) ; ensuite, COINS.dailyLoginBonus (20) par jour comme avant.
--
-- SÉCURITÉ : market_cancel est redéfinie. Avec un vendeur vide, la comparaison « seller_id <> uid » vaut NULL et
-- ne refuserait plus l'annulation : un joueur aurait pu « annuler » une offre système et recevoir la carte.
-- Redéfinit : market_buy, market_cancel, market_history, claim_daily_bonus, vue market_best_offers.

-- ============================================================
-- 1. Table des offres : vendeur facultatif pour la boutique
-- ============================================================
alter table public.market_listings alter column seller_id drop not null;
alter table public.market_listings add column if not exists is_system boolean not null default false;
alter table public.market_listings drop constraint if exists market_listings_seller_or_system;
alter table public.market_listings add constraint market_listings_seller_or_system
  check (seller_id is not null or is_system);
create index if not exists market_listings_system_idx on public.market_listings (is_system) where is_system;

-- Dernier renouvellement (une seule ligne). Illisible par le site.
create table if not exists public.shop_state (
  id           integer primary key default 1 check (id = 1),
  last_day     date,
  refreshed_at timestamptz
);
insert into public.shop_state (id) values (1) on conflict do nothing;
alter table public.shop_state enable row level security;
revoke all on public.shop_state from anon, authenticated;

-- ============================================================
-- 2. Réglages (on ne remplace pas une valeur déjà réglée à la main)
-- ============================================================
-- chance : % d'apparaître, pour chaque coloris ; stock : { quantité : poids } ; prix = référence du Market + markup %.
update public.economy_config
   set config = config || jsonb_build_object('SHOP', jsonb_build_object(
         'enabled', true,
         'name', 'Boutique Grail',
         'refreshHour', 6,
         'timezone', 'Europe/Paris',
         'priceMarkupPercent', 25,
         'rarities', jsonb_build_object(
           'commun',     jsonb_build_object('chance', 25,  'stock', jsonb_build_object('1', 60, '2', 25, '3', 10, '4', 5)),
           'rare',       jsonb_build_object('chance', 8,   'stock', jsonb_build_object('1', 75, '2', 20, '3', 5)),
           'epique',     jsonb_build_object('chance', 0.5, 'stock', jsonb_build_object('1', 100)),
           'legendaire', jsonb_build_object('chance', 0.1, 'stock', jsonb_build_object('1', 100))))),
       updated_at = now()
 where id = 1 and not (config ? 'SHOP');

update public.economy_config
   set config = jsonb_set(config, '{COINS,signupBonus}', '50'::jsonb), updated_at = now()
 where id = 1 and config ? 'COINS' and not (config -> 'COINS' ? 'signupBonus');

-- ============================================================
-- 3. Renouvellement de la boutique
-- ============================================================
-- « Jour de boutique » : change à refreshHour (heure locale), pas à minuit.
create or replace function private.shop_day()
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone coalesce(private.cfg() -> 'SHOP' ->> 'timezone', 'Europe/Paris'))
          - make_interval(hours => coalesce((private.cfg() -> 'SHOP' ->> 'refreshHour')::integer, 6)))::date
$$;

-- Renouvelle la boutique si le jour a changé (ou si p_force). Renvoie le nombre d'offres créées (null : rien à faire).
create or replace function private.shop_refresh(p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg     jsonb := private.cfg() -> 'SHOP';
  ref     jsonb := private.cfg() -> 'MARKET' -> 'referencePrice';
  markup  numeric := coalesce((cfg ->> 'priceMarkupPercent')::numeric, 0);
  today   date := private.shop_day();
  st      public.shop_state%rowtype;
  r       record;
  cw      record;
  v_price integer;
  v_qty   integer;
  v_made  integer := 0;
begin
  -- Un seul renouvellement à la fois ; si un autre est en cours, on laisse faire.
  if not pg_try_advisory_xact_lock(hashtext('grail:shop')) then return null; end if;

  -- Boutique coupée : on retire les offres système et on oublie le dernier jour (la remise en marche renouvelle).
  if cfg is null or not coalesce((cfg ->> 'enabled')::boolean, false) then
    delete from public.market_listings where is_system and status = 'active';
    update public.shop_state set last_day = null where id = 1;
    return null;
  end if;

  select * into st from public.shop_state where id = 1 for update;
  if not p_force and st.last_day is not distinct from today then return null; end if;

  -- Seules les offres du vendeur système sont supprimées : jamais celles des joueurs.
  delete from public.market_listings where is_system and status = 'active';

  for r in select key as rarity, value as conf from jsonb_each(cfg -> 'rarities') loop
    v_price := round((ref ->> r.rarity)::numeric * (100 + markup) / 100.0)::integer;
    if v_price is null or v_price < 1 then continue; end if;
    for cw in select id from public.colorways loop
      if random() * 100 < (r.conf ->> 'chance')::numeric then
        -- Stock : tirage pondéré (course d'exponentielles : la plus petite valeur gagne).
        select key::integer into v_qty
          from jsonb_each_text(r.conf -> 'stock')
         order by -ln(1 - random()) / nullif(value::numeric, 0) limit 1;
        for i in 1 .. coalesce(v_qty, 1) loop
          insert into public.market_listings (seller_id, colorway_id, rarity, price, is_system)
          values (null, cw.id, r.rarity::public.rarity, v_price, true);
          v_made := v_made + 1;
        end loop;
      end if;
    end loop;
  end loop;

  update public.shop_state set last_day = today, refreshed_at = now() where id = 1;
  return v_made;
end;
$$;
revoke all on function private.shop_refresh(boolean) from public, anon, authenticated;

-- État de la boutique pour le site : renouvelle si besoin, puis donne le décompte jusqu'au prochain renouvellement.
create or replace function public.get_market_shop()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg    jsonb;
  tz     text;
  hr     integer;
  loc    timestamp;
  nxt    timestamp;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  perform private.shop_refresh(false);

  cfg := private.cfg() -> 'SHOP';
  if cfg is null or not coalesce((cfg ->> 'enabled')::boolean, false) then
    return jsonb_build_object('enabled', false);
  end if;
  tz := coalesce(cfg ->> 'timezone', 'Europe/Paris');
  hr := coalesce((cfg ->> 'refreshHour')::integer, 6);

  loc := now() at time zone tz;
  nxt := date_trunc('day', loc) + make_interval(hours => hr);
  if nxt <= loc then nxt := nxt + interval '1 day'; end if;

  select count(*) into v_count from public.market_listings where is_system and status = 'active';
  return jsonb_build_object(
    'enabled', true,
    'name', coalesce(cfg ->> 'name', 'Boutique Grail'),
    'next_in_seconds', greatest(0, round(extract(epoch from ((nxt at time zone tz) - now()))))::integer,
    'offers', v_count);
end;
$$;

-- ============================================================
-- 4. Vue des meilleures offres : + is_shop, et la boutique coupée disparaît tout de suite
-- ============================================================
create or replace view public.market_best_offers as
  select distinct on (colorway_id, rarity)
         id, colorway_id, rarity, price,
         coalesce(seller_id = auth.uid(), false) as is_mine,
         is_system as is_shop
    from public.market_listings
   where status = 'active'
     and (not is_system or coalesce((private.cfg() -> 'SHOP' ->> 'enabled')::boolean, false))
   order by colorway_id, rarity, price, id;

-- ============================================================
-- 5. Achat (copie de la version du serveur + vendeur système)
-- ============================================================
create or replace function public.market_buy(p_id bigint, p_expected_price integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l   public.market_listings%rowtype;
  bal integer;
  pct integer := coalesce((private.cfg() -> 'MARKET' ->> 'saleTaxPercent')::integer, 0);
  v_tax integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select * into l from public.market_listings where id = p_id for update;
  if not found or l.status <> 'active' then raise exception 'Offre indisponible'; end if;
  if l.is_system and not coalesce((private.cfg() -> 'SHOP' ->> 'enabled')::boolean, false) then
    raise exception 'Offre indisponible';
  end if;
  if l.seller_id = uid then raise exception 'Tu ne peux pas acheter ta propre offre'; end if;
  if p_expected_price is not null and p_expected_price <> l.price then raise exception 'Le prix a changé'; end if;

  -- Taxe : pourcentage du prix, arrondi à l'entier supérieur (0 si le taux est 0). Aucune taxe à la boutique.
  v_tax := case when l.is_system then 0
                when pct > 0 then least(l.price, ceil(l.price * pct / 100.0)::integer)
                else 0 end;

  -- Verrou des deux joueurs dans un ordre fixe (évite les blocages croisés).
  perform 1 from public.profiles where id in (uid, l.seller_id) order by id for update;

  select coins into bal from public.profiles where id = uid;
  if bal < l.price then raise exception 'Il te manque % pièces', l.price - bal; end if;

  update public.profiles set coins = coins - l.price where id = uid;
  if not l.is_system then
    update public.profiles set coins = coins + (l.price - v_tax) where id = l.seller_id;
  end if; -- boutique : les pièces dépensées disparaissent
  perform private.give_cards(uid, l.colorway_id, l.rarity, 1);

  update public.market_listings set status = 'sold', buyer_id = uid, closed_at = now(), tax = v_tax where id = p_id;

  insert into public.transactions (user_id, kind, coins_delta, details)
  values (uid, 'market_buy', -l.price,
          jsonb_build_object('listing', p_id, 'colorway_id', l.colorway_id, 'rarity', l.rarity)
          || case when l.is_system then jsonb_build_object('shop', true) else '{}'::jsonb end);
  if not l.is_system then
    insert into public.transactions (user_id, kind, coins_delta, details)
    values (l.seller_id, 'market_sale', l.price - v_tax,
            jsonb_build_object('listing', p_id, 'colorway_id', l.colorway_id, 'rarity', l.rarity,
                               'price', l.price, 'tax', v_tax));
  end if;

  return jsonb_build_object('colorway_id', l.colorway_id, 'rarity', l.rarity, 'price', l.price, 'shop', l.is_system);
end;
$$;

-- ============================================================
-- 6. Annulation (copie + correction : une offre système n'est JAMAIS annulable par un joueur)
-- ============================================================
create or replace function public.market_cancel(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l   public.market_listings%rowtype;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select * into l from public.market_listings where id = p_id for update;
  -- is distinct from : un vendeur vide (boutique) ne doit pas passer le contrôle.
  if not found or l.seller_id is distinct from uid or l.status <> 'active' then
    raise exception 'Offre indisponible';
  end if;

  update public.market_listings set status = 'cancelled', closed_at = now() where id = p_id;
  perform private.give_cards(uid, l.colorway_id, l.rarity, 1);

  insert into public.transactions (user_id, kind, details)
  values (uid, 'market_cancel', jsonb_build_object('listing', p_id, 'colorway_id', l.colorway_id, 'rarity', l.rarity));
end;
$$;

-- ============================================================
-- 7. Historique (copie + « shop » : achat fait à la Boutique Grail)
-- ============================================================
create or replace function public.market_history(p_limit integer default 30, p_before bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  lim   integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  rows_ jsonb;
  n     integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  with page as (
    select id, kind, abs(coins_delta) as coins,
           details ->> 'colorway_id' as colorway_id, details ->> 'rarity' as rarity, created_at,
           coalesce((details ->> 'shop')::boolean, false) as shop
      from public.transactions
     where user_id = uid and kind in ('market_buy', 'market_sale')
       and (p_before is null or id < p_before)
     order by id desc
     limit lim + 1
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id desc), '[]'::jsonb), count(*)
    into rows_, n
    from (select * from page order by id desc limit lim) x;

  return jsonb_build_object(
    'items', rows_,
    'has_more', (select count(*) from (
        select 1 from public.transactions
         where user_id = uid and kind in ('market_buy', 'market_sale') and (p_before is null or id < p_before)
         offset lim limit 1) y) > 0,
    'total_spent',  coalesce((select sum(-coins_delta) from public.transactions where user_id = uid and kind = 'market_buy'), 0),
    'total_earned', coalesce((select sum(coins_delta)  from public.transactions where user_id = uid and kind = 'market_sale'), 0)
  );
end;
$$;

-- ============================================================
-- 8. Bonus : 50 pièces au tout premier bonus du compte, puis 20 par jour
-- ============================================================
create or replace function public.claim_daily_bonus()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  today   date := (now() at time zone 'Europe/Paris')::date;
  amount  integer;
  signup  integer;
  v_first boolean;
  done    integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select (config -> 'COINS' ->> 'dailyLoginBonus')::integer, (config -> 'COINS' ->> 'signupBonus')::integer
    into amount, signup from public.economy_config where id = 1;
  if amount is null then raise exception 'Configuration d''économie manquante'; end if;

  select last_daily_bonus is null into v_first from public.profiles where id = uid for update;
  if v_first and signup is not null then amount := signup; end if;

  update public.profiles
     set coins = coins + amount, last_daily_bonus = today
   where id = uid and (last_daily_bonus is null or last_daily_bonus < today);
  get diagnostics done = row_count;
  if done = 0 then return 0; end if;

  insert into public.transactions (user_id, kind, coins_delta, details)
  values (uid, 'daily_bonus', amount, jsonb_build_object('day', today, 'signup', coalesce(v_first, false)));
  return amount;
end;
$$;

-- ============================================================
-- 9. Droits
-- ============================================================
revoke execute on function public.get_market_shop()                 from public, anon;
revoke execute on function public.market_buy(bigint, integer)       from public, anon;
revoke execute on function public.market_cancel(bigint)             from public, anon;
revoke execute on function public.market_history(integer, bigint)  from public, anon;
revoke execute on function public.claim_daily_bonus()               from public, anon;
grant  execute on function public.get_market_shop()                 to authenticated;
grant  execute on function public.market_buy(bigint, integer)       to authenticated;
grant  execute on function public.market_cancel(bigint)             to authenticated;
grant  execute on function public.market_history(integer, bigint)  to authenticated;
grant  execute on function public.claim_daily_bonus()               to authenticated;

-- ============================================================
-- 10. Renouvellement planifié (pg_cron, si disponible) + première sélection
-- ============================================================
-- Toutes les heures pile : la fonction ne renouvelle que si le jour de boutique (6 h, Paris) a changé, ce qui
-- reste juste été comme hiver. Sans pg_cron, get_market_shop() renouvelle à l'ouverture du Market.
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron indisponible : le renouvellement se fera à l''ouverture du Market (%).', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('grail-shop-refresh', '0 * * * *', 'select private.shop_refresh()');
    exception when others then
      raise notice 'Planification pg_cron impossible : le renouvellement se fera à l''ouverture du Market (%).', sqlerrm;
    end;
  end if;
end $$;

-- Première sélection tout de suite (si la boutique est activée).
select private.shop_refresh(false);
