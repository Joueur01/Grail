-- Grail — migration 0017 : aperçu de la tenue et de la vitrine de chaque ami dans la liste d'amis.
-- Voir CLAUDE.md, section 14. À exécuter APRÈS la 0015 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- list_friends_preview() : pour CHAQUE ami accepté, en un seul appel : son avatar (Garçon / Fille),
-- sa tenue du moment (pièces portées ET encore possédées) et les cartes de sa vitrine (encore possédées).
-- Même visibilité que get_player_profile (un ami voit ces infos), mais sans le détail ni le solde de pièces.
-- Lecture seule ; rien n'est calculé par le site.

create or replace function public.list_friends_preview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'friend_id', o.id,
             'avatar_body', o.avatar_body,
             'equipped', (
               select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                 from jsonb_each_text(coalesce(o.equipped, '{}'::jsonb)) e
                where exists (select 1 from public.inventory i
                               where i.user_id = o.id and i.count > 0
                                 and i.colorway_id = split_part(e.value, '|', 1)
                                 and i.rarity::text = split_part(e.value, '|', 2))
             ),
             'showcase', (
               select coalesce(jsonb_agg(jsonb_build_object('colorway_id', i.colorway_id, 'rarity', i.rarity::text)
                                         order by s.pos), '[]'::jsonb)
                 from jsonb_array_elements_text(coalesce(o.showcase, '[]'::jsonb)) with ordinality as s(card, pos)
                 join public.inventory i on i.user_id = o.id and i.count > 0
                                        and i.colorway_id = split_part(s.card, '|', 1)
                                        and i.rarity::text = split_part(s.card, '|', 2)
             )
           ) order by lower(o.pseudo))
      from public.friendships f
      join public.profiles o on o.id = case when f.requester = uid then f.addressee else f.requester end
     where f.status = 'accepted' and uid in (f.requester, f.addressee)
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.list_friends_preview() from public, anon;
grant  execute on function public.list_friends_preview() to authenticated;
