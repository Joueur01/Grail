-- Grail — migration 0018 : une carte utilisée (portée ou en vitrine) qui quitte la collection en est RETIRÉE.
-- Voir CLAUDE.md, sections 7 et 14 bis. À exécuter APRÈS la 0015 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Problème : quand le DERNIER exemplaire d'une carte quitte l'inventaire (mise en vente, vente, défausse,
-- carte misée à la roue), les écrans ne l'affichent plus, mais la tenue (profiles.equipped) et la vitrine
-- (profiles.showcase) gardaient la référence : la carte réapparaissait toute seule si elle revenait
-- (offre retirée du Market) et restait dans les données (lien de partage, statistiques).
--
-- Correctif : un déclencheur sur public.inventory. Dès qu'une carte tombe à 0 exemplaire (ou que sa ligne
-- est supprimée), elle est retirée de la tenue et de la vitrine de CE joueur. Il agit au niveau de la table :
-- il couvre market_list, market_buy, discard_cards, upgrade_cards et toute fonction future, sans les modifier.
-- Tant qu'il reste au moins un exemplaire (ex. 3 → 2), rien ne change.
-- Un lien de partage déjà créé reste une COPIE figée de la tenue du moment (voir 0008) : il n'est pas modifié.

create or replace function private.release_card_from_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  k   text;
begin
  if tg_op = 'DELETE' then
    uid := old.user_id;
    k := old.colorway_id || '|' || old.rarity::text;
  else
    -- Exemplaires restants : on ne fait rien tant qu'il en reste.
    if new.count > 0 then return null; end if;
    uid := new.user_id;
    k := new.colorway_id || '|' || new.rarity::text;
  end if;

  update public.profiles p
     set equipped = coalesce((select jsonb_object_agg(e.key, e.value)
                                from jsonb_each_text(p.equipped) e
                               where e.value <> k), '{}'::jsonb),
         showcase = coalesce((select jsonb_agg(s.card order by s.pos)
                                from jsonb_array_elements_text(p.showcase) with ordinality as s(card, pos)
                               where s.card <> k), '[]'::jsonb)
   where p.id = uid
     and (p.showcase ? k
          or exists (select 1 from jsonb_each_text(p.equipped) e where e.value = k));
  return null;
end;
$$;

revoke execute on function private.release_card_from_use() from public, anon, authenticated;

drop trigger if exists inventory_release_card_upd on public.inventory;
create trigger inventory_release_card_upd
  after update of count on public.inventory
  for each row
  when (new.count <= 0 and old.count > 0)
  execute function private.release_card_from_use();

drop trigger if exists inventory_release_card_del on public.inventory;
create trigger inventory_release_card_del
  after delete on public.inventory
  for each row
  execute function private.release_card_from_use();

-- Nettoyage UNE FOIS des données existantes : tout ce qui est déjà porté ou en vitrine sans être possédé.
update public.profiles p
   set equipped = coalesce((select jsonb_object_agg(e.key, e.value)
                              from jsonb_each_text(p.equipped) e
                             where exists (select 1 from public.inventory i
                                            where i.user_id = p.id and i.count > 0
                                              and i.colorway_id = split_part(e.value, '|', 1)
                                              and i.rarity::text = split_part(e.value, '|', 2))), '{}'::jsonb),
       showcase = coalesce((select jsonb_agg(s.card order by s.pos)
                              from jsonb_array_elements_text(p.showcase) with ordinality as s(card, pos)
                             where exists (select 1 from public.inventory i
                                            where i.user_id = p.id and i.count > 0
                                              and i.colorway_id = split_part(s.card, '|', 1)
                                              and i.rarity::text = split_part(s.card, '|', 2))), '[]'::jsonb)
 where p.equipped <> '{}'::jsonb or p.showcase <> '[]'::jsonb;
