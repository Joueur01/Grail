-- Grail — migration 0007 : mots interdits dans les pseudos.
-- À exécuter APRÈS la 0006 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Deux listes, comparées au pseudo « normalisé » (minuscules, sans « _ », chiffres lookalike
-- remplacés : 0→o 1→i 3→e 4→a 5→s 7→t, donc « h1tl3r » = « hitler ») :
--   * blocked_words  : le mot est interdit PARTOUT dans le pseudo (mots longs et sans ambiguïté) ;
--   * blocked_exact  : le pseudo ne peut pas être EXACTEMENT ce mot (mots courts ou ambigus :
--     « sex » est refusé, mais « essex » ou « Sexton » passent ; « bite » refusé, « habite » accepté).
-- Les lettres répétées sont aussi vues (« fuuuck » est refusé). Moins de 3 caractères : déjà refusé.
-- Complète à la main : insert into public.blocked_words (word) values ('mot');

create table if not exists public.blocked_exact (
  word text primary key check (word = lower(word))
);
alter table public.blocked_exact enable row level security;
revoke all on public.blocked_exact from anon, authenticated;

-- « modo » (posé par la 0005) bloquait « commodore » : il devient un mot exact.
delete from public.blocked_words where word = 'modo';

insert into public.blocked_words (word) values
  ('grail'), ('grailgame'), ('admin'), ('administrateur'), ('administrator'), ('moderateur'),
  ('moderator'), ('staff'), ('support'), ('assistance'), ('officiel'),
  ('official'), ('helpdesk'), ('supabase'), ('anthropic'), ('claude'), ('gamemaster'),
  ('fondateur'), ('giveaway'), ('freecoins'), ('freeboosters'), ('piecesgratuites'), ('paypal'),
  ('virement'), ('rembours'), ('recharge'), ('whatsapp'), ('telegram'), ('discordgg'),
  ('bitcoin'), ('crypto'), ('connard'), ('connasse'), ('enculer'), ('encule'),
  ('salope'), ('salaud'), ('putain'), ('merde'), ('bordel'), ('batard'),
  ('niquer'), ('tagueule'), ('tapette'), ('tarlouze'), ('gouine'), ('sousmerde'),
  ('trouduc'), ('trouducul'), ('couille'), ('foutre'), ('branleur'), ('branler'),
  ('suceur'), ('sucer'), ('pouffiasse'), ('ordure'), ('cretin'), ('debile'),
  ('attarde'), ('chatte'), ('salopard'), ('enfoire'), ('fuck'), ('shit'),
  ('bitch'), ('bastard'), ('asshole'), ('dickhead'), ('cocksucker'), ('pussy'),
  ('cunt'), ('whore'), ('slut'), ('wanker'), ('twat'), ('retard'),
  ('faggot'), ('tranny'), ('nigger'), ('nigga'), ('negre'), ('bougnoule'),
  ('bicot'), ('youpin'), ('feuj'), ('salejuif'), ('chinetoque'), ('bamboula'),
  ('salearabe'), ('salenoir'), ('pdeuh'), ('nazisme'), ('neonazi'), ('hitler'),
  ('siegheil'), ('kkk'), ('whitepower'), ('jihad'), ('daesh'), ('terroriste'),
  ('terrorist'), ('porn'), ('porno'), ('nsfw'), ('onlyfans'), ('pedophile'),
  ('violeur'), ('rapist'), ('inceste'), ('suicide'), ('suicid'), ('massacre'),
  ('schoolshooter')
on conflict do nothing;

insert into public.blocked_exact (word) values
  ('modo'),
  ('systeme'), ('system'), ('service'), ('equipe'), ('team'), ('owner'),
  ('con'), ('cons'), ('cu'), ('cul'), ('cule'), ('tg'),
  ('pd'), ('ntm'), ('fdp'), ('mod'), ('dev'), ('root'),
  ('null'), ('undefined'), ('anonymous'), ('anonyme'), ('moi'), ('me'),
  ('vous'), ('tous'), ('all'), ('everyone'), ('here'), ('test'),
  ('tester'), ('joueur'), ('player'), ('user'), ('users'), ('guest'),
  ('invite'), ('sex'), ('bz'), ('pute'), ('nique'), ('pede'),
  ('pedo'), ('bite'), ('dick'), ('cock'), ('fag'), ('dyke'),
  ('mongol'), ('negro'), ('raton'), ('nazi'), ('nazis'), ('heil'),
  ('sieg'), ('isis'), ('sexe'), ('nude'), ('nudes'), ('viol'),
  ('rape'), ('kill'), ('tuer'), ('bombe'), ('bomb'), ('shooter'),
  ('bot'), ('kys'), ('ceo')
on conflict do nothing;

-- Vrai si le pseudo est autorisé.
create or replace function private.pseudo_allowed(p_pseudo text)
returns boolean
language plpgsql
stable
as $$
declare
  norm      text := translate(replace(lower(p_pseudo), '_', ''), '013457', 'oieast');
  collapsed text := regexp_replace(norm, '(.)\1+', '\1', 'g'); -- « fuuuck » → « fuck »
begin
  if exists (
    select 1 from public.blocked_words w
     where norm like '%' || w.word || '%' or collapsed like '%' || w.word || '%'
  ) then return false; end if;
  if exists (
    select 1 from public.blocked_exact w where norm = w.word or collapsed = w.word
  ) then return false; end if;
  return true;
end;
$$;

-- set_pseudo : identique à la 0006, sauf le contrôle des mots interdits (private.pseudo_allowed).
create or replace function public.set_pseudo(p_pseudo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  p     text := btrim(p_pseudo);
  cur   text;
  last  timestamptz;
  days  integer := coalesce((private.cfg() -> 'FRIENDS' ->> 'pseudoChangeDays')::integer, 30);
  left_days integer;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if p is null or p !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Pseudo invalide : 3 à 16 caractères, lettres, chiffres ou _';
  end if;

  if not private.pseudo_allowed(p) then
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
    update public.profiles set pseudo = p, pseudo_changed_at = case when cur is null then null else now() end where id = uid;
  exception when unique_violation then
    raise exception 'Ce pseudo est déjà pris';
  end;
end;
$$;

revoke execute on function private.pseudo_allowed(text) from public, anon, authenticated;
revoke execute on function public.set_pseudo(text) from public, anon;
grant  execute on function public.set_pseudo(text) to authenticated;
