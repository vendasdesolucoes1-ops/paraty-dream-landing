// Função legada desativada (auditoria de 15/10/2026, R-01).
//
// Não tinha tela no painel, não exigia login e chamava gpt-4o-mini e DALL·E 3
// sem teto de custo. O fluxo atual de conteúdo é o Imagery Engine
// (imagery-plan-post → imagery-orchestrate → imagery-publish-instagram).
//
// O arquivo continua existindo para que o próximo deploy SUBSTITUA a versão
// publicada por esta, que só responde 410. Para remover de vez:
//   supabase functions delete generate-post
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Função desativada" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
