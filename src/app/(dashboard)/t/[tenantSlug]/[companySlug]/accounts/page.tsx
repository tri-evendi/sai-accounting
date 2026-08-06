/**
 * Daftar Akun (COA) — dikonversi ke token Ant Design pada issue #196.
 *
 * **Tetap server component**, jadi tanpa `antd` dan tanpa `theme.useToken()`
 * (`tests/rsc-boundary.test.ts`). Warna: primitif yang mewarnai dirinya sendiri
 * (`Badge`) + variabel `--ant-…` yang HANYA dipakai di dalam pohon `<Card>`.
 *
 * ── Kenapa BUKAN `Table` `expandable` AntD ────────────────────────────────
 * Issue #196 menyebut COA berjenjang sebagai kandidat kuat `expandable`, dan
 * itu diukur lebih dulu, bukan ditolak karena selera. `expandable` hanya ada
 * pada `Table` AntD, yang berarti `DataTable` — komponen client. Halaman ini
 * merender SELURUH daftar akun tanpa paginasi (COA impor Accurate biasa berisi
 * 200–600 baris, dan tak ada batas atasnya di skema); memindahkannya berarti
 * menyalin seluruh COA ke payload RSC sebagai JSON DI ATAS HTML yang sudah
 * dirender, lalu menghidrasi rc-table di atasnya — biaya yang terukur ±80 KB
 * gzip per rute (#199) ditambah data COA-nya sendiri.
 *
 * Yang dibeli dengan biaya itu adalah melipat cabang. Halaman ini sudah punya
 * jawaban yang lebih murah untuk pertanyaan yang sama, dan jawabannya dirender
 * di server: kotak pencarian kode/nama yang MERATAKAN hierarki saat aktif.
 * Karena itu perendernya `StaticTable` dan hierarkinya diratakan lebih dulu
 * menjadi baris ber-`depth` (aturan #189: perender dipilih menurut kebutuhan
 * INTERAKTIVITAS, bukan kerapatan atau kemewahan).
 */
import { requirePagePermission } from "@/lib/page-auth";
import type { TenantScopedParams } from "@/lib/tenant-routes";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StaticTable } from "@/components/ui/static-table";
import type { SaiColumns } from "@/components/ui/table-columns";
import { TextInput } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { accountTypeLabel } from "@/lib/i18n/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { ListTree } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Link } from "@/components/ui/app-link";

export const dynamic = "force-dynamic";

/** `marginXS` 8 · `marginLG` 24 — token AntD sebagai angka, karena berkas ini
 *  tak boleh memanggil `theme.useToken()`. */
const CONTROL_GAP = 8;
const SECTION_GAP = 24;
/** Lebar nyaman kotak pencarian (`max-w-xs` lama = 20rem). */
const SEARCH_MAX_WIDTH = 320;
/** Ikon keadaan kosong — `h-12 w-12` lama. */
const EMPTY_ICON_SIZE = 48;
/** Lekukan satu tingkat hierarki, dalam piksel. Sama seperti sebelum migrasi. */
const INDENT = 20;

/** Satu baris daftar, sudah diratakan dari pohonnya. */
interface AccountRow {
  id: number;
  code: string;
  name: string;
  depth: number;
  type: string;
  currency: string;
  normalBalance: string;
  isActive: boolean;
}

