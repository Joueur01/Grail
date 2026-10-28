-- Grail — migration 0019 : la tenue partagée par lien s'affiche en 3D, sur le bon avatar (Garçon / Fille),
-- avec la date du partage. Voir CLAUDE.md, section 13 bis.
-- À exécuter APRÈS la 0014 (colonne profiles.avatar_body) et la 0010. Peut être relancée sans risque.
--
-- 1. outfit_shares.avatar_body : l'avatar du joueur AU MOMENT du partage (la copie reste figée, comme la tenue).
-- 2. create_outfit_share() : enregistre aussi l'avatar. Même tenue ET même avatar = même lien (changer
--    Garçon / Fille donne un nouveau lien). Quand on retrouve un lien existant, sa date passe à aujourd'hui :
--    la date affichée est celle du DERNIER partage.
-- 3. get_shared_outfit() : renvoie aussi avatar_body (created_at, la date, était déjà renvoyé). Compteur de
--    visites de la 0010 conservé. Toujours appelable sans compte.
-- Les liens créés avant cette migration s'affichent avec l'avatar Garçon (valeur par défaut).

alter table public.outfit_shares add column if not exists avatar_body text not null default 'homme';
alter table public.outfit_shares drop constraint if exists outfit_shares_avatar_body_check;
alter table public.outfit_shares add constraint outfit_shares_avatar_body_check check (avatar_body in ('homme', 'femme'));

create or replace function public.create_outfit_share()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  eq   jsonb;
  body text;
  tok  text;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select equipped, avatar_body into eq, body from public.profiles where id = uid;
  if eq is null or eq = '{}'::jsonb then
    raise exception 'Porte au moins une pièce pour partager ta tenue';
  end if;

  -- Même tenue et même avatar : on retrouve le lien, et sa date devient celle d'aujourd'hui.
  select token into tok from public.outfit_shares
   where user_id = uid and equipped = eq and avatar_body = body
   order by created_at desc limit 1;
  if tok is not null then
    update public.outfit_shares set created_at = now() where token = tok;
    return tok;
  end if;

  tok := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  insert into public.outfit_shares (token, user_id, equipped, avatar_body) values (tok, uid, eq, body);

  delete from public.outfit_shares
   where user_id = uid
     and token not in (select token from public.outfit_shares where user_id = uid order by created_at desc limit 50);
  return tok;
end;
$$;

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
  return jsonb_build_object('equipped', s.equipped, 'avatar_body', s.avatar_body, 'created_at', s.created_at);
end;
$$;

revoke execute on function public.create_outfit_share()   from public, anon;
grant  execute on function public.create_outfit_share()   to authenticated;
revoke execute on function public.get_shared_outfit(text) from public;
grant  execute on function public.get_shared_outfit(text) to anon, authenticated;
