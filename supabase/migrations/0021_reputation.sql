-- Grail — migration 0021 : le FLOW devient une RÉPUTATION (niveaux). Voir CLAUDE.md, section 16.
-- À exécuter APRÈS la 0015 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Règle (décision du développeur) : on commence niveau 0. Pour passer niveau 1 il faut 50 Flow, pour passer
-- niveau 2 il en faut 100, puis 150… (50 de plus à chaque niveau : coût du passage du niveau n au niveau n+1 =
-- 50 × (n + 1)). À chaque passage de niveau, le Flow correspondant est DÉPENSÉ : profiles.flow est donc le
-- Flow accumulé vers le niveau suivant (il baisse au passage), et rep_level le niveau.
--
-- Le Flow se gagne toujours au Videur (videur_enter, inchangé : « update profiles set flow = flow + … »).
-- Un DÉCLENCHEUR sur profiles applique les passages de niveau (plusieurs d'un coup si le gain est grand), sans
-- modifier videur_enter. Le Flow reste non convertible en pièces et non échangeable (CLAUDE.md, section 16).
--
-- 1. profiles.rep_level, profiles.rep_next (Flow à atteindre pour le niveau suivant : le site l'affiche tel quel).
-- 2. economy_config.REPUTATION.costStep = 50 (le « 50 de plus à chaque niveau »).
-- 3. Déclencheur de passage de niveau + conversion UNE FOIS du Flow déjà gagné.
-- 4. get_player_profile renvoie rep_level et rep_next (remplace la version de la 0015).

alter table public.profiles add column if not exists rep_level integer not null default 0 check (rep_level >= 0);
alter table public.profiles add column if not exists rep_next  integer not null default 50 check (rep_next > 0);

update public.economy_config
   set config = config || jsonb_build_object('REPUTATION', jsonb_build_object('costStep', 50)),
       updated_at = now()
 where id = 1 and not (config ? 'REPUTATION');

-- Pas de montée de niveau : le Flow demandé pour passer du niveau n au suivant est costStep × (n + 1).
create or replace function private.reputation_step()
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(1, coalesce((select (config #>> '{REPUTATION,costStep}')::integer from public.economy_config where id = 1), 50))
$$;

create or replace function private.reputation_rankup()
returns trigger
language plpgsql
set search_path = ''
as $$
declare step integer := private.reputation_step();
begin
  -- Tant que le Flow accumulé couvre le niveau suivant : on monte et on dépense ce Flow.
  while new.flow >= step * (new.rep_level + 1) loop
    new.flow := new.flow - step * (new.rep_level + 1);
    new.rep_level := new.rep_level + 1;
  end loop;
  new.rep_next := step * (new.rep_level + 1);
  return new;
end;
$$;

revoke execute on function private.reputation_step()    from public, anon, authenticated;
revoke execute on function private.reputation_rankup()  from public, anon, authenticated;

drop trigger if exists profiles_reputation_rankup on public.profiles;
create trigger profiles_reputation_rankup
  before insert or update of flow, rep_level on public.profiles
  for each row
  execute function private.reputation_rankup();

-- Conversion UNE FOIS du Flow déjà gagné (le déclencheur calcule les niveaux ; relancer ne change plus rien).
update public.profiles set flow = flow;

-- ============================================================
-- Le profil renvoie la réputation
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
