import Link from "next/link";
import { type DocumentType } from "@/lib/constants";
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
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { documentTypeLabels } from "@/lib/i18n/labels";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePagePermission("document.read");
  const t = await getT();
  const typeLabels = documentTypeLabels(await getDictionary(await getLocale()));
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
        title={t("nav.items.documents")}
        actions={
          <Link href="/documents/upload">
            <Button>{t("documents.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("documents.listTitle", { count: totalCount })}</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("documents.colFilename")}</TableHead>
              <TableHead>{t("suppliers.colType")}</TableHead>
              <TableHead>{t("nav.items.contracts")}</TableHead>
              <TableHead>{t("documents.colUploadedAt")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EmptyState
                    icon={<FileText className="h-12 w-12" />}
                    title={t("documents.emptyTitle")}
                    description={t("documents.emptyDescription")}
                    actionLabel={t("documents.addNew")}
                    actionHref="/documents/upload"
                  />
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell><a href={doc.filepath} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{doc.filename}</a></TableCell>
                  <TableCell className="text-muted-foreground">
                    {doc.type ? typeLabels[doc.type as DocumentType] ?? doc.type : "-"}
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
