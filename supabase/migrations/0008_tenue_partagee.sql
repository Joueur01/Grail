-- Grail — migration 0008 : lien public vers une tenue (visible sans compte).
-- À exécuter APRÈS la 0007 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Principe : « Partager ma tenue » enregistre une COPIE de la tenue du moment (les pièces portées)
-- sous un code secret aléatoire (20 caractères, impossible à deviner). N'importe qui ayant le lien
-- voit cette tenue, connecté ou non. Rien d'autre n'est exposé : ni pseudo, ni pièces, ni inventaire.
-- La copie ne bouge plus : si le joueur change de tenue, il partage un nouveau lien.

create table if not exists public.outfit_shares (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  equipped   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists outfit_shares_user_idx on public.outfit_shares (user_id, created_at desc);

-- Illisible directement : tout passe par les fonctions ci-dessous.
alter table public.outfit_shares enable row level security;
revoke all on public.outfit_shares from anon, authenticated;

-- Crée (ou retrouve) le lien de la tenue portée. Renvoie le code.
-- Même tenue = même lien (pas de doublons). On garde les 50 liens les plus récents de chaque joueur.
create or replace function public.create_outfit_share()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  eq  jsonb;
  tok text;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select equipped into eq from public.profiles where id = uid;
  if eq is null or eq = '{}'::jsonb then
    raise exception 'Porte au moins une pièce pour partager ta tenue';
  end if;

  select token into tok from public.outfit_shares
   where user_id = uid and equipped = eq
   order by created_at desc limit 1;
  if tok is not null then return tok; end if;

  tok := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  insert into public.outfit_shares (token, user_id, equipped) values (tok, uid, eq);

  delete from public.outfit_shares
   where user_id = uid
     and token not in (select token from public.outfit_shares where user_id = uid order by created_at desc limit 50);
  return tok;
end;
$$;

-- Lecture publique d'une tenue partagée (appelable SANS être connecté).
create or replace function public.get_shared_outfit(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare s public.outfit_shares%rowtype;
begin
  select * into s from public.outfit_shares where token = p_token;
  if not found then raise exception 'Ce lien de tenue n''existe pas ou n''est plus valide'; end if;
  return jsonb_build_object('equipped', s.equipped, 'created_at', s.created_at);
end;
$$;

revoke execute on function public.create_outfit_share()        from public, anon;
grant  execute on function public.create_outfit_share()        to authenticated;
revoke execute on function public.get_shared_outfit(text)      from public;
grant  execute on function public.get_shared_outfit(text)      to anon, authenticated;
