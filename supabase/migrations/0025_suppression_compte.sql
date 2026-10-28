-- Grail — migration 0025 : suppression de son propre compte. Voir CLAUDE.md, section 17 (confidentialité).
-- À exécuter APRÈS la 0024 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- delete_my_account('SUPPRIMER') : efface DÉFINITIVEMENT le compte du joueur connecté et toutes ses données
-- (profil, cartes, pièces, album, tenue, vitrine, amis, ventes, liens de tenue partagés, statistiques d'usage,
-- puis le compte de connexion lui-même dans auth.users). Irréversible.
--
-- Les migrations 0001 à 0004 ne sont pas dans le dépôt : on ne connaît pas toutes les tables ni tous leurs
-- liens. La fonction nettoie donc d'abord, dans TOUTES les tables du schéma public, les lignes dont une colonne
-- « propriétaire » de type uuid (user_id, player_id, seller_id, buyer_id, owner_id, requester, addressee)
-- vaut le joueur ; puis elle supprime le profil et le compte. Si une dernière contrainte bloque encore,
-- RIEN n'est supprimé (tout est annulé) et le joueur voit un message d'erreur.
--
-- Sécurité : réservée aux joueurs connectés, et seulement pour LEUR compte (auth.uid()) ; le mot de
-- confirmation évite un appel accidentel.

create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t   record;
  n   integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if p_confirm is distinct from 'SUPPRIMER' then raise exception 'Confirmation invalide'; end if;

  -- Trois passes : une ligne peut en bloquer une autre (liens entre tables) ; chaque suppression qui échoue
  -- est simplement retentée à la passe suivante.
  for n in 1..3 loop
    for t in
      select c.table_name, c.column_name
        from information_schema.columns c
        join information_schema.tables tb
          on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
       where c.table_schema = 'public'
         and c.data_type = 'uuid'
         and c.column_name in ('user_id', 'player_id', 'seller_id', 'buyer_id', 'owner_id', 'requester', 'addressee')
       order by c.table_name, c.column_name
    loop
      begin
        -- Un achat de ce joueur reste dans l'historique du vendeur, sans l'acheteur (si la colonne l'accepte).
        if t.column_name = 'buyer_id' then
          begin
            execute format('update public.%I set %I = null where %I = $1', t.table_name, t.column_name, t.column_name) using uid;
          exception when others then null;
          end;
        end if;
        execute format('delete from public.%I where %I = $1', t.table_name, t.column_name) using uid;
      exception when others then null;
      end;
    end loop;
  end loop;

  begin
    delete from public.profiles where id = uid;
    delete from auth.users where id = uid;
  exception when others then
    raise exception 'Impossible de supprimer le compte pour le moment. Réessaie plus tard.';
  end;
end;
$$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant  execute on function public.delete_my_account(text) to authenticated;
