import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PostMarketing, PostMarketingStatus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STATUS_STYLES: Record<PostMarketingStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  publicado: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  agendado: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  erro: "bg-red-100 text-red-800 hover:bg-red-100",
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
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-display text-primary">Histórico de posts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Miniatura</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum post gerado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      {post.imagem_url ? (
                        <img
                          src={post.imagem_url}
                          alt=""
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {post.titulo || "Sem título"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`font-normal ${STATUS_STYLES[post.status]}`}>
                        {STATUS_LABELS[post.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {post.instagram_post_id ? (
                        <a
                          href={`https://www.instagram.com/p/${post.instagram_post_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-forest-deep hover:text-accent"
                        >
                          Ver <ExternalLink className="h-3.5 w-3.5" />
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
            <p className="text-sm text-muted-foreground">
              Página {currentPage} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
