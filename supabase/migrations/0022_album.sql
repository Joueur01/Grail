-- Grail — migration 0022 : l'ALBUM et les items ULTIMES. Voir CLAUDE.md, section 6 bis.
-- À exécuter APRÈS la 0021 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Règles (décidées par le développeur) :
--   * On commence avec un album vide. Le joueur y place les cartes qu'il veut, UNE SEULE par case
--     (une case = un coloris + une rareté : 75 coloris × 4 raretés = 300 cases).
--   * Une carte placée dans l'album ne peut JAMAIS être retirée. Elle quitte la collection et n'est plus
--     utilisable (ni portée, ni vendue, ni misée, ni défaussée).
--   * Quand un modèle est complet dans l'album (tous ses coloris × toutes ses raretés), le joueur reçoit
--     l'ULTIME de ce modèle : une carte de rareté « ultime » (au-dessus de Légendaire), unique par modèle,
--     ni vendable ni échangeable, mais qui se porte et se met en vitrine.
--
-- Où vivent les Ultimes : dans leur propre table (album_ultimates), PAS dans public.inventory (les tables et
-- fonctions des migrations 0001 à 0004 ne sont pas modifiées : elles ne peuvent donc jamais vendre ni
-- défausser un Ultime). Dans la tenue (profiles.equipped) et la vitrine (profiles.showcase), un Ultime
-- s'écrit "<modèle>_ultime|ultime" (même forme "coloris|rareté" que les autres cartes).
--
-- Contenu :
--   1. tables album_cards et album_ultimates (illisibles directement)
--   2. private.owns_card : le joueur possède-t-il cette carte (inventaire OU Ultime) ?
--   3. get_album, album_add (le serveur décide de tout, y compris l'obtention de l'Ultime)
--   4. set_equipped_ultimate : porter un Ultime
--   5. set_showcase accepte les Ultimes
--   6. get_player_profile et list_friends_preview montrent les Ultimes (tenue, vitrine) et comptent l'album
--   7. Videur : un Ultime porté compte (15 points de rareté, au-dessus de Légendaire = 10)

-- ============================================================
-- 1. Tables
-- ============================================================
create table if not exists public.album_cards (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  colorway_id text not null references public.colorways (id),
  rarity     text not null check (rarity in ('commun', 'rare', 'epique', 'legendaire')),
  added_at   timestamptz not null default now(),
  primary key (user_id, colorway_id, rarity)
);

create table if not exists public.album_ultimates (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  piece_id   text not null references public.pieces (id),
  created_at timestamptz not null default now(),
  primary key (user_id, piece_id)
);

-- Lecture et écriture uniquement par les fonctions ci-dessous (security definer).
alter table public.album_cards enable row level security;
alter table public.album_ultimates enable row level security;
revoke all on public.album_cards, public.album_ultimates from anon, authenticated;

