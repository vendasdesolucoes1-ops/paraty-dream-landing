import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PostMarketing, PostMarketingStatus } from "@/lib/types";
import { Pill, type Tone } from "@/components/ds/pill";
import { Bloco } from "@/components/ds/bloco";
import { atraso } from "@/components/ds/reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 10;

const STATUS_TONES: Record<PostMarketingStatus, Tone> = {
  rascunho: "neutral",
  publicado: "success",
  agendado: "warning",
  erro: "danger",
};

const STATUS_LABELS: Record<PostMarketingStatus, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  agendado: "Agendado",
  erro: "Erro",
};

export function PostsHistoryTable({ refreshKey }: { refreshKey?: number }) {
  const [page, setPage] = useState(1);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts-marketing", refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts_marketing")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PostMarketing[];
    },
  });

  const total = posts?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = (posts ?? []).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <Bloco titulo="Histórico de posts">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Miniatura</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="pr-5 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-12 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-4">
                    <EmptyState icon={ImageIcon} title="Nenhum post gerado ainda." />
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((post, i) => (
                  <TableRow key={post.id} className="animate-swap" style={atraso(i, 40, 320)}>
                    <TableCell className="pl-5">
                      {post.imagem_url ? (
                        <img
                          src={post.imagem_url}
                          alt=""
                          className="h-12 w-12 rounded-lg object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted ring-1 ring-border" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium">
                      {post.titulo || "Sem título"}
                    </TableCell>
                    <TableCell>
                      <Pill tone={STATUS_TONES[post.status]} dot>
                        {STATUS_LABELS[post.status]}
                      </Pill>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      {post.instagram_post_id ? (
                        <a
                          href={`https://www.instagram.com/p/${post.instagram_post_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Ver <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm tabular-nums text-muted-foreground">
              Página {currentPage} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próximo
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Bloco>
  );
}
