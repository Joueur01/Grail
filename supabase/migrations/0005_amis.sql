-- Grail — migration 0005 : amis (pseudo, demandes, liste, profil d'un ami).
-- À exécuter dans Supabase (SQL Editor). N'écrit rien dans les migrations 0001 à 0004.
-- Principe habituel : le site LIT via des fonctions et n'écrit jamais directement.

-- ============================================================
-- 1. Pseudo libre (validé par le serveur), jamais listé publiquement
-- ============================================================
alter table public.profiles add column if not exists pseudo text;
alter table public.profiles add column if not exists pseudo_changed_at timestamptz;

alter table public.profiles drop constraint if exists profiles_pseudo_format;
alter table public.profiles add constraint profiles_pseudo_format
  check (pseudo is null or pseudo ~ '^[A-Za-z0-9_]{3,16}$');

-- Unique sans tenir compte des majuscules (« Pigeon » = « pigeon »).
create unique index if not exists profiles_pseudo_unique on public.profiles (lower(pseudo));

-- Mots interdits dans un pseudo (comparés sans majuscules, sans « _ », chiffres lookalike → lettres).
-- La liste est à COMPLÉTER par toi : insert into public.blocked_words (word) values ('mot');
create table if not exists public.blocked_words (
  word text primary key check (word = lower(word))
);
alter table public.blocked_words enable row level security;
revoke all on public.blocked_words from anon, authenticated;
insert into public.blocked_words (word) values ('admin'), ('grail'), ('modo'), ('moderateur'), ('support'), ('staff')
on conflict do nothing;

-- ============================================================
-- 2. Amitiés (illisibles directement : tout passe par les fonctions)
-- ============================================================
create table if not exists public.friendships (
  id         bigint generated always as identity primary key,
  requester  uuid not null references public.profiles (id) on delete cascade,
  addressee  uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
-- Une seule relation par paire de joueurs, dans les deux sens.
create unique index if not exists friendships_pair
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee, status);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon, authenticated;

-- Limites (modifiables sans redéployer, comme le reste de l'économie).
update public.economy_config
   set config = config || jsonb_build_object('FRIENDS', jsonb_build_object('maxFriends', 50, 'maxPendingSent', 20)),
       updated_at = now()
 where id = 1;

-- ============================================================
-- 3. Fonctions
-- ============================================================
create or replace function private.friend_count(p_uid uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.friendships
   where status = 'accepted' and p_uid in (requester, addressee)
$$;

-- Choisir ou changer son pseudo (changement possible une fois par semaine).
create or replace function public.set_pseudo(p_pseudo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  p     text := btrim(p_pseudo);
  norm  text;
  cur   text;
  last  timestamptz;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if p is null or p !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Pseudo invalide : 3 à 16 caractères, lettres, chiffres ou _';
  end if;

  norm := translate(replace(lower(p), '_', ''), '013457', 'oieast');
  if exists (select 1 from public.blocked_words w where norm like '%' || w.word || '%') then
    raise exception 'Ce pseudo n''est pas autorisé';
  end if;

  select pseudo, pseudo_changed_at into cur, last from public.profiles where id = uid for update;
  if cur is not null and cur = p then return; end if;
  if last is not null and last > now() - interval '7 days' then
    raise exception 'Tu pourras changer de pseudo dans quelques jours';
  end if;

  begin
    update public.profiles set pseudo = p, pseudo_changed_at = now() where id = uid;
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris';
  end;
end;
$$;

-- Envoyer une demande d'ami (recherche par pseudo EXACT : il n'existe aucune liste publique).
-- Renvoie 'pending', ou 'accepted' si l'autre joueur t'avait déjà invité.
create or replace function public.friend_request(p_pseudo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  cfg        jsonb := private.cfg() -> 'FRIENDS';
  max_f      integer := (cfg ->> 'maxFriends')::integer;
  max_p      integer := (cfg ->> 'maxPendingSent')::integer;
  mine       text;
  target     uuid;
  f          public.friendships%rowtype;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select pseudo into mine from public.profiles where id = uid;
  if mine is null then raise exception 'Choisis d''abord ton pseudo'; end if;

  select id into target from public.profiles where lower(pseudo) = lower(btrim(p_pseudo));
  if target is null then raise exception 'Aucun joueur avec ce pseudo'; end if;
  if target = uid then raise exception 'Tu ne peux pas t''ajouter toi-même'; end if;

  select * into f from public.friendships
   where least(requester, addressee) = least(uid, target)
     and greatest(requester, addressee) = greatest(uid, target)
     for update;

  if found then
    if f.status = 'accepted' then raise exception 'Vous êtes déjà amis'; end if;
    if f.requester = uid then raise exception 'Demande déjà envoyée'; end if;
    -- L'autre joueur m'avait déjà invité : on devient amis.
    if private.friend_count(uid) >= max_f or private.friend_count(target) >= max_f then
      raise exception 'Limite de % amis atteinte', max_f;
    end if;
    update public.friendships set status = 'accepted' where id = f.id;
    return 'accepted';
  end if;

  if private.friend_count(uid) >= max_f then raise exception 'Limite de % amis atteinte', max_f; end if;
  if (select count(*) from public.friendships where requester = uid and status = 'pending') >= max_p then
    raise exception 'Trop de demandes en attente (maximum %)', max_p;
  end if;

  insert into public.friendships (requester, addressee) values (uid, target);
  return 'pending';
end;
$$;

-- Accepter ou refuser une demande reçue.
create or replace function public.friend_respond(p_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  max_f integer := (private.cfg() -> 'FRIENDS' ->> 'maxFriends')::integer;
  f     public.friendships%rowtype;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select * into f from public.friendships where id = p_id for update;
  if not found or f.addressee <> uid or f.status <> 'pending' then
    raise exception 'Demande introuvable';
  end if;

  if p_accept then
    if private.friend_count(uid) >= max_f or private.friend_count(f.requester) >= max_f then
      raise exception 'Limite de % amis atteinte', max_f;
    end if;
    update public.friendships set status = 'accepted' where id = p_id;
  else
    delete from public.friendships where id = p_id;
  end if;
end;
$$;

-- Annuler une demande envoyée, ou retirer un ami (les deux joueurs peuvent le faire).
create or replace function public.friend_remove(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare done integer;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  delete from public.friendships where id = p_id and auth.uid() in (requester, addressee);
  get diagnostics done = row_count;
  if done = 0 then raise exception 'Ami introuvable'; end if;
end;
$$;

-- Mon pseudo, mes amis, les demandes reçues et envoyées.
create or replace function public.list_friends()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  return jsonb_build_object(
    'pseudo', (select pseudo from public.profiles where id = uid),
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'friend_id', o.id, 'pseudo', o.pseudo) order by lower(o.pseudo))
        from public.friendships f
        join public.profiles o on o.id = case when f.requester = uid then f.addressee else f.requester end
       where f.status = 'accepted' and uid in (f.requester, f.addressee)
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'pseudo', o.pseudo) order by f.created_at)
        from public.friendships f join public.profiles o on o.id = f.requester
       where f.status = 'pending' and f.addressee = uid
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'pseudo', o.pseudo) order by f.created_at)
        from public.friendships f join public.profiles o on o.id = f.addressee
       where f.status = 'pending' and f.requester = uid
    ), '[]'::jsonb)
  );