-- ============================================================
-- 2. Possède-t-on cette carte ? ("coloris|rareté", Ultime compris)
-- ============================================================
create or replace function private.owns_card(p_uid uuid, p_key text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when split_part(p_key, '|', 2) = 'ultime' then
      exists (select 1 from public.album_ultimates a
               where a.user_id = p_uid
                 and a.piece_id || '_ultime' = split_part(p_key, '|', 1))
    else
      exists (select 1 from public.inventory i
               where i.user_id = p_uid and i.count > 0
                 and i.colorway_id = split_part(p_key, '|', 1)
                 and i.rarity::text = split_part(p_key, '|', 2))
  end
$$;

revoke execute on function private.owns_card(uuid, text) from public, anon, authenticated;

-- ============================================================
-- 3. Lire l'album, y placer une carte
-- ============================================================
-- → { cards: ["coloris|rareté", …], ultimates: ["modèle", …] }
create or replace function public.get_album()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  return jsonb_build_object(
    'cards', (select coalesce(jsonb_agg(a.colorway_id || '|' || a.rarity order by a.added_at), '[]'::jsonb)
                from public.album_cards a where a.user_id = uid),
    'ultimates', (select coalesce(jsonb_agg(u.piece_id order by u.created_at), '[]'::jsonb)
                    from public.album_ultimates u where u.user_id = uid)
  );
end;
$$;

-- Place UNE carte dans l'album (définitif). Si le modèle est alors complet, l'Ultime est accordé.
-- → { colorway_id, rarity, piece_id, have, total, ultimate_unlocked }
create or replace function public.album_add(p_colorway text, p_rarity text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  n     integer;
  pid   text;
  total integer;
  have  integer;
  unlocked boolean := false;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if p_rarity is null or p_rarity not in ('commun', 'rare', 'epique', 'legendaire') then
    raise exception 'Rareté invalide';
  end if;
  select c.piece_id into pid from public.colorways c where c.id = p_colorway;
  if pid is null then raise exception 'Carte inconnue'; end if;

  if exists (select 1 from public.album_cards a
              where a.user_id = uid and a.colorway_id = p_colorway and a.rarity = p_rarity) then
    raise exception 'Cette carte est déjà dans ton album';
  end if;

  -- Un exemplaire doit être possédé (la ligne est verrouillée le temps de l'opération).
  select i.count into n from public.inventory i
   where i.user_id = uid and i.colorway_id = p_colorway and i.rarity::text = p_rarity
   for update;
  if n is null or n < 1 then raise exception 'Tu ne possèdes pas cette carte'; end if;

  insert into public.album_cards (user_id, colorway_id, rarity) values (uid, p_colorway, p_rarity);

  -- L'exemplaire quitte la collection. (Le déclencheur de la 0018 retire la carte de la tenue et de
  -- la vitrine si c'était le dernier exemplaire.)
  if n = 1 then
    delete from public.inventory i
     where i.user_id = uid and i.colorway_id = p_colorway and i.rarity::text = p_rarity;
  else
    update public.inventory i set count = i.count - 1
     where i.user_id = uid and i.colorway_id = p_colorway and i.rarity::text = p_rarity;
  end if;

  -- Modèle complet ? (tous ses coloris × les 4 raretés)
  total := (select count(*) * 4 from public.colorways c where c.piece_id = pid);
  have  := (select count(*) from public.album_cards a
              join public.colorways c on c.id = a.colorway_id
             where a.user_id = uid and c.piece_id = pid);
  if have >= total then
    insert into public.album_ultimates (user_id, piece_id) values (uid, pid)
    on conflict do nothing;
    unlocked := true;
  end if;

  return jsonb_build_object(
    'colorway_id', p_colorway, 'rarity', p_rarity, 'piece_id', pid,
    'have', have, 'total', total, 'ultimate_unlocked', unlocked);
end;
$$;

revoke execute on function public.get_album() from public, anon;
grant  execute on function public.get_album() to authenticated;
revoke execute on function public.album_add(text, text) from public, anon;
grant  execute on function public.album_add(text, text) to authenticated;

-- ============================================================
-- 4. Porter un Ultime (les autres cartes passent par set_equipped, inchangée)
-- ============================================================
-- p_piece : le modèle ("signal9_shell_relais"). Ne s'applique qu'à son propre emplacement.
create or replace function public.set_equipped_ultimate(p_slot text, p_piece text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pslot text;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select p.slot into pslot from public.pieces p where p.id = p_piece;
  if pslot is null then raise exception 'Carte inconnue'; end if;
  if pslot <> p_slot then raise exception 'Cette pièce ne va pas à cet emplacement'; end if;
  if not exists (select 1 from public.album_ultimates a where a.user_id = uid and a.piece_id = p_piece) then
    raise exception 'Tu ne possèdes pas cet Ultime';
  end if;
  update public.profiles
     set equipped = coalesce(equipped, '{}'::jsonb) || jsonb_build_object(p_slot, p_piece || '_ultime|ultime')
   where id = uid;
  return (select equipped from public.profiles where id = uid);
end;
$$;

revoke execute on function public.set_equipped_ultimate(text, text) from public, anon;
grant  execute on function public.set_equipped_ultimate(text, text) to authenticated;

-- ============================================================
-- 5. La vitrine accepte les Ultimes (remplace la version de la 0015)
-- ============================================================
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
  -- Chaque carte doit être possédée : au moins un exemplaire, ou un Ultime obtenu.
  if exists (select 1 from jsonb_array_elements_text(p_cards) e where not private.owns_card(uid, e)) then
    raise exception 'Tu ne possèdes pas cette carte';
  end if;

  update public.profiles set showcase = p_cards where id = uid;
  return p_cards;
end;
$$;

-- ============================================================
-- 6. Profil et aperçu des amis : Ultimes visibles, album compté
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
    -- Tenue portée ET encore possédée (Ultime compris) : { emplacement: "coloris|rareté" }
    'equipped', (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        from jsonb_each_text(coalesce(p.equipped, '{}'::jsonb)) e
       where private.owns_card(target, e.value)
    ),
    -- Collection : cartes différentes (coloris + rareté), album compris (une carte placée dans l'album
    -- reste « collectée »), exemplaires, et détail par rareté
    'cards_owned', (select count(*) from (
                      select colorway_id, rarity::text from public.inventory where user_id = target and count > 0
                      union
                      select colorway_id, rarity from public.album_cards where user_id = target) u),
    'cards_total', (select count(*) * 4 from public.colorways),
    'copies', (select coalesce(sum(count), 0) from public.inventory where user_id = target and count > 0)
              + (select count(*) from public.album_cards where user_id = target),
    'by_rarity', (
      select jsonb_build_object(
        'commun',     count(*) filter (where rarity = 'commun'),
        'rare',       count(*) filter (where rarity = 'rare'),
        'epique',     count(*) filter (where rarity = 'epique'),
        'legendaire', count(*) filter (where rarity = 'legendaire'))
        from (select colorway_id, rarity::text as rarity from public.inventory where user_id = target and count > 0
              union
              select colorway_id, rarity from public.album_cards where user_id = target) u
    ),
    -- Album : cartes placées et Ultimes obtenus
    'album_cards', (select count(*) from public.album_cards where user_id = target),
    'ultimates', (select count(*) from public.album_ultimates where user_id = target),
    -- Vitrine CHOISIE par le joueur (vide au départ), dans son ordre ; seules les cartes encore
    -- possédées sont renvoyées (une carte vendue ou misée disparaît d'elle-même de la vitrine).
    'showcase', (
      select coalesce(jsonb_agg(jsonb_build_object(
                        'colorway_id', split_part(s.card, '|', 1),
                        'rarity', split_part(s.card, '|', 2),
                        'count', coalesce((select i.count from public.inventory i
                                            where i.user_id = target
                                              and i.colorway_id = split_part(s.card, '|', 1)
                                              and i.rarity::text = split_part(s.card, '|', 2)), 1))
                                order by s.pos), '[]'::jsonb)
        from jsonb_array_elements_text(coalesce(p.showcase, '[]'::jsonb)) with ordinality as s(card, pos)
       where private.owns_card(target, s.card)
    ),
    'showcase_max', private.showcase_max(),
    'boosters_opened', (select count(*) from public.transactions where user_id = target and kind = 'booster'),
    'friends', (select count(*) from public.friendships
                 where status = 'accepted' and (requester = target or addressee = target)),
    -- Réputation : niveau, Flow accumulé vers le niveau suivant (flow) et Flow demandé pour l'atteindre (rep_next)
    'flow', p.flow,
    'rep_level', p.rep_level,
    'rep_next', p.rep_next,
    'videur_streak', streak,
    -- Le solde de pièces reste privé : visible seulement par le joueur lui-même.
    'coins', case when is_self then p.coins else null end
  );
end;
$$;

revoke execute on function public.get_player_profile(uuid) from public, anon;
grant  execute on function public.get_player_profile(uuid) to authenticated;

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
                where private.owns_card(o.id, e.value)
             ),
             'showcase', (
               select coalesce(jsonb_agg(jsonb_build_object('colorway_id', split_part(s.card, '|', 1),
                                                            'rarity', split_part(s.card, '|', 2))
                                         order by s.pos), '[]'::jsonb)
                 from jsonb_array_elements_text(coalesce(o.showcase, '[]'::jsonb)) with ordinality as s(card, pos)
                where private.owns_card(o.id, s.card)
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

-- ============================================================
-- 7. Videur : un Ultime porté compte (remplace private.videur_worn de la 0012)
-- ============================================================
-- Rareté « ultime » = 15 points (Légendaire = 10) ; couleurs : sombre et vif (corps obsidienne, accents irisés).
update public.economy_config
   set config = jsonb_set(config, '{VIDEUR,rarityPoints,ultime}', '15'::jsonb),
       updated_at = now()
 where id = 1
   and config #> '{VIDEUR,rarityPoints}' is not null
   and not (config #> '{VIDEUR,rarityPoints}' ? 'ultime');

create or replace function private.videur_worn(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(w), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'slot', e.key, 'colorway_id', c.id, 'rarity', i.rarity::text, 'brand', p.brand_id,
               'tags', to_jsonb(coalesce(t.tags, '{}'::text[]))) as w
        from public.profiles pr
       cross join lateral jsonb_each_text(pr.equipped) e
        join public.inventory i  on i.user_id = pr.id and i.colorway_id = split_part(e.value, '|', 1)
                                and i.rarity::text = split_part(e.value, '|', 2) and i.count > 0
        join public.colorways c  on c.id = i.colorway_id
        join public.pieces p     on p.id = c.piece_id and p.slot = e.key
        left join public.colorway_tags t on t.colorway_id = c.id
       where pr.id = p_uid
      union all
      select jsonb_build_object(
               'slot', e.key, 'colorway_id', split_part(e.value, '|', 1), 'rarity', 'ultime', 'brand', p.brand_id,
               'tags', '["sombre", "vif"]'::jsonb) as w
        from public.profiles pr
       cross join lateral jsonb_each_text(pr.equipped) e
        join public.pieces p          on p.id || '_ultime' = split_part(e.value, '|', 1) and p.slot = e.key
        join public.album_ultimates a on a.user_id = pr.id and a.piece_id = p.id
       where pr.id = p_uid and split_part(e.value, '|', 2) = 'ultime'
    ) worn
$$;
