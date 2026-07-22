import { requireAccountantPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { accountTypeLabel } from "@/lib/accounting";
import { EmptyState } from "@/components/ui/empty-state";
import { ListTree } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  await requireAccountantPage(["bos"]);

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });

  // Group by parent to render a hierarchy (roots first, then nested children).
  const childrenOf = new Map<number | null, typeof accounts>();
  for (const a of accounts) {
    const key = a.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(a);
  }

  const rows: ReactNode[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const a of childrenOf.get(parentId) ?? []) {
      rows.push(
        <tr key={a.id} className="border-b border-border hover:bg-muted">
          <td className="px-6 py-3 font-mono text-foreground tabular-nums">{a.code}</td>
          <td className="px-6 py-3">
            <span style={{ paddingLeft: depth * 20 }} className="inline-block">
              {depth > 0 && <span className="text-muted-foreground">└ </span>}
              <Link href={`/accounts/${a.id}/edit`} className="text-primary hover:underline font-medium">
                {a.name}
              </Link>
            </span>
          </td>
          <td className="px-6 py-3 text-muted-foreground">{accountTypeLabel(a.type)}</td>
          <td className="px-6 py-3 text-muted-foreground">{a.currency}</td>
          <td className="px-6 py-3 text-muted-foreground capitalize">
            {a.normalBalance === "debit" ? "Debit" : "Kredit"}
          </td>
          <td className="px-6 py-3">
            {a.isActive ? (
              <Badge variant="success">Aktif</Badge>
            ) : (
              <Badge variant="default">Nonaktif</Badge>
            )}
          </td>
        </tr>
      );
      walk(a.id, depth + 1);
    }
  };
  walk(null, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          Akun Perkiraan ({accounts.length})
        </h1>
        <Link href="/accounts/new">
          <Button>+ Akun Baru</Button>
        </Link>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-6 py-3 font-medium text-muted-foreground">Kode</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Nama Akun</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Tipe</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Mata Uang</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Saldo Normal</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows
            ) : (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={<ListTree className="h-12 w-12" />}
                    title="Belum ada akun perkiraan"
                    description="Daftar akun adalah rak tempat setiap transaksi disimpan. Buat akun pertama Anda, atau muat template standar lewat perintah npx tsx scripts/seed-coa.ts."
                    actionLabel="+ Buat Akun"
                    actionHref="/accounts/new"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
