-- Migration gerada pelo Lovable com data anterior à que mudou o retorno da
-- função; em produção ela foi aplicada depois. Num banco novo, cair o retorno
-- antigo antes reproduz a ordem real.
drop function if exists public.upsert_lead_from_form(text, text, text, text, numeric, text);
