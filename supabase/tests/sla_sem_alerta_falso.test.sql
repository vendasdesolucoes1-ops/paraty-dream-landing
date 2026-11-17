-- SLA: só conta como "esperando" o que pede resposta.
\set ON_ERROR_STOP 1
begin;
do $$
begin
  assert not public.msg_pede_resposta('reactionMessage', '', true), 'reação não pede resposta';
  assert not public.msg_pede_resposta('reactionMessage', '', false), 'reação nunca pede resposta';
  assert not public.msg_pede_resposta('templateMessage', '', false), 'template de empresa';
  assert not public.msg_pede_resposta('secretEncryptedMessage', null, false), 'mensagem de sistema';
  assert not public.msg_pede_resposta('conversation', 'Ok', true), '"Ok" depois de resposta';
  assert not public.msg_pede_resposta('conversation', 'Beleza!', true), '"Beleza!"';
  assert not public.msg_pede_resposta('conversation', 'Valeu deixa p la ....', true), 'despedida';
  assert not public.msg_pede_resposta('conversation', 'obrigada', true), '"obrigada"';
  assert not public.msg_pede_resposta('conversation', '👍🙏', true), 'só emoji';
  assert not public.msg_pede_resposta('stickerMessage', '', true), 'figurinha';

  assert public.msg_pede_resposta('conversation', 'Ok', false), '"Ok" sem resposta nossa antes ainda conta';
  assert public.msg_pede_resposta('conversation', 'Boa tarde!', true), 'cumprimento pede resposta';
  assert public.msg_pede_resposta('conversation', 'Ok, e qual o valor?', true), 'ok com pergunta';
  assert public.msg_pede_resposta('imageMessage', '', true), 'imagem pede atenção';
  assert public.msg_pede_resposta('audioMessage', '', true), 'áudio pede atenção';
  assert public.msg_pede_resposta(null, 'Se', true), 'mensagem cortada';
end $$;
rollback;
