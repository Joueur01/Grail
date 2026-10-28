-- Grail — migration 0012 : le Videur (V1). Voir CLAUDE.md, section 16.
-- À exécuter APRÈS la 0011 (SQL Editor de Supabase). Peut être relancée sans risque
-- (elle ne remet pas à zéro les réglages ni les essais déjà enregistrés).
--
-- Chaque jour, 3 portes (Bar, Club, VIP) avec un dress code tiré au hasard (déterministe selon la date).
-- Deux jauges : STYLE (règles du dress code, 0 à 100) et RARETÉ (points par pièce portée). Une porte exige
-- un minimum sur les deux. Réussir une porte rapporte du FLOW, une fois par jour et par porte.
-- Tout est calculé ICI, sur la tenue enregistrée par le joueur (profiles.equipped) ET encore possédée
-- (une carte vendue entre-temps ne compte pas). Le site affiche seulement.
-- Réglages : economy_config.VIDEUR (essais, seuils, Flow, points de rareté, bonus de série).

-- ============================================================
-- 1. Flow, réglages
-- ============================================================
alter table public.profiles add column if not exists flow integer not null default 0 check (flow >= 0);

update public.economy_config
   set config = config || jsonb_build_object('VIDEUR', jsonb_build_object(
         'triesPerDoor', 2,
         'streakBonusCap', 5,
         'rarityPoints', jsonb_build_object('commun', 1, 'rare', 3, 'epique', 6, 'legendaire', 10),
         'doors', jsonb_build_array(
           jsonb_build_object('id', 'bar',  'name', 'Bar',  'minStyle', 50, 'minRarity', 4,  'flow', 5),
           jsonb_build_object('id', 'club', 'name', 'Club', 'minStyle', 70, 'minRarity', 14, 'flow', 12),
           jsonb_build_object('id', 'vip',  'name', 'VIP',  'minStyle', 85, 'minRarity', 28, 'flow', 25)))),
       updated_at = now()
 where id = 1 and not (config ? 'VIDEUR');

