-- Grail — migration 0015 : vitrine CHOISIE par le joueur (page de profil). Voir CLAUDE.md, section 14 bis.
-- À exécuter APRÈS la 0014 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Avant : la vitrine montrait automatiquement les 3 cartes les plus rares.
-- Maintenant : elle est VIDE au départ ; le joueur choisit quelles cartes y mettre, combien
-- (jusqu'à economy_config.PROFILE.showcaseMax, 6 par défaut) et dans quel ordre.
--
-- 1. profiles.showcase : liste ordonnée de cartes "coloris|rareté".
-- 2. set_showcase(p_cards) : remplace la vitrine (vérifie le nombre, les doublons et que chaque carte est possédée).
-- 3. get_player_profile : renvoie la vitrine choisie (cartes encore possédées) + le maximum.

-- ============================================================
-- 1. Réglage et colonne
-- ============================================================
update public.economy_config
   set config = config || jsonb_build_object('PROFILE', jsonb_build_object('showcaseMax', 6)),
       updated_at = now()
 where id = 1 and not (config ? 'PROFILE');

alter table public.profiles add column if not exists showcase jsonb not null default '[]'::jsonb;

-- Nombre maximum de cartes dans la vitrine (réglage du serveur).
create or replace function private.showcase_max()
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((select (config #>> '{PROFILE,showcaseMax}')::integer from public.economy_config where id = 1), 6)
$$;

-- ============================================================
-- 2. Choisir sa vitrine
-- ============================================================
-- p_cards : tableau JSON de "coloris|rareté", dans l'ordre d'affichage. [] vide la vitrine.
create or replace function public.set_showcase(p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  maxn integer := private.showcase_max();
  n    integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if p_cards is null or jsonb_typeof(p_cards) <> 'array' then raise exception 'Vitrine invalide'; end if;
  if exists (select 1 from jsonb_array_elements(p_cards) e where jsonb_typeof(e) <> 'string') then
    raise exception 'Vitrine invalide';
  end if;

  n := jsonb_array_length(p_cards);
  if n > maxn then raise exception 'Ta vitrine ne peut pas contenir plus de % cartes', maxn; end if;
  if (select count(distinct e) from jsonb_array_elements_text(p_cards) e) <> n then
    raise exception 'Cette carte est déjà dans ta vitrine';
  end if;
  -- Chaque carte doit être possédée (au moins un exemplaire).
  if exists (
    select 1 from jsonb_array_elements_text(p_cards) e
     where not exists (select 1 from public.inventory i
                        where i.user_id = uid and i.count > 0
                          and i.colorway_id = split_part(e, '|', 1)
                          and i.rarity::text = split_part(e, '|', 2))
  ) then
    raise exception 'Tu ne possèdes pas cette carte';
  end if;

  update public.profiles set showcase = p_cards where id = uid;
  return p_cards;
end;
$$;

-- ============================================================
-- 3. Le profil renvoie la vitrine choisie (remplace la version de la 0014)
-- ============================================================
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
    -- Vitrine CHOISIE par le joueur (vide au départ), dans son ordre ; seules les cartes encore
    -- possédées sont renvoyées (une carte vendue ou misée disparaît d'elle-même de la vitrine).
    'showcase', (
      select coalesce(jsonb_agg(jsonb_build_object('colorway_id', i.colorway_id, 'rarity', i.rarity::text, 'count', i.count)
                                order by s.pos), '[]'::jsonb)
        from jsonb_array_elements_text(coalesce(p.showcase, '[]'::jsonb)) with ordinality as s(card, pos)
        join public.inventory i on i.user_id = target and i.count > 0
                               and i.colorway_id = split_part(s.card, '|', 1)
                               and i.rarity::text = split_part(s.card, '|', 2)
    ),
    'showcase_max', private.showcase_max(),
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
-- 4. Droits : seuls les joueurs connectés appellent ces fonctions.
-- ============================================================
revoke execute on function private.showcase_max()               from public, anon, authenticated;
revoke execute on function public.set_showcase(jsonb)          from public, anon;
revoke execute on function public.get_player_profile(uuid)     from public, anon;
grant  execute on function public.set_showcase(jsonb)          to authenticated;
grant  execute on function public.get_player_profile(uuid)     to authenticated;
