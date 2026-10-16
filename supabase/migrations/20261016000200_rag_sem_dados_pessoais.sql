-- Base de conhecimento da Sophia sem dados de pessoa física (auditoria R-10).
--
-- A linha "Procuradora" trazia nome e CPF de uma pessoa física. O texto ia ao
-- prompt, à OpenAI, e podia ser repetido a leads. A empresa continua
-- identificada pelo CNPJ nas outras linhas.
--
-- O UPDATE dispara o gatilho rag_reindexar_ao_alterar, que reconstrói
-- rag_chunks a partir do texto novo.

update public.configuracoes
   set valor = regexp_replace(valor, E'\\n?\\|\\s*Procuradora\\s*\\|[^\\n]*', '', 'g')
 where chave like 'rag\_%'
   and valor ~ '\|\s*Procuradora\s*\|';

-- Rede de segurança: qualquer CPF que tenha sobrado em qualquer chave da base.
update public.configuracoes
   set valor = regexp_replace(valor, '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}', '[removido]', 'g')
 where chave like 'rag\_%'
   and valor ~ '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}';

-- Conferência (deve dar 0 depois da reindexação):
--   select count(*) from rag_chunks where conteudo ~ '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}';
