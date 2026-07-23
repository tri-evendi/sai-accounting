import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/page-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function ConsigneeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession(["bos", "core"]);
  const { id } = await params;

  const consignee = await prisma.consignee.findUnique({
    where: { id: parseInt(id) },
    include: { _count: { select: { contracts: true } } },
  });

  if (!consignee) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[{ label: "Penerima Barang", href: "/consignees" }, { label: consignee.name }]}
        title={consignee.name}
        badge={
          consignee.isActive ? (
            <Badge variant="success">Aktif</Badge>
          ) : (
            <Badge variant="default">Nonaktif</Badge>
          )
        }
        actions={
          <>
            <Link href={`/consignees/${consignee.id}/edit`}>
              <Button variant="secondary">Ubah</Button>
            </Link>
            <Link href="/consignees">
              <Button variant="ghost">Kembali</Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader><CardTitle>Informasi Penerima Barang</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Nama</dt>
              <dd className="text-sm text-foreground">{consignee.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Negara</dt>
              <dd className="text-sm text-foreground">{consignee.country || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Kontak / PIC</dt>
              <dd className="text-sm text-foreground">{consignee.contact || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Kontrak Terkait</dt>
              <dd className="text-sm text-foreground">{consignee._count.contracts}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">Alamat</dt>
              <dd className="text-sm text-foreground whitespace-pre-line">{consignee.address || "-"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-muted-foreground">Catatan</dt>
              <dd className="text-sm text-foreground whitespace-pre-line">{consignee.notes || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Dibuat</dt>
              <dd className="text-sm text-foreground">{formatDate(consignee.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
