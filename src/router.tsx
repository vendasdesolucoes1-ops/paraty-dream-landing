import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Sem estes padrões o QueryClient nasce com staleTime 0: toda query é
// considerada obsoleta no instante em que chega, e cada montagem de componente
// refaz a busca. Como trocar de aba no dashboard desmonta e remonta a rota,
// isso significava rebuscar leads, lotes, visitas e profile a cada clique na
// sidebar — mesmo tendo acabado de carregar tudo.
//
// 30s é curto o bastante para o CRM não parecer desatualizado, e de qualquer
// forma a subscription realtime de `leads` invalida na hora em que um lead
// muda. Os 10 minutos de gcTime evitam o outro sintoma: passar mais que o
// padrão (5 min) numa aba fazia a anterior voltar do zero, com tela de
// carregamento em vez de dado em cache.
const CACHE_DEFAULTS = {
  queries: {
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  },
} as const;

export const getRouter = () => {
  const queryClient = new QueryClient({ defaultOptions: CACHE_DEFAULTS });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