-- ============================================================
-- 2. Tables
-- ============================================================
-- Couleurs de chaque coloris (le catalogue n'a que le nom en texte) : sombre, clair, neutre, vif, delave,
-- terre, chaud, froid, metal.
create table if not exists public.colorway_tags (
  colorway_id text primary key references public.colorways (id) on delete cascade,
  tags        text[] not null default '{}'
);

-- Dress codes : un lot par porte, tirage du jour déterministe.
create table if not exists public.videur_codes (
  id     bigint generated always as identity primary key,
  door   text not null check (door in ('bar', 'club', 'vip')),
  name   text not null,
  intro  text not null,
  rules  jsonb not null,
  active boolean not null default true,
  unique (door, name)
);

-- Répliques du videur.
create table if not exists public.videur_lines (
  id   bigint generated always as identity primary key,
  door text not null check (door in ('bar', 'club', 'vip')),
  kind text not null check (kind in ('enter', 'refuse_style', 'refuse_rarity', 'refuse_both')),
  text text not null,
  unique (door, kind, text)
);

-- Essais des joueurs (un par ligne).
create table if not exists public.videur_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  door        text not null check (door in ('bar', 'club', 'vip')),
  code_id     bigint references public.videur_codes (id),
  style       integer not null,
  rarity      integer not null,
  passed      boolean not null,
  flow_gained integer not null default 0,
  outfit      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists videur_attempts_user_day_idx on public.videur_attempts (user_id, day, door);

alter table public.colorway_tags   enable row level security;
alter table public.videur_codes    enable row level security;
alter table public.videur_lines    enable row level security;
alter table public.videur_attempts enable row level security;
revoke all on public.colorway_tags, public.videur_codes, public.videur_lines, public.videur_attempts from anon, authenticated;

-- ============================================================
-- 3. Données de départ
-- ============================================================
insert into public.colorway_tags (colorway_id, tags) values
  ('signal9_shell_relais_noir_orange_signal', array['sombre','neutre','vif','chaud']),
  ('signal9_shell_relais_olive_orange_signal', array['terre','vif','chaud']),
  ('signal9_shell_relais_noir_jaune_balise', array['sombre','neutre','vif','chaud']),
  ('signal9_shell_relais_gris_beton_orange_signal', array['neutre','vif','chaud']),
  ('signal9_shell_relais_marine_nuit_rouge_balise', array['sombre','froid','vif','chaud']),
  ('signal9_shell_relais_glacier_orange_signal', array['clair','froid','vif','chaud']),
  ('signal9_gilet_dossard_noir_orange_signal', array['sombre','neutre','vif','chaud']),
  ('signal9_gilet_dossard_olive_orange_signal', array['terre','vif','chaud']),
  ('signal9_gilet_dossard_noir_jaune_balise', array['sombre','neutre','vif','chaud']),
  ('signal9_cargo_beton_gris_beton_orange_signal', array['neutre','vif','chaud']),
  ('signal9_cargo_beton_noir_orange_signal', array['sombre','neutre','vif','chaud']),
  ('signal9_cargo_beton_olive_jaune_balise', array['terre','vif','chaud']),
  ('signal9_cargo_beton_sable_orange_signal', array['clair','terre','vif','chaud']),
  ('signal9_short_course_noir_orange_signal', array['sombre','neutre','vif','chaud']),
  ('signal9_short_course_noir_jaune_balise', array['sombre','neutre','vif','chaud']),
  ('signal9_montantes_trame_noir_orange_signal', array['sombre','neutre','vif','chaud']),
  ('signal9_montantes_trame_noir_jaune_balise', array['sombre','neutre','vif','chaud']),
  ('signal9_montantes_trame_olive_orange_signal', array['terre','vif','chaud']),
  ('signal9_montantes_trame_sable_orange_signal', array['clair','terre','vif','chaud']),
  ('signal9_montantes_trame_triple_noir', array['sombre','neutre']),
  ('signal9_sacoche_tournee_noir_orange_signal', array['sombre','neutre','vif','chaud']),
  ('signal9_sacoche_tournee_noir_jaune_balise', array['sombre','neutre','vif','chaud']),
  ('signal9_sacoche_tournee_olive_orange_signal', array['terre','vif','chaud']),
  ('signal9_bonnet_nuit_noir_orange_signal', array['sombre','neutre','vif','chaud']),
  ('signal9_bonnet_nuit_olive_orange_signal', array['terre','vif','chaud']),
  ('signal9_bonnet_nuit_orange_noir', array['vif','chaud','sombre','neutre']),
  ('halvane_manteau_atelier_camel_or', array['terre','chaud','metal']),
  ('halvane_manteau_atelier_noir_creme_or', array['sombre','neutre','clair','metal','chaud']),
  ('halvane_manteau_atelier_gris_flanelle_argent', array['neutre','metal','froid']),
  ('halvane_manteau_atelier_marine_or', array['sombre','froid','metal','chaud']),
  ('halvane_manteau_atelier_chocolat_or', array['sombre','terre','metal','chaud']),
  ('halvane_manteau_atelier_creme_or', array['clair','neutre','metal','chaud']),
  ('halvane_col_roule_fil_creme_or', array['clair','neutre','metal','chaud']),
  ('halvane_col_roule_fil_noir_or', array['sombre','neutre','metal','chaud']),
  ('halvane_col_roule_fil_gris_flanelle_argent', array['neutre','metal','froid']),
  ('halvane_chemise_coupe_noir_or', array['sombre','neutre','metal','chaud']),
  ('halvane_chemise_coupe_creme_or', array['clair','neutre','metal','chaud']),
  ('halvane_chemise_coupe_marine_argent', array['sombre','froid','metal']),
  ('halvane_pantalon_pli_creme_or', array['clair','neutre','metal','chaud']),
  ('halvane_pantalon_pli_gris_flanelle_argent', array['neutre','metal','froid']),
  ('halvane_mocassins_heritage_noir_or', array['sombre','neutre','metal','chaud']),
  ('halvane_mocassins_heritage_chocolat_or', array['sombre','terre','metal','chaud']),
  ('halvane_mocassins_heritage_bordeaux_or', array['sombre','chaud','metal']),
  ('halvane_mocassins_heritage_noir_argent', array['sombre','neutre','metal','froid']),
  ('halvane_sac_losange_camel_or', array['terre','chaud','metal']),
  ('halvane_sac_losange_noir_or', array['sombre','neutre','metal','chaud']),
  ('halvane_sac_losange_chocolat_or', array['sombre','terre','metal','chaud']),
  ('halvane_sac_losange_bordeaux_or', array['sombre','chaud','metal']),
  ('halvane_sac_losange_creme_or', array['clair','neutre','metal','chaud']),
  ('halvane_echarpe_lisere_noir_or', array['sombre','neutre','metal','chaud']),
  ('halvane_echarpe_lisere_camel_or', array['terre','chaud','metal']),
  ('halvane_echarpe_lisere_bordeaux_or', array['sombre','chaud','metal']),
  ('pigeon_social_club_hoodie_dalle_vert_bouteille', array['sombre']),
  ('pigeon_social_club_hoodie_dalle_moutarde', array['vif','chaud']),
  ('pigeon_social_club_hoodie_dalle_brique', array['chaud','terre']),
  ('pigeon_social_club_hoodie_dalle_bleu_delave', array['delave','froid']),
  ('pigeon_social_club_hoodie_dalle_rose_delave', array['delave','chaud']),
  ('pigeon_social_club_hoodie_dalle_noir_delave', array['delave','sombre']),
  ('pigeon_social_club_t_shirt_roucoule_moutarde', array['vif','chaud']),
  ('pigeon_social_club_t_shirt_roucoule_creme', array['clair','neutre']),
  ('pigeon_social_club_t_shirt_roucoule_bleu_delave', array['delave','froid']),
  ('pigeon_social_club_short_ollie_brique', array['chaud','terre']),
  ('pigeon_social_club_short_ollie_vert_bouteille', array['sombre']),
  ('pigeon_social_club_short_ollie_noir_delave', array['delave','sombre']),
  ('pigeon_social_club_sneakers_bitume_creme_brique', array['clair','neutre','chaud','terre']),
  ('pigeon_social_club_sneakers_bitume_creme_vert_bouteille', array['clair','neutre','sombre']),
  ('pigeon_social_club_sneakers_bitume_creme_bleu_delave', array['clair','neutre','delave','froid']),
  ('pigeon_social_club_sneakers_bitume_creme_rose_delave', array['clair','neutre','delave','chaud']),
  ('pigeon_social_club_sneakers_bitume_noir_delave_creme', array['delave','sombre','clair','neutre']),
  ('pigeon_social_club_casquette_perchoir_vert_bouteille_moutarde', array['sombre','vif','chaud']),
  ('pigeon_social_club_casquette_perchoir_moutarde_vert_bouteille', array['vif','chaud','sombre']),
  ('pigeon_social_club_casquette_perchoir_bleu_delave_creme', array['delave','froid','clair','neutre']),
  ('pigeon_social_club_casquette_perchoir_noir_delave_brique', array['delave','sombre','chaud','terre']),
  ('pigeon_social_club_tote_miettes_creme_vert_bouteille', array['clair','neutre','sombre']),
  ('pigeon_social_club_tote_miettes_noir_delave_moutarde', array['delave','sombre','vif','chaud'])
on conflict (colorway_id) do update set tags = excluded.tags;

insert into public.videur_codes (door, name, intro, rules) values
  ('bar', 'Total noir', 'Ce soir, le Bar ne laisse entrer que le noir. Pas de couleur qui crie.', '[{"type": "palette", "tags": ["sombre"], "min": 4, "weight": 50, "label": "Au moins 4 pièces sombres"}, {"type": "complete", "weight": 30, "label": "Haut, bas et chaussures portés"}, {"type": "forbid_tag", "tag": "vif", "weight": 20, "label": "Aucune couleur vive"}]'::jsonb),
  ('bar', 'Dalle du soir', 'Le Bar est tenu par les skateurs. Pigeon Social Club, ou rien.', '[{"type": "brand", "brand": "pigeon_social_club", "min": 2, "weight": 40, "label": "Au moins 2 pièces Pigeon Social Club"}, {"type": "complete", "weight": 30, "label": "Haut, bas et chaussures portés"}, {"type": "slot", "slot": "tete", "weight": 30, "label": "Un couvre-chef sur la tête"}]'::jsonb),
  ('bar', 'Tenue de ville', 'Un Bar discret : du Halvane, et de la tenue.', '[{"type": "brand", "brand": "halvane", "min": 2, "weight": 40, "label": "Au moins 2 pièces Halvane"}, {"type": "forbid_tag", "tag": "vif", "weight": 30, "label": "Aucune couleur vive"}, {"type": "complete", "weight": 30, "label": "Haut, bas et chaussures portés"}]'::jsonb),
  ('bar', 'Coursier', 'Au Bar, ce soir, on parle utilitaire. SIGNAL/9, et du solide.', '[{"type": "brand", "brand": "signal9", "min": 2, "weight": 40, "label": "Au moins 2 pièces SIGNAL/9"}, {"type": "palette", "tags": ["sombre", "neutre"], "min": 3, "weight": 30, "label": "Au moins 3 pièces sombres ou neutres"}, {"type": "complete", "weight": 30, "label": "Haut, bas et chaussures portés"}]'::jsonb),
  ('club', 'Nuit Halvane', 'Le Club est un salon tamisé. Du Halvane, du clair, du métal.', '[{"type": "brand", "brand": "halvane", "min": 3, "weight": 40, "label": "Au moins 3 pièces Halvane"}, {"type": "palette", "tags": ["clair", "metal"], "min": 3, "weight": 30, "label": "Au moins 3 pièces claires ou à liseré métal"}, {"type": "complete", "weight": 15, "label": "Haut, bas et chaussures portés"}, {"type": "slot", "slot": "cou", "weight": 15, "label": "Une écharpe au cou"}]'::jsonb),
  ('club', 'Rave utilitaire', 'Le Club est un hangar. Techwear de la tête aux pieds.', '[{"type": "brand", "brand": "signal9", "min": 3, "weight": 40, "label": "Au moins 3 pièces SIGNAL/9"}, {"type": "palette", "tags": ["sombre"], "min": 3, "weight": 30, "label": "Au moins 3 pièces sombres"}, {"type": "complete", "weight": 15, "label": "Haut, bas et chaussures portés"}, {"type": "slot", "slot": "sac", "weight": 15, "label": "Un sac sur soi"}]'::jsonb),
  ('club', 'Crew du bitume', 'Le Club ouvre aux crews. Pigeon Social Club, en bande.', '[{"type": "brand", "brand": "pigeon_social_club", "min": 3, "weight": 40, "label": "Au moins 3 pièces Pigeon Social Club"}, {"type": "palette", "tags": ["delave", "chaud"], "min": 2, "weight": 30, "label": "Au moins 2 pièces délavées ou chaudes"}, {"type": "complete", "weight": 15, "label": "Haut, bas et chaussures portés"}, {"type": "slot", "slot": "tete", "weight": 15, "label": "Un couvre-chef sur la tête"}]'::jsonb),
  ('club', 'Sobre et cher', 'Au Club, le luxe ne dit rien. Neutre, propre, complet.', '[{"type": "palette", "tags": ["neutre"], "min": 4, "weight": 40, "label": "Au moins 4 pièces neutres"}, {"type": "forbid_tag", "tag": "vif", "weight": 25, "label": "Aucune couleur vive"}, {"type": "complete", "weight": 20, "label": "Haut, bas et chaussures portés"}, {"type": "min_pieces", "min": 5, "weight": 15, "label": "Au moins 5 pièces portées"}]'::jsonb),
  ('vip', 'Salon Halvane', 'Le VIP est une maison de couture. Halvane, entièrement, ou rien.', '[{"type": "same_brand", "min": 4, "weight": 40, "label": "Tenue 100 % d''une même marque (4 pièces minimum)"}, {"type": "brand", "brand": "halvane", "min": 4, "weight": 20, "label": "Au moins 4 pièces Halvane"}, {"type": "palette", "tags": ["clair", "metal", "neutre"], "min": 4, "weight": 20, "label": "Au moins 4 pièces claires, neutres ou à liseré"}, {"type": "complete", "weight": 10, "label": "Haut, bas et chaussures portés"}, {"type": "slot", "slot": "sac", "weight": 10, "label": "Un sac sur soi"}]'::jsonb),
  ('vip', 'Hangar privé', 'Le VIP est réservé aux vrais. Techwear intégral, sans une faute.', '[{"type": "same_brand", "min": 4, "weight": 40, "label": "Tenue 100 % d''une même marque (4 pièces minimum)"}, {"type": "brand", "brand": "signal9", "min": 4, "weight": 20, "label": "Au moins 4 pièces SIGNAL/9"}, {"type": "palette", "tags": ["sombre"], "min": 4, "weight": 20, "label": "Au moins 4 pièces sombres"}, {"type": "complete", "weight": 10, "label": "Haut, bas et chaussures portés"}, {"type": "slot", "slot": "tete", "weight": 10, "label": "Un bonnet ou une casquette"}]'::jsonb),
  ('vip', 'Toit de la gare', 'Le VIP, sur le toit. Pigeon Social Club, en grand.', '[{"type": "same_brand", "min": 4, "weight": 40, "label": "Tenue 100 % d''une même marque (4 pièces minimum)"}, {"type": "brand", "brand": "pigeon_social_club", "min": 4, "weight": 20, "label": "Au moins 4 pièces Pigeon Social Club"}, {"type": "min_pieces", "min": 5, "weight": 20, "label": "Au moins 5 pièces portées"}, {"type": "complete", "weight": 10, "label": "Haut, bas et chaussures portés"}, {"type": "slot", "slot": "sac", "weight": 10, "label": "Un sac sur soi"}]'::jsonb),
  ('vip', 'Sans fausse note', 'Le VIP regarde tout. Complet, soigné, mesuré.', '[{"type": "min_pieces", "min": 6, "weight": 30, "label": "Au moins 6 pièces portées"}, {"type": "complete", "weight": 20, "label": "Haut, bas et chaussures portés"}, {"type": "forbid_tag", "tag": "vif", "weight": 25, "label": "Aucune couleur vive"}, {"type": "palette", "tags": ["sombre", "neutre", "clair"], "min": 5, "weight": 25, "label": "Au moins 5 pièces sombres, neutres ou claires"}]'::jsonb)
on conflict (door, name) do nothing;

insert into public.videur_lines (door, kind, text) values
  ('bar', 'enter', 'Vas-y, entre.'),
  ('bar', 'enter', 'Ça passe. Ne traîne pas.'),
  ('bar', 'enter', 'Bonne soirée.'),
  ('bar', 'refuse_style', 'Ce n''est pas le thème de ce soir.'),
  ('bar', 'refuse_style', 'Revois ta tenue. Ce n''est pas ça.'),
  ('bar', 'refuse_style', 'Pas dans le style. Reviens.'),
  ('bar', 'refuse_rarity', 'Il manque un peu de matière. Reviens avec mieux.'),
  ('bar', 'refuse_rarity', 'Trop simple pour ce soir.'),
  ('bar', 'refuse_rarity', 'Pas assez pour entrer.'),
  ('bar', 'refuse_both', 'Ni le thème, ni le niveau. Non.'),
  ('bar', 'refuse_both', 'Non. Reprends tout.'),
  ('bar', 'refuse_both', 'Pas ce soir.'),
  ('club', 'enter', 'Tu peux passer.'),
  ('club', 'enter', 'Pas mal. Entre.'),
  ('club', 'enter', 'Va. Le Club t''attend.'),
  ('club', 'refuse_style', 'Le style n''y est pas. Non.'),
  ('club', 'refuse_style', 'Ce n''est pas la bonne ambiance.'),
  ('club', 'refuse_style', 'Regarde le thème, puis reviens.'),
  ('club', 'refuse_rarity', 'Joli, mais trop simple pour ici.'),
  ('club', 'refuse_rarity', 'Il te manque des pièces qui comptent.'),
  ('club', 'refuse_rarity', 'Pas assez rare pour le Club.'),
  ('club', 'refuse_both', 'Pas le thème, pas le niveau. Non.'),
  ('club', 'refuse_both', 'Retourne au Bar.'),
  ('club', 'refuse_both', 'Non. Pas pour ce soir.'),
  ('vip', 'enter', 'Entre. On t''attendait.'),
  ('vip', 'enter', 'Respect. Passe.'),
  ('vip', 'enter', 'Bienvenue au VIP.'),
  ('vip', 'refuse_style', 'Le niveau est là, pas le goût. Non.'),
  ('vip', 'refuse_style', 'Pas dans l''esprit de la maison.'),
  ('vip', 'refuse_style', 'Refusé. Revois l''ensemble.'),
  ('vip', 'refuse_rarity', 'Le style y est. Les pièces, non.'),
  ('vip', 'refuse_rarity', 'Trop commun pour le VIP.'),
  ('vip', 'refuse_rarity', 'Il manque des pièces rares.'),
  ('vip', 'refuse_both', 'Pas du tout. Au revoir.'),
  ('vip', 'refuse_both', 'Non.'),
  ('vip', 'refuse_both', 'Ce n''est pas pour toi, pas encore.')
on conflict do nothing;

-- ============================================================
-- 4. Fonctions internes
-- ============================================================
create or replace function private.videur_day()
returns date language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- Dress code du jour pour une porte : tirage déterministe (même code pour tous les joueurs ce jour-là).
create or replace function private.videur_code_for(p_day date, p_door text)
returns public.videur_codes
language plpgsql
stable
set search_path = ''
as $$
declare
  n integer;
  c public.videur_codes;
begin
  select count(*) into n from public.videur_codes where door = p_door and active;
  if n = 0 then raise exception 'Aucun dress code pour cette porte'; end if;
  select * into c from public.videur_codes where door = p_door and active
   order by id offset (abs(hashtext(p_day::text || p_door)) % n) limit 1;
  return c;
end;
$$;

-- Pièces PORTÉES et encore POSSÉDÉES : [{ slot, colorway_id, rarity, brand, tags }].
create or replace function private.videur_worn(p_uid uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slot', e.key, 'colorway_id', c.id, 'rarity', i.rarity::text, 'brand', p.brand_id,
           'tags', to_jsonb(coalesce(t.tags, '{}'::text[])))), '[]'::jsonb)
    from public.profiles pr
   cross join lateral jsonb_each_text(pr.equipped) e
    join public.inventory i  on i.user_id = pr.id and i.colorway_id = split_part(e.value, '|', 1)
                            and i.rarity::text = split_part(e.value, '|', 2) and i.count > 0
    join public.colorways c  on c.id = i.colorway_id
    join public.pieces p     on p.id = c.piece_id and p.slot = e.key
    left join public.colorway_tags t on t.colorway_id = c.id
   where pr.id = p_uid
