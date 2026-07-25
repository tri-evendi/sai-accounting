import Link from "next/link";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/constants";
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { DocumentPreviewButton } from "./document-preview-button";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("document.read");
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
      <PageHeader
        title="Dokumen"
        actions={<Link href="/documents/upload"><Button>+ Unggah Dokumen</Button></Link>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Dokumen Tersimpan ({totalCount})</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nama File</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Kontrak</TableHead>
              <TableHead>Diunggah</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<FileText className="h-12 w-12" />}
                    title="Belum ada dokumen"
                    description="Simpan salinan dokumen ekspor (B/L, PEB, packing list) di sini agar mudah dicari saat dibutuhkan."
                    actionLabel="+ Unggah Dokumen"
                    actionHref="/documents/upload"
                  />
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell><a href={doc.filepath} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{doc.filename}</a></TableCell>
                  <TableCell className="text-muted-foreground">
                    {doc.type ? DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {doc.contract ? doc.contract.contractNo : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(doc.uploadedAt)}</TableCell>
                  <TableCell className="text-right">
                    <DocumentPreviewButton filename={doc.filename} filepath={doc.filepath} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination currentPage={page} totalPages={totalPages} basePath="/documents" searchParams={params} />
      </Card>
    </div>
  );
}
