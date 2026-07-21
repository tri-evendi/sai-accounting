import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/page-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Breadcrumb } from "@/components/ui/breadcrumb";

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
      <Breadcrumb items={[{ label: "Consignees", href: "/consignees" }, { label: consignee.name }]} />
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{consignee.name}</h1>
          {consignee.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="default">Inactive</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/consignees/${consignee.id}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Link href="/consignees">
            <Button variant="ghost">Back</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Consignee Information</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="text-sm text-gray-900">{consignee.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Country</dt>
              <dd className="text-sm text-gray-900">{consignee.country || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Contact / PIC</dt>
              <dd className="text-sm text-gray-900">{consignee.contact || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Linked Contracts</dt>
              <dd className="text-sm text-gray-900">{consignee._count.contracts}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Address</dt>
              <dd className="text-sm text-gray-900 whitespace-pre-line">{consignee.address || "-"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Notes</dt>
              <dd className="text-sm text-gray-900 whitespace-pre-line">{consignee.notes || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="text-sm text-gray-900">{formatDate(consignee.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
