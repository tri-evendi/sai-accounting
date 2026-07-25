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
      <TableCell className="text-muted-foreground">{accountTypeLabel(a.type)}</TableCell>
      <TableCell className="text-muted-foreground">{a.currency}</TableCell>
      <TableCell className="text-muted-foreground capitalize">
        {a.normalBalance === "debit" ? "Debit" : "Kredit"}
      </TableCell>
      <TableCell>
        {a.isActive ? (
          <Badge variant="success">Aktif</Badge>
        ) : (
          <Badge variant="default">Nonaktif</Badge>
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
        <TextInput
          type="search"
          name="search"
          defaultValue={q}
          placeholder="Cari kode atau nama akun…"
          className="w-full max-w-xs"
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
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Kode</TableHead>
              <TableHead>Nama Akun</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Mata Uang</TableHead>
              <TableHead>Saldo Normal</TableHead>
              <TableHead>Status</TableHead>
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
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
