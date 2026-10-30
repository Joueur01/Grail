-- Grail — migration 0039 : filtre par plateforme dans la liste des joueurs du panel admin.
-- À exécuter APRÈS la 0038 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- admin_players reçoit un 7e paramètre p_platform (ios / android / desktop : plateforme la plus utilisée
-- par le joueur, colonne `platform` d'analytics_player_summary). Copie de la 0038, deux lignes ajoutées.
-- L'ancienne version (6 paramètres) est supprimée pour ne pas avoir deux fonctions du même nom ; le site
-- appelle avec des noms de paramètres : les appels sans plateforme marchent avant et après.

drop function if exists public.admin_players(text, text, text, text, integer, integer);

create or replace function public.admin_players(p_search text default null, p_sort text default null,
  p_dir text default 'desc', p_status text default null, p_limit integer default 50, p_offset integer default 0,
  p_platform text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cols   text[];
  v_sort   text;
  v_dir    text := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  res      jsonb;
begin
  perform private.admin_check();
  -- Tri : seulement une colonne connue (jamais de texte libre dans la requête).
  select array_agg(attname::text) into v_cols
    from pg_catalog.pg_attribute
   where attrelid = 'public.analytics_player_summary'::regclass and attnum > 0 and not attisdropped;
  v_sort := case when p_sort = 'pseudo' or p_sort = any (v_cols) then p_sort else 'last_active_day' end;
  if v_search is not null then
    v_search := replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  execute format($q$
    with s as (
      select p.pseudo, s.*
        from public.analytics_player_summary s
        join public.profiles p on p.id = s.user_id
       where ($1::text is null or p.pseudo ilike '%%' || $1 || '%%' or s.user_id::text like $1 || '%%')
         and ($2::text is null or s.status = $2)
         and ($5::text is null or s.platform = $5)
    ),
    page as (
      select * from s order by %1$I %2$s nulls last, user_id limit $3 offset $4
    )
    select jsonb_build_object(
      'total', (select count(*) from s),
      'limit', $3, 'offset', $4, 'sort', %1$L, 'dir', %2$L,
      'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.%1$I %2$s nulls last, x.user_id) from page x), '[]'::jsonb))
  $q$, v_sort, v_dir)
  into res using v_search, p_status, v_limit, v_offset, nullif(p_platform, '');
  return res;
end;
$$;

revoke execute on function public.admin_players(text, text, text, text, integer, integer, text) from public, anon;
grant  execute on function public.admin_players(text, text, text, text, integer, integer, text) to authenticated;

-- Contrôle : doit afficher une seule ligne « 7 | f | t ».
select p.pronargs as parametres,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'admin_players';
