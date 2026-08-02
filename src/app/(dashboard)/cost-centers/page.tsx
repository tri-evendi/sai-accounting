/**
 * Pusat Biaya — master dimensi (issue #91).
 *
 * Daftar hierarkis (induk dulu, anak bersarang), pola yang sama dengan Daftar
 * Akun. Tidak ada tombol hapus, dan itu disengaja: pusat biaya yang pernah
 * disebut baris jurnal harus tetap terbaca namanya selamanya, jadi cara
 * menyingkirkannya adalah menonaktifkannya lewat form Ubah.
 */
import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getT } from "@/lib/i18n/server";
import { Split } from "lucide-react";
import { Link } from "@/components/ui/app-link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function CostCentersPage() {
  await requirePagePermission("cost_center.manage");
  const t = await getT();

  const costCenters = await prisma.costCenter.findMany({ orderBy: { code: "asc" } });

  const childrenOf = new Map<number | null, typeof costCenters>();
  for (const c of costCenters) {
    const key = c.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(c);
  }

  const rows: ReactNode[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const c of childrenOf.get(parentId) ?? []) {
      rows.push(
        <TableRow key={c.id}>
          <TableCell className="font-mono text-foreground tabular-nums">{c.code}</TableCell>
          <TableCell>
            <span style={{ paddingLeft: depth * 20 }} className="inline-block">
              {depth > 0 && <span className="text-muted-foreground">└ </span>}
              <Link
                href={`/cost-centers/${c.id}/edit`}
                className="font-medium text-primary hover:underline"
              >
                {c.name}
              </Link>
            </span>
          </TableCell>
          <TableCell className="text-muted-foreground tabular-nums">
            {(childrenOf.get(c.id) ?? []).length || "—"}
          </TableCell>
          <TableCell>
            {c.isActive ? (
              <Badge variant="success">{t("common.active")}</Badge>
            ) : (
              <Badge variant="default">{t("common.inactive")}</Badge>
            )}
          </TableCell>
        </TableRow>
      );
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);

  return (
    <div>
      <PageHeader
        title={t("costCenters.title", { count: costCenters.length })}
        description={t("costCenters.intro")}
        actions={
          <Link href="/cost-centers/new" className="shrink-0">
            <Button>{t("costCenters.addNew")}</Button>
          </Link>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("costCenters.codeField")}</TableHead>
              <TableHead>{t("costCenters.nameField")}</TableHead>
              <TableHead>{t("costCenters.colChildren")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <EmptyState
                    icon={<Split className="h-12 w-12" />}
                    title={t("costCenters.emptyTitle")}
                    description={t("costCenters.emptyDescription")}
                    actionLabel={t("costCenters.addNew")}
                    actionHref="/cost-centers/new"
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
