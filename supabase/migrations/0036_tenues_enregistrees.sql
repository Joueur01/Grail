-- Grail — migration 0036 : tenues enregistrées (3 emplacements). Voir CLAUDE.md, section 7.
-- À exécuter dans le SQL Editor de Supabase (après la 0022, qui crée private.owns_card). Peut être relancée sans risque.
--
-- Décision du développeur (30 octobre 2026) : le Videur oblige à changer la tenue portée, qui est aussi celle
-- que voient les amis et que l'on partage. Plutôt que deux avatars, le joueur peut ENREGISTRER sa tenue dans un
-- emplacement (« Tenue 1 », « Tenue 2 », « Tenue 3 ») et la REMETTRE en un toucher, par exemple après le Videur.
--  * Une tenue enregistrée est une COPIE de la tenue portée (emplacement → "coloris|rareté", Ultimes compris).
--    Elle ne bloque pas les cartes : on peut vendre, miser ou défausser une carte d'une tenue enregistrée.
--  * Remettre une tenue = la tenue portée devient exactement la tenue enregistrée, SAUF les cartes qui ne sont
--    plus possédées (vendues, misées, défaussées, placées dans l'album) : elles sont sautées et comptées
--    (« missing ») pour que le site le dise.
--  * Pas de nom libre (pas de contenu créé par les joueurs, CLAUDE.md section 9) : les emplacements sont numérotés.
--  * Nombre d'emplacements : economy_config.OUTFITS.max (3).

-- ============================================================
-- 1. Réglage et table
-- ============================================================
update public.economy_config
   set config = jsonb_set(config, '{OUTFITS}', '{"max": 3}'::jsonb),
       updated_at = now()
 where id = 1 and not (config ? 'OUTFITS');

create table if not exists public.saved_outfits (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  slot     integer not null check (slot between 1 and 10),
  equipped jsonb not null,                       -- { "haut": "coloris|rareté", ... } (même format que profiles.equipped)
  saved_at timestamptz not null default now(),
  primary key (user_id, slot)
);
-- Lecture et écriture uniquement par les fonctions ci-dessous (security definer).
alter table public.saved_outfits enable row level security;
revoke all on public.saved_outfits from anon, authenticated;

-- ============================================================
-- 2. Pièces d'une tenue encore possédées ET au bon emplacement → { emplacement: "coloris|rareté" }
-- ============================================================
create or replace function private.outfit_owned(p_uid uuid, p_equipped jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each_text(coalesce(p_equipped, '{}'::jsonb)) e
   where private.owns_card(p_uid, e.value)
     and exists (select 1 from public.pieces p
                  where p.slot = e.key
                    and (p.id || '_ultime' = split_part(e.value, '|', 1)
                         or exists (select 1 from public.colorways c
                                     where c.id = split_part(e.value, '|', 1) and c.piece_id = p.id)))
$$;

-- Numéro d'emplacement valide (1 à OUTFITS.max), sinon erreur.
create or replace function private.outfit_slot_check(p_slot integer)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_slot is null or p_slot < 1 or p_slot > coalesce((private.cfg() #>> '{OUTFITS,max}')::integer, 3) then
    raise exception 'Emplacement de tenue inconnu';
  end if;
end;
$$;

-- ============================================================
-- 3. Fonctions du jeu
-- ============================================================
-- Mes tenues enregistrées : un élément par emplacement (vide ou non), avec chaque pièce et si elle est
-- encore possédée.
-- → { max, outfits: [{ slot, saved_at, pieces: [{ slot, card, owned }] } | { slot, empty: true }] }
create or replace function public.get_saved_outfits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  v_max integer := coalesce((private.cfg() #>> '{OUTFITS,max}')::integer, 3);
begin
  if uid is null then raise exception 'Non connecté'; end if;
  return jsonb_build_object('max', v_max, 'outfits', (
    select jsonb_agg(
             case when o.user_id is null then jsonb_build_object('slot', n, 'empty', true)
                  else jsonb_build_object('slot', n, 'saved_at', o.saved_at, 'pieces',
                         (select coalesce(jsonb_agg(jsonb_build_object('slot', e.key, 'card', e.value,
                                   'owned', private.outfit_owned(uid, jsonb_build_object(e.key, e.value)) <> '{}'::jsonb)), '[]'::jsonb)
                            from jsonb_each_text(o.equipped) e))
             end order by n)
      from generate_series(1, v_max) n
      left join public.saved_outfits o on o.user_id = uid and o.slot = n));
end;
$$;

-- Enregistre la tenue PORTÉE (pièces encore possédées) dans un emplacement (remplace l'ancienne).
create or replace function public.save_outfit(p_slot integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  eq  jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform private.outfit_slot_check(p_slot);
  select private.outfit_owned(uid, p.equipped) into eq from public.profiles p where p.id = uid;
  if eq is null or eq = '{}'::jsonb then raise exception 'Porte au moins une pièce pour enregistrer ta tenue'; end if;
  insert into public.saved_outfits (user_id, slot, equipped, saved_at)
  values (uid, p_slot, eq, now())
  on conflict (user_id, slot) do update set equipped = excluded.equipped, saved_at = excluded.saved_at;
  return public.get_saved_outfits();
end;
$$;

-- Remet une tenue enregistrée : la tenue portée devient la tenue enregistrée (cartes encore possédées).
-- → { equipped, worn, missing }
create or replace function public.wear_saved_outfit(p_slot integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  saved jsonb;
  eq    jsonb;
  total integer;
  kept  integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform private.outfit_slot_check(p_slot);
  select o.equipped into saved from public.saved_outfits o where o.user_id = uid and o.slot = p_slot;
  if saved is null then raise exception 'Cet emplacement est vide'; end if;
  eq := private.outfit_owned(uid, saved);
  select count(*) into total from jsonb_object_keys(saved);
  select count(*) into kept from jsonb_object_keys(eq);
  if kept = 0 then raise exception 'Tu ne possèdes plus aucune pièce de cette tenue'; end if;
  update public.profiles set equipped = eq where id = uid;
  return jsonb_build_object('equipped', eq, 'worn', kept, 'missing', total - kept);
end;
$$;

-- Vide un emplacement.
create or replace function public.delete_saved_outfit(p_slot integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform private.outfit_slot_check(p_slot);
  delete from public.saved_outfits where user_id = uid and slot = p_slot;
  return public.get_saved_outfits();
end;
$$;

-- ============================================================
-- 4. Droits
-- ============================================================
revoke execute on function private.outfit_owned(uuid, jsonb)      from public, anon, authenticated;
revoke execute on function private.outfit_slot_check(integer)     from public, anon, authenticated;
revoke execute on function public.get_saved_outfits()             from public, anon;
revoke execute on function public.save_outfit(integer)            from public, anon;
revoke execute on function public.wear_saved_outfit(integer)      from public, anon;
revoke execute on function public.delete_saved_outfit(integer)    from public, anon;
grant  execute on function public.get_saved_outfits()             to authenticated;
grant  execute on function public.save_outfit(integer)            to authenticated;
grant  execute on function public.wear_saved_outfit(integer)      to authenticated;
grant  execute on function public.delete_saved_outfit(integer)    to authenticated;

-- Vérification : attendu « 3 | t » (3 emplacements, table créée).
select (select config #>> '{OUTFITS,max}' from public.economy_config where id = 1) as emplacements,
       to_regclass('public.saved_outfits') is not null as table_creee;
