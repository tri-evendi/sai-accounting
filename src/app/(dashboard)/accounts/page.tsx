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
import { TextInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { accountTypeLabel } from "@/lib/i18n/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { ListTree } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  await requirePagePermission("account.manage");
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const { search } = await searchParams;
  const q = (search ?? "").trim();

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });

  const rowCells = (a: (typeof accounts)[number], depth: number): ReactNode => (
    <TableRow key={a.id}>
      <TableCell className="font-mono text-foreground tabular-nums">{a.code}</TableCell>
      <TableCell>
        <span style={{ paddingLeft: depth * 20 }} className="inline-block">
          {depth > 0 && <span className="text-muted-foreground">└ </span>}
          <Link href={`/accounts/${a.id}/edit`} className="text-primary hover:underline font-medium">
            {a.name}
          </Link>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{accountTypeLabel(dictionary, a.type)}</TableCell>
      <TableCell className="text-muted-foreground">{a.currency}</TableCell>
      <TableCell className="text-muted-foreground capitalize">
        {a.normalBalance === "debit" ? t("common.debit") : t("common.credit")}
      </TableCell>
      <TableCell>
        {a.isActive ? (
          <Badge variant="success">{t("common.active")}</Badge>
        ) : (
          <Badge variant="default">{t("common.inactive")}</Badge>
        )}
      </TableCell>
    </TableRow>
  );

  const rows: ReactNode[] = [];
  if (q) {
    // Saat mencari, hierarki tak bermakna (induk bisa tak cocok) — tampilkan
    // daftar rata hasil cocok berdasarkan kode atau nama.
    const needle = q.toLowerCase();
    for (const a of accounts) {
      if (a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)) {
        rows.push(rowCells(a, 0));
      }
    }
  } else {
    // Tanpa pencarian: susun hierarki (induk dulu, lalu anak bersarang).
    const childrenOf = new Map<number | null, typeof accounts>();
    for (const a of accounts) {
      const key = a.parentId ?? null;
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(a);
    }
    const walk = (parentId: number | null, depth: number) => {
      for (const a of childrenOf.get(parentId) ?? []) {
        rows.push(rowCells(a, depth));
        walk(a.id, depth + 1);
      }
    };
    walk(null, 0);
  }

  return (
    <div>
      <PageHeader
        title={t("accounts.title", { count: accounts.length })}
        actions={
          <>
            <Link href="/accounts/import" className="shrink-0">
              <Button variant="secondary">{t("accounts.importFromExcel")}</Button>
            </Link>
            <Link href="/accounts/new" className="shrink-0">
              <Button>{t("accounts.addNew")}</Button>
            </Link>
          </>
        }
      />

      {/* Pencarian kode/nama — berguna saat daftar akun sudah panjang. */}
      <form className="mb-4 flex gap-2" action="/accounts">
        <TextInput
          type="search"
          name="search"
          defaultValue={q}
          placeholder={t("accounts.searchPlaceholder")}
          className="w-full max-w-xs"
        />
        <Button type="submit" variant="secondary" size="sm">
          {t("common.search")}
        </Button>
        {q && (
          <Link href="/accounts">
            <Button type="button" variant="ghost" size="sm">
              {t("accounts.clearSearch")}
            </Button>
          </Link>
        )}
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("accounts.colCode")}</TableHead>
              <TableHead>{t("accounts.nameField")}</TableHead>
              <TableHead>{t("accounts.colType")}</TableHead>
              <TableHead>{t("common.currency")}</TableHead>
              <TableHead>{t("accounts.colNormalBalance")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="p-0">
                  {q ? (
                    <EmptyState
                      icon={<ListTree className="h-12 w-12" />}
                      title={t("accounts.emptySearchTitle")}
                      description={t("accounts.emptySearchDescription", { query: q })}
                    />
                  ) : (
                    <EmptyState
                      icon={<ListTree className="h-12 w-12" />}
                      title={t("accounts.emptyTitle")}
                      description={t("accounts.emptyDescription")}
                      actionLabel={t("accounts.importFromExcel")}
                      actionHref="/accounts/import"
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
