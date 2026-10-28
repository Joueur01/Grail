-- Grail — migration 0014 : page de profil (soi-même ET amis). Voir CLAUDE.md, section 14 bis.
-- À exécuter APRÈS la 0013 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- 1. profiles.avatar_body : le choix Garçon / Fille de l'avatar 3D, enregistré sur le serveur
--    pour que les amis voient le bon avatar (avant : gardé seulement dans le navigateur).
-- 2. set_avatar_body(p_body) : change ce choix.
-- 3. get_player_profile(p_player) : tout ce que montre la page de profil, pour soi-même
--    (p_player = null) ou pour un AMI accepté. Lecture seule ; rien n'est calculé par le site.
--    Ce qu'un ami NE voit PAS : le solde de pièces (renvoyé à null).

-- ============================================================
-- 1. Choix de l'avatar
-- ============================================================
alter table public.profiles add column if not exists avatar_body text not null default 'homme';
alter table public.profiles drop constraint if exists profiles_avatar_body_check;
alter table public.profiles add constraint profiles_avatar_body_check check (avatar_body in ('homme', 'femme'));

create or replace function public.set_avatar_body(p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if p_body is null or p_body not in ('homme', 'femme') then raise exception 'Avatar inconnu'; end if;
  update public.profiles set avatar_body = p_body where id = uid;
end;
$$;

-- ============================================================
-- 2. Le profil d'un joueur
-- ============================================================
-- Rang d'une rareté (pour trier la vitrine : la plus rare d'abord).
create or replace function private.rarity_rank(p_rarity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_rarity when 'legendaire' then 4 when 'epique' then 3 when 'rare' then 2 else 1 end
$$;

create or replace function public.get_player_profile(p_player uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  target  uuid;
  is_self boolean;
  p       public.profiles%rowtype;
  today   date := (now() at time zone 'Europe/Paris')::date;
  streak  integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  target := coalesce(p_player, uid);
  is_self := target = uid;

  -- Seul un AMI accepté peut lire le profil d'un autre joueur.
  if not is_self and not exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester = uid and addressee = target) or (requester = target and addressee = uid))
  ) then
    raise exception 'Ce joueur n''est pas ton ami';
  end if;

  select * into p from public.profiles where id = target;
  if not found then raise exception 'Profil introuvable'; end if;

  -- Série du Videur : comme get_videur_night (aujourd'hui si le Bar est déjà passé, sinon jusqu'à hier).
  streak := case when exists (select 1 from public.videur_attempts
                               where user_id = target and day = today and door = 'bar' and passed)
                 then private.videur_streak(target, today) else private.videur_streak(target, today - 1) end;

  return jsonb_build_object(
    'is_self', is_self,
    'pseudo', p.pseudo,
    'member_since', p.created_at,
    'avatar_body', p.avatar_body,
    -- Tenue portée ET encore possédée : { emplacement: "coloris|rareté" }
    'equipped', (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each_text(coalesce(p.equipped, '{}'::jsonb)) e
       where exists (select 1 from public.inventory i
                      where i.user_id = target and i.count > 0
                        and i.colorway_id = split_part(e.value, '|', 1)
                        and i.rarity::text = split_part(e.value, '|', 2))
    ),
    -- Collection : cartes différentes (coloris + rareté), exemplaires, et détail par rareté
    'cards_owned', (select count(*) from public.inventory where user_id = target and count > 0),
    'cards_total', (select count(*) * 4 from public.colorways),
    'copies', (select coalesce(sum(count), 0) from public.inventory where user_id = target and count > 0),
    'by_rarity', (
      select jsonb_build_object(
        'commun',     count(*) filter (where rarity::text = 'commun'),
        'rare',       count(*) filter (where rarity::text = 'rare'),
        'epique',     count(*) filter (where rarity::text = 'epique'),
        'legendaire', count(*) filter (where rarity::text = 'legendaire'))
        from public.inventory where user_id = target and count > 0
    ),
    -- Vitrine : les 3 cartes les plus rares (puis les plus nombreuses), choisies par le serveur
    'showcase', (
      select coalesce(jsonb_agg(jsonb_build_object('colorway_id', s.colorway_id, 'rarity', s.rarity, 'count', s.count)
                                order by s.rank desc, s.count desc, s.colorway_id), '[]'::jsonb)
        from (select colorway_id, rarity::text as rarity, count, private.rarity_rank(rarity::text) as rank
                from public.inventory
               where user_id = target and count > 0
               order by private.rarity_rank(rarity::text) desc, count desc, colorway_id
               limit 3) s
    ),
    'boosters_opened', (select count(*) from public.transactions where user_id = target and kind = 'booster'),
    'friends', (select count(*) from public.friendships
                 where status = 'accepted' and (requester = target or addressee = target)),
    'flow', p.flow,
    'videur_streak', streak,
    -- Le solde de pièces reste privé : visible seulement par le joueur lui-même.
    'coins', case when is_self then p.coins else null end
  );
end;
$$;

-- ============================================================
-- 3. Droits : seuls les joueurs connectés appellent ces fonctions.
-- ============================================================
revoke execute on function private.rarity_rank(text)            from public, anon, authenticated;
revoke execute on function public.set_avatar_body(text)        from public, anon;
revoke execute on function public.get_player_profile(uuid)     from public, anon;
grant  execute on function public.set_avatar_body(text)        to authenticated;
grant  execute on function public.get_player_profile(uuid)     to authenticated;
