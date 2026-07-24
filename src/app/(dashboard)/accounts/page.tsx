import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { accountTypeLabel } from "@/lib/accounting";
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
  const { search } = await searchParams;
  const q = (search ?? "").trim();

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });

  const rowCells = (a: (typeof accounts)[number], depth: number): ReactNode => (
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
        title={<>Akun Perkiraan ({accounts.length})</>}
        actions={
          <>
            <Link href="/accounts/import" className="shrink-0">
              <Button variant="secondary">Impor dari Excel</Button>
            </Link>
            <Link href="/accounts/new" className="shrink-0">
              <Button>+ Akun Baru</Button>
            </Link>
          </>
        }
      />

      {/* Pencarian kode/nama — berguna saat daftar akun sudah panjang. */}
      <form className="mb-4 flex gap-2" action="/accounts">
        <input
          type="search"
          name="search"
          defaultValue={q}
          placeholder="Cari kode atau nama akun…"
          className="h-9 w-full max-w-xs rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" variant="secondary" size="sm">
          Cari
        </Button>
        {q && (
          <Link href="/accounts">
            <Button type="button" variant="ghost" size="sm">
              Hapus
            </Button>
          </Link>
        )}
      </form>

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
                  {q ? (
                    <EmptyState
                      icon={<ListTree className="h-12 w-12" />}
                      title="Tidak ada akun yang cocok"
                      description={`Tidak ditemukan akun dengan kode atau nama "${q}". Coba kata kunci lain.`}
                    />
                  ) : (
                    <EmptyState
                      icon={<ListTree className="h-12 w-12" />}
                      title="Belum ada akun perkiraan"
                      description="Daftar akun adalah rak tempat setiap transaksi disimpan. Buat akun satu per satu, atau impor banyak sekaligus dari Excel."
                      actionLabel="Impor dari Excel"
                      actionHref="/accounts/import"
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
