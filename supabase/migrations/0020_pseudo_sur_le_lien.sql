-- Grail — migration 0020 : le pseudo de la personne qui partage sa tenue s'affiche sur la page du lien.
-- Voir CLAUDE.md, sections 9 et 13 bis. À exécuter APRÈS la 0019 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- DÉCISION DU DÉVELOPPEUR : jusqu'ici le pseudo n'apparaissait jamais publiquement. Désormais, quiconque
-- ouvre le lien d'une tenue partagée (connecté ou non) voit le pseudo de son auteur. Rien d'autre n'est exposé
-- (ni e-mail, ni pièces, ni inventaire, ni amis). Le lien reste secret (20 caractères) et n'est donné
-- que par le joueur lui-même quand il touche « Partager ma tenue ».
--
-- Le pseudo est LU EN DIRECT dans le profil (il n'est pas copié avec la tenue) : si le joueur change de pseudo
-- (une fois tous les 30 jours), ses liens affichent le nouveau ; si le compte est supprimé, ses liens disparaissent.
-- Pas encore de pseudo choisi : aucun nom n'est affiché.

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
  return jsonb_build_object(
    'equipped', s.equipped,
    'avatar_body', s.avatar_body,
    'created_at', s.created_at,
    'pseudo', (select p.pseudo from public.profiles p where p.id = s.user_id)
  );
end;
$$;

revoke execute on function public.get_shared_outfit(text) from public;
grant  execute on function public.get_shared_outfit(text) to anon, authenticated;
