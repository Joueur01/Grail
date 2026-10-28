-- Grail — migration 0016 : vitrine limitée à 3 cartes (décision du développeur). Voir CLAUDE.md, section 14 bis.
-- À exécuter APRÈS la 0015 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- 1. economy_config.PROFILE.showcaseMax passe de 6 à 3 (set_showcase refuse au-delà).
-- 2. Les vitrines déjà enregistrées avec plus de 3 cartes gardent leurs 3 premières (dans l'ordre choisi).

update public.economy_config
   set config = jsonb_set(config, '{PROFILE}', coalesce(config -> 'PROFILE', '{}'::jsonb) || jsonb_build_object('showcaseMax', 3)),
       updated_at = now()
 where id = 1;

update public.profiles
   set showcase = (select coalesce(jsonb_agg(e.value order by e.pos), '[]'::jsonb)
                     from jsonb_array_elements(showcase) with ordinality as e(value, pos)
                    where e.pos <= 3)
 where jsonb_array_length(showcase) > 3;