$$;

-- Évalue la tenue portée contre les règles d'un dress code.
-- → { pieces, rarity_points, style, rules: [{ label, weight, ok }] }
create or replace function private.videur_eval(p_uid uuid, p_rules jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  worn  jsonb := private.videur_worn(p_uid);
  rp    jsonb := private.cfg() -> 'VIDEUR' -> 'rarityPoints';
  nb    integer := jsonb_array_length(worn);
  pts   integer := 0;
  style integer := 0;
  res   jsonb := '[]'::jsonb;
  w     jsonb;
  r     jsonb;
  ok    boolean;
  n     integer;
  wt    integer;
begin
  for w in select * from jsonb_array_elements(worn) loop
    pts := pts + coalesce((rp ->> (w ->> 'rarity'))::integer, 0);
  end loop;

  for r in select * from jsonb_array_elements(p_rules) loop
    wt := (r ->> 'weight')::integer;
    case r ->> 'type'
      when 'brand' then
        select count(*) into n from jsonb_array_elements(worn) x where x ->> 'brand' = r ->> 'brand';
        ok := n >= (r ->> 'min')::integer;
      when 'same_brand' then
        ok := nb >= (r ->> 'min')::integer
              and (select count(distinct x ->> 'brand') from jsonb_array_elements(worn) x) = 1;
      when 'palette' then
        select count(*) into n from jsonb_array_elements(worn) x
         where exists (select 1 from jsonb_array_elements_text(x -> 'tags') tg
                        where tg = any (array(select jsonb_array_elements_text(r -> 'tags'))));
        ok := n >= (r ->> 'min')::integer;
      when 'forbid_tag' then
        ok := not exists (select 1 from jsonb_array_elements(worn) x where (x -> 'tags') ? (r ->> 'tag'));
      when 'complete' then
        ok := (select count(distinct x ->> 'slot') from jsonb_array_elements(worn) x
                where x ->> 'slot' in ('haut', 'bas', 'chaussures')) = 3;
      when 'slot' then
        ok := exists (select 1 from jsonb_array_elements(worn) x where x ->> 'slot' = r ->> 'slot');
      when 'min_pieces' then
        ok := nb >= (r ->> 'min')::integer;
      else
        ok := false;
    end case;
    ok := ok and nb > 0; -- une tenue vide ne marque aucun point
    if ok then style := style + wt; end if;
    res := res || jsonb_build_array(jsonb_build_object('label', r ->> 'label', 'weight', wt, 'ok', ok));
  end loop;

  return jsonb_build_object(
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('slot', x ->> 'slot', 'colorway_id', x ->> 'colorway_id', 'rarity', x ->> 'rarity')), '[]'::jsonb)
                 from jsonb_array_elements(worn) x),
    'rarity_points', pts, 'style', style, 'rules', res);
