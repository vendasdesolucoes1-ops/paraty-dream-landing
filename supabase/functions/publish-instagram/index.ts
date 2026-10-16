// Função legada desativada (auditoria de 15/10/2026, R-01).
//
// Não tinha tela no painel, não exigia login e publicava no Instagram com o
// token vindo do corpo da requisição. A publicação atual é
// imagery-publish-instagram, que exige admin ou gestor.
//
// O arquivo continua existindo para que o próximo deploy SUBSTITUA a versão
// publicada por esta, que só responde 410. Para remover de vez:
//   supabase functions delete publish-instagram
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Função desativada" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
