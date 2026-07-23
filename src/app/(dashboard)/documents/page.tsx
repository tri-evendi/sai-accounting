import Link from "next/link";
import { requirePageSession } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const perPage = 10;

  const [documents, totalCount] = await Promise.all([
    prisma.document.findMany({
      orderBy: { uploadedAt: "desc" },
      include: { contract: true },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.document.count(),
  ]);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Dokumen</h1>
        <Link href="/documents/upload"><Button>+ Unggah Dokumen</Button></Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dokumen Tersimpan ({totalCount})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 font-medium text-muted-foreground">Nama File</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Jenis</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Kontrak</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Diunggah</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={<FileText className="h-12 w-12" />}
                      title="Belum ada dokumen"
                      description="Simpan salinan dokumen ekspor (B/L, PEB, packing list) di sini agar mudah dicari saat dibutuhkan."
                      actionLabel="+ Unggah Dokumen"
                      actionHref="/documents/upload"
                    />
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-border hover:bg-muted">
                    <td className="px-6 py-3"><a href={doc.filepath} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{doc.filename}</a></td>
                    <td className="px-6 py-3 text-muted-foreground">{doc.type || "-"}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {doc.contract ? doc.contract.contractNo : "-"}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{formatDate(doc.uploadedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/documents" searchParams={params} />
      </Card>
    </div>
  );
}