end;
$$;

-- Jours d'affilée (se terminant EXACTEMENT à p_end) où le Bar a été réussi.
create or replace function private.videur_streak(p_uid uuid, p_end date)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare
  d date := p_end;
  n integer := 0;
begin
  while n < 365 and exists (select 1 from public.videur_attempts
                             where user_id = p_uid and day = d and door = 'bar' and passed) loop
    n := n + 1;
    d := d - 1;
  end loop;
  return n;
end;
$$;

-- ============================================================
-- 5. Fonctions du jeu
-- ============================================================
-- La soirée du jour : 3 portes, leur état, le Flow et la série.
create or replace function public.get_videur_night()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  today   date := private.videur_day();
  cfg     jsonb := private.cfg() -> 'VIDEUR';
  tries   integer := (cfg ->> 'triesPerDoor')::integer;
  d       jsonb;
  code    public.videur_codes;
  used    integer;
  done    boolean;
  prev    boolean := true;
  doors   jsonb := '[]'::jsonb;
  streak  integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  for d in select * from jsonb_array_elements(cfg -> 'doors') loop
    code := private.videur_code_for(today, d ->> 'id');
    select count(*) into used from public.videur_attempts where user_id = uid and day = today and door = d ->> 'id';
    select exists (select 1 from public.videur_attempts where user_id = uid and day = today and door = d ->> 'id' and passed) into done;
    doors := doors || jsonb_build_array(jsonb_build_object(
      'id', d ->> 'id', 'name', d ->> 'name', 'venue', code.name, 'intro', code.intro,
      'min_style', (d ->> 'minStyle')::integer, 'min_rarity', (d ->> 'minRarity')::integer, 'flow', (d ->> 'flow')::integer,
      'rules', (select jsonb_agg(jsonb_build_object('label', x ->> 'label', 'weight', (x ->> 'weight')::integer))
                  from jsonb_array_elements(code.rules) x),
      'tries_left', greatest(tries - used, 0), 'passed', done, 'locked', not prev));
    prev := done;
  end loop;

  streak := case when exists (select 1 from public.videur_attempts where user_id = uid and day = today and door = 'bar' and passed)
                 then private.videur_streak(uid, today) else private.videur_streak(uid, today - 1) end;

  return jsonb_build_object(
    'day', today, 'flow', (select flow from public.profiles where id = uid), 'streak', streak,
    'streak_bonus_cap', (cfg ->> 'streakBonusCap')::integer, 'tries_per_door', tries,
    'rarity_points', cfg -> 'rarityPoints', 'doors', doors);