export default async function AccountsPage({
  params,
  searchParams,
}: {
  params: Promise<TenantScopedParams>;
  searchParams: Promise<{ search?: string }>;
}) {
  await requirePagePermission("account.manage", params);
  const t = await getT();
  const dictionary = await getDictionary(await getLocale());
  const { search } = await searchParams;
  const q = (search ?? "").trim();

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });

  const toRow = (a: (typeof accounts)[number], depth: number): AccountRow => ({
    id: a.id,
    code: a.code,
    name: a.name,
    depth,
    type: a.type,
    currency: a.currency,
    normalBalance: a.normalBalance,
    isActive: a.isActive,
  });

  const rows: AccountRow[] = [];
  if (q) {
    // Saat mencari, hierarki tak bermakna (induk bisa tak cocok) — tampilkan
    // daftar rata hasil cocok berdasarkan kode atau nama.
    const needle = q.toLowerCase();
    for (const a of accounts) {
      if (a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)) {
        rows.push(toRow(a, 0));
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
        rows.push(toRow(a, depth));
        walk(a.id, depth + 1);
      }
    };
    walk(null, 0);
  }

  /** Sel keterangan — hierarki kedua setelah kode & nama. */
  const muted = (value: React.ReactNode) => (
    <span style={{ color: "var(--ant-color-text-secondary)" }}>{value}</span>
  );

  const columns: SaiColumns<AccountRow> = [
    {
      key: "code",
      dataIndex: "code",
      title: t("accounts.colCode"),
      align: "left",
      render: (_v, row) => (
        <span
          style={{
            fontFamily: "var(--ant-font-family-code)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.code}
        </span>
      ),
    },
    {
      key: "name",
      dataIndex: "name",
      title: t("accounts.nameField"),
      align: "left",
      render: (_v, row) => (
        <span style={{ display: "inline-block", paddingLeft: row.depth * INDENT }}>
          {/* Penanda kedalaman berupa BENTUK, bukan warna — ia tetap terbaca
              saat halaman dicetak hitam-putih. */}
          {row.depth > 0 && (
            <span aria-hidden="true" style={{ color: "var(--ant-color-text-secondary)" }}>
              └{" "}
            </span>
          )}
          <Link
            href={`/accounts/${row.id}/edit`}
            style={{
              color: "var(--ant-color-link)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            {row.name}
          </Link>
        </span>
      ),
    },
    {
      key: "type",
      dataIndex: "type",
      title: t("accounts.colType"),
      align: "left",
      render: (_v, row) => muted(accountTypeLabel(dictionary, row.type)),
    },
    {
      key: "currency",
      dataIndex: "currency",
      title: t("common.currency"),
      align: "left",
      render: (_v, row) => muted(row.currency),
    },
    {
      key: "normalBalance",
      dataIndex: "normalBalance",
      title: t("accounts.colNormalBalance"),
      align: "left",
      render: (_v, row) =>
        muted(row.normalBalance === "debit" ? t("common.debit") : t("common.credit")),
    },
    {
      key: "isActive",
      dataIndex: "isActive",
      title: t("common.status"),
      align: "left",
      // Akun DINONAKTIFKAN, bukan dihapus — karena itu baris nonaktif tetap
      // tampil, dan statusnya yang membedakannya.
      render: (_v, row) =>
        row.isActive ? (
          <Badge variant="success">{t("common.active")}</Badge>
        ) : (
          <Badge variant="default">{t("common.inactive")}</Badge>
        ),
    },
  ];

  return (
    <div>
      {/* Jumlah di judul = baris yang BENAR-BENAR tampil: saat pencarian
          aktif, memakai accounts.length akan menyebut total tak tersaring. */}
      <PageHeader
        title={t("accounts.title", { count: rows.length })}
        actions={
          <>
            <Link href="/accounts/import">
              <Button variant="secondary">{t("accounts.importFromExcel")}</Button>
            </Link>
            <Link href="/accounts/new">
              <Button>{t("accounts.addNew")}</Button>
            </Link>
          </>
        }
      />

      {/* Pencarian kode/nama — berguna saat daftar akun sudah panjang, dan
          sekaligus pengganti "lipat cabang" yang tidak menyeret satu baris
          JavaScript pun (lihat kepala berkas). */}
      <form
        action="/accounts"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: CONTROL_GAP,
          marginBottom: SECTION_GAP,
        }}
      >
        <TextInput
          type="search"
          name="search"
          defaultValue={q}
          placeholder={t("accounts.searchPlaceholder")}
          style={{ flex: `1 1 ${SEARCH_MAX_WIDTH}px`, maxWidth: SEARCH_MAX_WIDTH }}
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
        <StaticTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            q ? (
              <EmptyState
                icon={<ListTree size={EMPTY_ICON_SIZE} />}
                title={t("accounts.emptySearchTitle")}
                description={t("accounts.emptySearchDescription", { query: q })}
              />
            ) : (
              <EmptyState
                icon={<ListTree size={EMPTY_ICON_SIZE} />}
                title={t("accounts.emptyTitle")}
                description={t("accounts.emptyDescription")}
                actionLabel={t("accounts.importFromExcel")}
                actionHref="/accounts/import"
              />
            )
          }
        />
      </Card>
    </div>
  );
}
