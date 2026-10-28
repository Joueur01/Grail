-- Grail — migration 0009 : historique des achats et ventes du Market d'un joueur.
-- À exécuter APRÈS la 0008 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Les achats et les ventes sont DÉJÀ enregistrés dans `transactions` (kind 'market_buy' / 'market_sale',
-- écrits par market_buy). Cette fonction les relit pour le joueur connecté, sans rien écrire.
-- Elle n'expose PAS l'autre joueur (ni pseudo, ni identifiant) : seulement la carte, le prix et la date.
--
-- market_history(p_limit, p_before) :
--   p_limit  : nombre de lignes (1 à 100, 30 par défaut) ;
--   p_before : id de la dernière ligne déjà reçue, pour charger les plus anciennes (« Voir plus »).
-- Renvoie { items: [{ id, kind, coins, colorway_id, rarity, created_at }], has_more, total_spent, total_earned }.

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
           details ->> 'colorway_id' as colorway_id, details ->> 'rarity' as rarity, created_at
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

revoke execute on function public.market_history(integer, bigint) from public, anon;
grant  execute on function public.market_history(integer, bigint) to authenticated;
