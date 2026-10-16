# Risco de banimento do número (Evolution) e plano de continuidade

Issue #63. Decisão de 15/10/2026: não usar a API oficial do WhatsApp.

## 1. Registro do risco

| Campo | Conteúdo |
| --- | --- |
| Risco | O número de WhatsApp usado pela Sophia e pelos envios automáticos ser restringido ou banido. |
| Causa | A Evolution usa Baileys, que automatiza um WhatsApp comum. Mensagens automáticas por esse caminho estão fora dos termos do WhatsApp. Denúncias de usuários e volume atípico aumentam a chance de bloqueio. |
| Impacto | Para todo o atendimento pelo número: respostas da Sophia, primeiro contato, lembretes de visita, follow-up e campanhas. Leads em conversa ficam sem resposta até a troca de número. |
| Probabilidade | Média. Cresce com campanhas para quem não pediu contato e com opt-out alto. |
| Mitigações em produção | Regras de envio em `pode_enviar()` (janela 9h–20h, sem domingos e feriados, limite diário por instância, rampa de aquecimento de número novo, no máximo 2 tentativas sem resposta, pausa automática de cadência com opt-out alto, opt-out por palavra-chave respeitado em tudo); campanhas só para quem tem base legal (configurável); alerta da fila. |
| Alternativa descartada | API oficial do WhatsApp (Cloud API): elimina o risco de banimento por automação, mas exige templates aprovados e custo por conversa. |
| Risco residual | Aceito. |
| Responsável pelo aceite | _(nome e cargo)_ |
| Data do aceite | _(data)_ |
| Revisão | Trimestral, ou imediatamente após qualquer restrição do número. |

Assinatura do responsável: ______________________

## 2. Indicadores de alerta precoce (semanal)

Fonte: painel **Cadências → Métricas** (`followup_metricas()`) e
**Saúde da fila** (`saude_fila_completa()`).

| Indicador | Verde | Amarelo (revisar textos e volume) | Vermelho (pausar campanhas) |
| --- | --- | --- | --- |
| Opt-out por etapa | < 2% | 2–5% | > 5% (a cadência já pausa sozinha no limite configurado) |
| Respondidos em 72 h por etapa | > 15% | 5–15% | < 5% |
| Entregues / enviados | > 95% | 85–95% | < 85% (sinal de restrição do número) |
| Erros de envio em 24 h | 0–2 | 3–10 | > 10 |

Quem acompanha: _(nome)_, toda segunda-feira. Registrar os números da semana:

| Semana | Opt-out máx. por etapa | Resposta 72 h | Entrega | Erros 24 h | Ação |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Sinais de restrição iminente: queda brusca de entregues, mensagens presas em
"enviado" sem ack, aviso do próprio WhatsApp no aparelho. Diante deles: parar
campanhas e cadências (desligar a cadência no painel), manter só respostas a
quem escreveu.

## 3. Dados: um banimento derruba o canal, não o histórico

- Toda mensagem recebida ou enviada pelo sistema fica em `whatsapp_messages`
  (inclusive as enviadas pela fila, ligadas ao item que as gerou), com o lead.
- Mensagens digitadas pelo vendedor no próprio celular entram pelo eco da
  Evolution e também ficam registradas, enquanto a instância está conectada.
- O que se perde num banimento: mensagens trocadas **depois** da queda e as do
  aparelho que nunca passaram pela Evolution. Por isso a regra é: atendimento
  sempre pelo número conectado ou pelo CRM.

Conferência sugerida (mensal, em staging ou por amostragem): para 5 leads,
comparar a conversa no aparelho com a aba de conversa do CRM.

## 4. Roteiro de continuidade (o número caiu)

Objetivo: em até 4 horas, os leads ativos sabem como continuar a conversa.

1. **Confirmar a queda** (5 min): a instância aparece desconectada e não
   reconecta; o aparelho mostra aviso de restrição. O alerta da fila também
   dispara (mensagens vencidas).
2. **Congelar envios** (5 min): desligar o agente de IA e todas as cadências no
   painel. Campanhas em andamento: "Cancelar campanha".
3. **Avisar a equipe** (15 min): grupo interno de vendas e gestão, por canal
   fora do WhatsApp afetado (telefone, e-mail ou outro aplicativo).
4. **Número reserva** (1–2 h): chip reserva já cadastrado e "aquecido"
   (uso humano normal há semanas). Conectar na Evolution como nova instância
   (Configurações → WhatsApp), atualizar a URL do webhook se necessário. Para o
   número novo, o limite diário começa baixo (rampa de aquecimento).
5. **Recontato dos leads ativos** (2–4 h): lista dos leads com conversa nos
   últimos 14 dias ou visita agendada (CRM → filtro por atividade/agenda).
   - Visitas agendadas: ligação do vendedor responsável.
   - Demais: mensagem **manual, individual**, pelo número reserva, se
     apresentando como a mesma equipe. Nada de disparo em massa no número novo.
   - Lead sem telefone válido para ligação: e-mail, se houver.
6. **Comunicação pública** (se necessário): atualizar o número no site, no
   Instagram e nos anúncios.
7. **Pós-incidente** (até 1 semana): registrar data, causa provável, leads
   afetados e tempo até o recontato; revisar volume, textos e limites antes de
   religar cadências; considerar migrar para a API oficial.

Revisado pela equipe de vendas em: _(data)_ — por: _(nomes)_

## 5. Pré-requisitos (fazer antes de entrar no ar)

- [ ] Chip reserva comprado, com WhatsApp ativo e uso humano regular.
- [ ] Lista de contatos da equipe fora do WhatsApp.
- [ ] Responsável pelos indicadores semanais definido.
- [ ] `alerta_webhook_url` e `heartbeat_url` cadastrados no Vault (alerta por
      e-mail/Slack mesmo com o painel fechado).
- [ ] Este documento assinado (seção 1) e o roteiro revisado (seção 4).