end;
$$;

-- Ce qu'un AMI peut voir de toi : pseudo, tenue du moment et progression de collection. Rien d'autre
-- (ni pièces, ni inventaire détaillé, ni ventes).
create or replace function public.get_friend_profile(p_friend uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p   public.profiles%rowtype;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  if not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester = uid and addressee = p_friend) or (requester = p_friend and addressee = uid))
  ) then
    raise exception 'Ce joueur n''est pas ton ami';
  end if;

  select * into p from public.profiles where id = p_friend;
  return jsonb_build_object(
    'pseudo', p.pseudo,
    'equipped', p.equipped,
    'cards_owned', (select count(*) from public.inventory where user_id = p_friend),
    'cards_total', (select count(*) * 4 from public.colorways)
  );
end;
$$;

-- ============================================================
-- 4. Droits : seuls les joueurs connectés appellent ces fonctions.
-- ============================================================
revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function public.set_pseudo(text)                   from public, anon;
revoke execute on function public.friend_request(text)               from public, anon;
revoke execute on function public.friend_respond(bigint, boolean)   from public, anon;
revoke execute on function public.friend_remove(bigint)              from public, anon;
revoke execute on function public.list_friends()                     from public, anon;
revoke execute on function public.get_friend_profile(uuid)           from public, anon;
grant  execute on function public.set_pseudo(text)                   to authenticated;
grant  execute on function public.friend_request(text)               to authenticated;
grant  execute on function public.friend_respond(bigint, boolean)    to authenticated;
grant  execute on function public.friend_remove(bigint)              to authenticated;
grant  execute on function public.list_friends()                     to authenticated;
grant  execute on function public.get_friend_profile(uuid)           to authenticated;
