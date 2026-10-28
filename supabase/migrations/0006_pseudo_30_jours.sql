-- Grail — migration 0006 : le pseudo ne peut être changé qu'une fois tous les 30 jours
-- (le tout premier choix de pseudo est libre et ne compte pas comme un changement).
-- À exécuter APRÈS la 0005 (SQL Editor de Supabase). Peut être relancée sans risque.
-- Remplace set_pseudo (délai lu dans la config, 30 jours) et list_friends (renvoie la date du
-- prochain changement possible, pour l'afficher dans l'écran Amis).

update public.economy_config
   set config = config || jsonb_build_object(
         'FRIENDS', coalesce(config -> 'FRIENDS', '{}'::jsonb) || jsonb_build_object('pseudoChangeDays', 30)),
       updated_at = now()
 where id = 1;

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
  days  integer := coalesce((private.cfg() -> 'FRIENDS' ->> 'pseudoChangeDays')::integer, 30);
  left_days integer;
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

  -- Premier pseudo : toujours possible. Ensuite : un changement tous les `days` jours.
  if cur is not null and last is not null and last > now() - make_interval(days => days) then
    left_days := ceil(extract(epoch from (last + make_interval(days => days) - now())) / 86400)::integer;
    raise exception 'Tu pourras changer de pseudo dans % jour%', left_days, case when left_days > 1 then 's' else '' end;
  end if;

  begin
    -- Le tout premier choix n'est pas un « changement » : le délai de 30 jours ne démarre qu'au 1er changement.
    update public.profiles set pseudo = p, pseudo_changed_at = case when cur is null then null else now() end where id = uid;
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris';
  end;
end;
$$;

create or replace function public.list_friends()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  days integer := coalesce((private.cfg() -> 'FRIENDS' ->> 'pseudoChangeDays')::integer, 30);
  mine text;
  last timestamptz;
  next_change timestamptz;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select pseudo, pseudo_changed_at into mine, last from public.profiles where id = uid;
  -- Date à partir de laquelle on pourra changer de pseudo (null : on peut changer maintenant).
  if mine is not null and last is not null and last + make_interval(days => days) > now() then
    next_change := last + make_interval(days => days);
  end if;

  return jsonb_build_object(
    'pseudo', mine,
    'pseudo_next_change', next_change,
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

-- Les droits d'une fonction remplacée sont conservés ; on les réaffirme par sécurité.
revoke execute on function public.set_pseudo(text) from public, anon;
revoke execute on function public.list_friends()   from public, anon;
grant  execute on function public.set_pseudo(text) to authenticated;
grant  execute on function public.list_friends()   to authenticated;
