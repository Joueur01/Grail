-- Grail — migration 0029 : retire les droits d'écriture inutiles (audit de sécurité du 29 octobre 2026).
-- À exécuter APRÈS la 0028 (SQL Editor de Supabase). Peut être relancée sans risque.
--
-- Constat (requête d'audit « droits d'écriture des joueurs ») : la vue market_best_offers donnait à `authenticated`
-- les droits INSERT, UPDATE, DELETE et TRUNCATE (droits par défaut de Supabase sur tout objet créé dans `public`).
-- Le site ne fait que la LIRE. Une vue simple peut être modifiable et contourner la sécurité par ligne de la table
-- qu'elle lit : on ferme ce risque, même s'il est sans doute théorique ici (la vue calcule un meilleur prix).
--
-- Constat 2 : handle_new_user() (déclencheur de création de profil) était appelable par `anon` via l'API.
-- C'est une fonction de déclencheur, inutilisable directement, mais elle n'a pas à être exposée.
-- Le déclencheur continue de fonctionner : les droits d'exécution sont contrôlés à sa création, pas à chaque inscription.

revoke insert, update, delete, truncate, references, trigger on public.market_best_offers from anon, authenticated;
grant  select on public.market_best_offers to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
