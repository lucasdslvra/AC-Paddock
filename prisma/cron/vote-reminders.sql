-- Rappel « plus que 30 minutes pour voter » (lib/soirees/vote-reminder.ts).
--
-- À exécuter UNE FOIS dans l'éditeur SQL de Supabase (Dashboard → SQL Editor), APRÈS
-- `expired-mod-files.sql` : ce fichier réutilise ses deux secrets Vault (`app_base_url`,
-- `cron_secret`) et ne les recrée pas. Pas une migration Prisma, pour la même raison que
-- lui — c'est une tâche planifiée, pas le schéma.
--
-- Ce que ça met en place : toutes les 5 minutes, Postgres appelle
-- `/api/maintenance/vote-reminders`. L'application cherche les soirées dont le vote
-- ferme dans moins de 30 minutes et qui n'ont pas encore eu leur rappel, et poste dans
-- le salon Discord du serveur un message qui mentionne les inscrits qui n'ont pas voté
-- ou pas fini. Une fois par soirée (`Soiree.voteReminderSentAt`).
--
-- Toutes les 5 minutes et non toutes les heures : le rappel vise une demi-heure, il part
-- donc entre 30 et 25 minutes avant la fermeture. Presque tous les appels ne trouvent
-- rien — ils coûtent une requête indexée.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Les extensions (déjà là si expired-mod-files.sql a été exécuté)
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La fonction appelée par le planificateur
-- ─────────────────────────────────────────────────────────────────────────────
-- Même construction que `request_expired_mod_files_sweep` : les secrets sont relus à
-- chaque exécution, et `search_path` est vide parce que la fonction est
-- `security definer`.

create or replace function public.request_vote_reminders()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url     text;
  cron_secret text;
  request_id  bigint;
begin
  select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if app_url is null or cron_secret is null then
    raise exception
      'Rappels de vote : secrets Vault « app_base_url » et/ou « cron_secret » absents — voir prisma/cron/expired-mod-files.sql';
  end if;

  select net.http_post(
    url     := app_url || '/api/maintenance/vote-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into request_id;

  return request_id;
end;
$$;

-- Personne d'autre que le planificateur n'a à l'appeler : `security definer` lit Vault.
revoke all on function public.request_vote_reminders() from public, anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Le planificateur
-- ─────────────────────────────────────────────────────────────────────────────
-- Toutes les 5 minutes. `cron.schedule` met à jour le job s'il porte déjà ce nom : ce
-- bloc est rejouable tel quel.

select cron.schedule(
  'vote-reminders',
  '*/5 * * * *',
  $job$ select public.request_vote_reminders(); $job$
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vérifier tout de suite
-- ─────────────────────────────────────────────────────────────────────────────
--   select public.request_vote_reminders();
--
-- puis, une seconde plus tard :
--   select status_code, content
--     from net._http_response
--    order by created desc
--    limit 1;
--
-- Attendu : 200, et un corps du type {"checked":0,"reminded":0,"mentioned":0}.
-- 401 → le secret Vault ne correspond pas à `CRON_SECRET`.
-- 503 → `CRON_SECRET` n'est pas défini côté application.


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Exploitation
-- ─────────────────────────────────────────────────────────────────────────────
-- Les exécutions passées :
--   select * from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'vote-reminders')
--    order by start_time desc limit 20;
--
-- Rejouer le rappel d'une soirée (il ne part qu'une fois) :
--   update "Soiree" set "voteReminderSentAt" = null where id = '<id>';
--
-- Arrêter la tâche :
--   select cron.unschedule('vote-reminders');
