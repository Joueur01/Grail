-- Grail — migration 0030 : KIT DE DÉPART. Voir CLAUDE.md, sections 6 et 19.
-- À exécuter APRÈS la 0029 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Pourquoi : un nouveau joueur doit pouvoir passer le Bar dès le premier jour. Le Bar demande 4 points de
-- rareté (Commune = 1 point) et un dress code ; trois Communes ne font que 3 points.
--
-- Règle (décision du développeur, 29 octobre 2026) : une seule fois par compte, le joueur CHOISIT une marque
-- et reçoit, en Commun : un haut (sinon une veste), un bas, des chaussures de cette marque + une 4e pièce (tête, sinon cou,
-- sinon sac) — soit 4 points de rareté — et 2 boosters offerts (colonne bonus_stock, hors du plafond du stock
-- gratuit : voir la 0026). Les coloris sont tirés au hasard parmi ceux de la pièce.
--
-- Qui : tous les comptes qui n'ont pas encore récupéré leur kit (les joueurs déjà inscrits aussi : le site le
-- leur propose à la prochaine ouverture). Pour le réserver aux seuls nouveaux comptes, remplir starter_kit_at
-- des comptes existants : update public.profiles set starter_kit_at = now() where starter_kit_at is null;
--
-- Les cartes sont données avec private.give_cards (comme open_booster) : le déclencheur de la 0018 et la
-- collection fonctionnent comme d'habitude. Le site équipe ensuite les pièces avec set_equipped (validé par le serveur).
-- Réglage : economy_config.STARTER.boosters (2 par défaut ; copie d'affichage : STARTER_KIT dans economy-config.js).

alter table public.profiles add column if not exists starter_kit_at timestamptz;

-- Réglage (on ne remplace pas une valeur déjà réglée à la main).
update public.economy_config
   set config = config || jsonb_build_object('STARTER', jsonb_build_object('boosters', 2)),
       updated_at = now()
 where id = 1 and not (config ? 'STARTER');

-- Le « haut » du kit : un haut, sinon une veste (SIGNAL/9 n'a que des vestes à l'emplacement haut).
create or replace function private.kit_top_slot(p_brand text)
returns text
language sql
stable
set search_path = ''
as $$
  select s.slot
    from (values ('haut', 1), ('veste', 2)) as s(slot, ord)
   where exists (select 1 from public.pieces pc join public.colorways c on c.piece_id = pc.id
                  where pc.brand_id = p_brand and pc.slot = s.slot)
   order by s.ord limit 1;
$$;

-- Une marque est proposée si elle a un haut (ou une veste), un bas et des chaussures, avec un coloris chacun.
create or replace function private.kit_brand_ok(p_brand text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.kit_top_slot(p_brand) is not null
     and (select count(distinct pc.slot)
            from public.pieces pc
           where pc.brand_id = p_brand
             and pc.slot in ('bas', 'chaussures')
             and exists (select 1 from public.colorways c where c.piece_id = pc.id)) = 2;
$$;

-- État du kit : déjà récupéré ? marques proposées ? combien de boosters ?
create or replace function public.starter_kit_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  done boolean;
  n    integer := coalesce((private.cfg() -> 'STARTER' ->> 'boosters')::integer, 2);
begin
  if uid is null then raise exception 'Non connecté'; end if;
  select starter_kit_at is not null into done from public.profiles where id = uid;
  if not found then raise exception 'Profil introuvable'; end if;
  return jsonb_build_object(
    'claimed', done,
    'boosters', n,
    'brands', case when done then '[]'::jsonb
                   else (select coalesce(jsonb_agg(b.id order by b.id), '[]'::jsonb)
                           from public.brands b where private.kit_brand_ok(b.id)) end
  );
end;
$$;

-- Récupération du kit : tout ou rien, une seule fois (la ligne du profil est verrouillée).
create or replace function public.claim_starter_kit(p_brand text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  p     public.profiles%rowtype;
  n     integer := coalesce((private.cfg() -> 'STARTER' ->> 'boosters')::integer, 2);
  v_slot text;
  v_cid  text;
  got    jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Non connecté'; end if;

  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Profil introuvable'; end if;
  if p.starter_kit_at is not null then raise exception 'Kit de départ déjà récupéré'; end if;
  if p_brand is null or not exists (select 1 from public.brands b where b.id = p_brand)
     or not private.kit_brand_ok(p_brand) then
    raise exception 'Marque inconnue';
  end if;

  -- Un haut (ou une veste), un bas, des chaussures.
  foreach v_slot in array array[private.kit_top_slot(p_brand), 'bas', 'chaussures'] loop
    select c.id into v_cid
      from public.pieces pc join public.colorways c on c.piece_id = pc.id
     where pc.brand_id = p_brand and pc.slot = v_slot
     order by random() limit 1;
    perform private.give_cards(uid, v_cid, 'commun'::public.rarity, 1);
    got := got || jsonb_build_object('slot', v_slot, 'colorway_id', v_cid, 'rarity', 'commun');
  end loop;

  -- 4e pièce : tête, sinon cou, sinon sac (si la marque en a une).
  select c.id, pc.slot into v_cid, v_slot
    from public.pieces pc join public.colorways c on c.piece_id = pc.id
   where pc.brand_id = p_brand and pc.slot in ('tete', 'cou', 'sac')
   order by array_position(array['tete', 'cou', 'sac'], pc.slot), random() limit 1;
  if found then
    perform private.give_cards(uid, v_cid, 'commun'::public.rarity, 1);
    got := got || jsonb_build_object('slot', v_slot, 'colorway_id', v_cid, 'rarity', 'commun');
  end if;

  update public.profiles set bonus_stock = bonus_stock + n, starter_kit_at = now() where id = uid;

  return jsonb_build_object('brand', p_brand, 'cards', got, 'boosters', n);
end;
$$;

revoke execute on function private.kit_top_slot(text)   from public, anon, authenticated;
revoke execute on function private.kit_brand_ok(text)   from public, anon, authenticated;
revoke execute on function public.starter_kit_state()   from public, anon;
revoke execute on function public.claim_starter_kit(text) from public, anon;
grant  execute on function public.starter_kit_state()   to authenticated;
grant  execute on function public.claim_starter_kit(text) to authenticated;