end;
$$;

-- Aperçu GRATUIT : le score de la tenue actuelle pour une porte (ne consomme aucun essai).
create or replace function public.videur_preview(p_door text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  cfg  jsonb := private.cfg() -> 'VIDEUR';
  v_door jsonb;
  code public.videur_codes;
  ev   jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select x into v_door from jsonb_array_elements(cfg -> 'doors') x where x ->> 'id' = p_door;
  if v_door is null then raise exception 'Porte inconnue'; end if;

  code := private.videur_code_for(private.videur_day(), p_door);
  ev := private.videur_eval(uid, code.rules);
  return ev || jsonb_build_object(
    'door', p_door,
    'min_style', (v_door ->> 'minStyle')::integer, 'min_rarity', (v_door ->> 'minRarity')::integer,
    'style_ok', (ev ->> 'style')::integer >= (v_door ->> 'minStyle')::integer,
    'rarity_ok', (ev ->> 'rarity_points')::integer >= (v_door ->> 'minRarity')::integer);
end;
$$;

-- Se présenter à une porte : consomme un essai, renvoie le verdict et verse le Flow si on entre.
create or replace function public.videur_enter(p_door text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  today   date := private.videur_day();
  cfg     jsonb := private.cfg() -> 'VIDEUR';
  tries   integer := (cfg ->> 'triesPerDoor')::integer;
  v_door  jsonb;
  v_prev  text := null;
  d       jsonb;
  code    public.videur_codes;
  used    integer;
  ev      jsonb;
  style_ok  boolean;
  rarity_ok boolean;
  v_passed boolean;
  gained  integer := 0;
  bonus   integer := 0;
  before_streak integer := 0;
  v_kind  text;
  line    text;
  total   integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  perform pg_advisory_xact_lock(hashtext('videur:' || uid::text)); -- pas de double envoi simultané

  -- La porte demandée et la précédente.
  for d in select * from jsonb_array_elements(cfg -> 'doors') loop
    if d ->> 'id' = p_door then v_door := d; exit; end if;
    v_prev := d ->> 'id';
  end loop;
  if v_door is null then raise exception 'Porte inconnue'; end if;

  if v_prev is not null and not exists (select 1 from public.videur_attempts
                                       where user_id = uid and day = today and door = v_prev and passed) then
    raise exception 'Cette porte est verrouillée : passe d''abord la précédente';
  end if;
  if exists (select 1 from public.videur_attempts where user_id = uid and day = today and door = p_door and passed) then
    raise exception 'Tu es déjà entré ici aujourd''hui';
  end if;
  select count(*) into used from public.videur_attempts where user_id = uid and day = today and door = p_door;
  if used >= tries then raise exception 'Plus d''essai pour cette porte aujourd''hui'; end if;

  code := private.videur_code_for(today, p_door);
  ev := private.videur_eval(uid, code.rules);
  if jsonb_array_length(ev -> 'pieces') = 0 then raise exception 'Porte au moins une pièce pour te présenter'; end if;

  style_ok  := (ev ->> 'style')::integer >= (v_door ->> 'minStyle')::integer;
  rarity_ok := (ev ->> 'rarity_points')::integer >= (v_door ->> 'minRarity')::integer;
  v_passed := style_ok and rarity_ok;

  if v_passed then
    gained := (v_door ->> 'flow')::integer;
    if p_door = 'bar' then
      -- Bonus de série : +1 par jour d'affilée (hier compris), plafonné.
      before_streak := private.videur_streak(uid, today - 1);
      bonus := least(before_streak, (cfg ->> 'streakBonusCap')::integer);
      gained := gained + bonus;
    end if;
    update public.profiles set flow = flow + gained where id = uid;
  end if;

  insert into public.videur_attempts (user_id, day, door, code_id, style, rarity, passed, flow_gained, outfit)
  values (uid, today, p_door, code.id, (ev ->> 'style')::integer, (ev ->> 'rarity_points')::integer, v_passed, gained, ev -> 'pieces');

  v_kind := case when v_passed then 'enter' when not style_ok and not rarity_ok then 'refuse_both'
               when not style_ok then 'refuse_style' else 'refuse_rarity' end;
  select l.text into line from public.videur_lines l where l.door = p_door and l.kind = v_kind order by random() limit 1;
  select flow into total from public.profiles where id = uid;

  return ev || jsonb_build_object(
    'door', p_door, 'passed', v_passed, 'style_ok', style_ok, 'rarity_ok', rarity_ok,
    'min_style', (v_door ->> 'minStyle')::integer, 'min_rarity', (v_door ->> 'minRarity')::integer,
    'line', coalesce(line, ''), 'flow_gained', gained, 'streak_bonus', bonus,
    'streak', case when v_passed and p_door = 'bar' then before_streak + 1 else null end,
    'tries_left', tries - used - 1, 'flow', total);
end;
$$;

-- ============================================================
-- 6. Statistiques (lecture dans le SQL Editor, comme les vues de la 0010)
-- ============================================================
create or replace view public.analytics_videur_daily as
  select day, door, count(*) as attempts, count(*) filter (where passed) as passes,
         count(distinct user_id) as players, coalesce(sum(flow_gained), 0) as flow_given
    from public.videur_attempts
   group by day, door
   order by day desc, door;
revoke all on public.analytics_videur_daily from anon, authenticated;

-- ============================================================
-- 7. Droits
-- ============================================================
revoke execute on function public.get_videur_night()   from public, anon;
revoke execute on function public.videur_preview(text) from public, anon;
revoke execute on function public.videur_enter(text)   from public, anon;
grant  execute on function public.get_videur_night()   to authenticated;
grant  execute on function public.videur_preview(text) to authenticated;
grant  execute on function public.videur_enter(text)   to authenticated;
