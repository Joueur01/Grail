-- Grail — migration 0011 : taxe de 5 % sur chaque vente du Market (payée par le vendeur).
-- À exécuter APRÈS la 0010 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Règle : à chaque achat, le vendeur reçoit le prix MOINS la taxe ; l'acheteur paie le prix affiché.
--   taxe = prix × 5 %, arrondie à l'entier SUPÉRIEUR (minimum 1 pièce, donc jamais de vente « gratuite »
--   de la taxe) ; le vendeur reçoit prix − taxe. Exemples : 8 → taxe 1, reçoit 7 ; 40 → taxe 2, reçoit 38 ;
--   600 → taxe 30, reçoit 570. Les pièces de la taxe disparaissent de l'économie.
-- Le taux est dans economy_config (MARKET.saleTaxPercent) : modifiable sans toucher au code.
-- Les ventes passées ne sont pas modifiées (taxe 0).

update public.economy_config
   set config = config || jsonb_build_object(
         'MARKET', coalesce(config -> 'MARKET', '{}'::jsonb) || jsonb_build_object('saleTaxPercent', 5)),
       updated_at = now()
 where id = 1;

-- La taxe prélevée est gardée sur la vente (statistiques, historique).
alter table public.market_listings add column if not exists tax integer not null default 0;

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
  if l.seller_id = uid then raise exception 'Tu ne peux pas acheter ta propre offre'; end if;
  if p_expected_price is not null and p_expected_price <> l.price then raise exception 'Le prix a changé'; end if;

  -- Taxe : pourcentage du prix, arrondi à l'entier supérieur (0 si le taux est 0).
  v_tax := case when pct > 0 then least(l.price, ceil(l.price * pct / 100.0)::integer) else 0 end;

  -- Verrou des deux joueurs dans un ordre fixe (évite les blocages croisés).
  perform 1 from public.profiles where id in (uid, l.seller_id) order by id for update;

  select coins into bal from public.profiles where id = uid;
  if bal < l.price then raise exception 'Il te manque % pièces', l.price - bal; end if;

  update public.profiles set coins = coins - l.price where id = uid;
  update public.profiles set coins = coins + (l.price - v_tax) where id = l.seller_id;
  perform private.give_cards(uid, l.colorway_id, l.rarity, 1);

  update public.market_listings set status = 'sold', buyer_id = uid, closed_at = now(), tax = v_tax where id = p_id;

  insert into public.transactions (user_id, kind, coins_delta, details) values
    (uid,         'market_buy',  -l.price,       jsonb_build_object('listing', p_id, 'colorway_id', l.colorway_id, 'rarity', l.rarity)),
    (l.seller_id, 'market_sale',  l.price - v_tax, jsonb_build_object('listing', p_id, 'colorway_id', l.colorway_id, 'rarity', l.rarity,
                                                                   'price', l.price, 'tax', v_tax));

  return jsonb_build_object('colorway_id', l.colorway_id, 'rarity', l.rarity, 'price', l.price);
end;
$$;

-- Ventes terminées pas encore vues : `price` = prix de vente, `received` = pièces réellement reçues (après taxe).
create or replace function public.market_ack_sales()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  sold jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  with done as (
    update public.market_listings set seen_by_seller = true
     where seller_id = uid and status = 'sold' and not seen_by_seller
    returning id, colorway_id, rarity, price, tax
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'colorway_id', colorway_id, 'rarity', rarity,
                                               'price', price, 'tax', tax, 'received', price - tax)), '[]'::jsonb)
    into sold from done;
  return sold;
end;
$$;

revoke execute on function public.market_buy(bigint, integer) from public, anon;
revoke execute on function public.market_ack_sales()           from public, anon;
grant  execute on function public.market_buy(bigint, integer)  to authenticated;
grant  execute on function public.market_ack_sales()           to authenticated;
