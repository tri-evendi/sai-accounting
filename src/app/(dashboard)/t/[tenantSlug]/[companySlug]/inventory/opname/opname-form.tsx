"use client";

/**
 * Formulir stok opname (issue #57) — hitung fisik → selisih → penyesuaian.
 *
 * Pengguna mengetik jumlah fisik per barang; selisih (fisik − sistem) dihitung
 * langsung di layar. Hanya barang yang diisi DAN berselisih yang dikirim.
 * Server menulis gerakan penyesuaian + jurnal ke akun Selisih Persediaan dalam
 * satu transaksi. Karena ini memposting jurnal, submit dikonfirmasi dulu.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flex } from "antd";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, TextInput } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StaticTable } from "@/components/ui/static-table";
import { qtyColumn, textColumn, type SaiColumns } from "@/components/ui/table-columns";
import { useToast } from "@/components/ui/toast";
import { SearchOutlined } from "@ant-design/icons";
import { formatNumber } from "@/lib/utils";
import { OpnameSheetPDFButton } from "@/components/shared/pdf-export-buttons";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";

/** `margin` 16 · `marginSM` 12 — token AntD sebagai angka. */
const SECTION_GAP = 16;
const CONTROL_GAP = 12;
/** `w-56` / `w-28` lama — lebar kotak cari & kotak hitungan fisik. */
const SEARCH_WIDTH = 224;
const COUNT_WIDTH = 112;
const EMPTY_ICON_SIZE = 48;
const STRONG = "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"];

export interface OpnameItem {
  id: number;
  name: string;
  unit: string | null;
  currentStock: number;
}

export function OpnameForm({ items }: { items: OpnameItem[] }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [query, setQuery] = useState("");
  const [showSystemQty, setShowSystemQty] = useState(false);

  /**
   * Penyaring nama barang (issue #129).
   *
   * MURNI TAMPILAN: yang disembunyikan tidak ikut terhapus dari `counts`, karena
   * state-nya berkunci id barang, bukan posisi baris. Mengetik 40 hitungan lalu
   * mencari satu nama tidak boleh membuang 39 di antaranya.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, query]);

  // Barang yang diisi DAN berselisih dari sistem — hanya ini yang disesuaikan.
  const changed = useMemo(() => {
    return items
      .map((it) => {
        const raw = counts[it.id];
        if (raw === undefined || raw.trim() === "") return null;
        const physical = Number(raw);
        if (Number.isNaN(physical)) return null;
        const variance = physical - it.currentStock;
        if (variance === 0) return null;
        return { it, physical, variance };
      })
      .filter((x): x is { it: OpnameItem; physical: number; variance: number } => x !== null);
  }, [items, counts]);

  /** Selisih yang sudah diketik tetapi sedang tersembunyi oleh penyaring. */
  const hiddenChanged = useMemo(() => {
    const shown = new Set(visible.map((it) => it.id));
    return changed.filter((c) => !shown.has(c.it.id)).length;
  }, [changed, visible]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/inventory/opname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          counts: changed.map((c) => ({ itemId: c.it.id, physicalQty: c.physical })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const fieldMsg = data.details?.fieldErrors
          ? Object.values(data.details.fieldErrors).flat().filter(Boolean)[0]
          : null;
        toast(String(fieldMsg || data.error || t("inventory.opnameFailed")), "error");
        return;
      }
      const data = await res.json();
      toast(t("inventory.opnameSaved", { count: data.adjustedCount }));
      setCounts({});
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const columns: SaiColumns<OpnameItem> = [
    {
      ...textColumn<OpnameItem>({ dataIndex: "name", title: t("common.item") }),
      render: (raw) => <span style={{ fontWeight: STRONG }}>{String(raw)}</span>,
    },
    {
      ...textColumn<OpnameItem>({ dataIndex: "unit", title: t("common.unit") }),
      render: (raw) => (
        <span style={{ color: "var(--ant-color-text-secondary)" }}>
          {raw ? String(raw) : "-"}
        </span>
      ),
    },
    qtyColumn<OpnameItem>({
      dataIndex: "currentStock",
      title: t("inventory.colSystemStock"),
    }),
    {
      key: "physical",
      title: t("inventory.colPhysicalCount"),
      align: "right",
      render: (_v, it) => (
        <TextInput
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={counts[it.id] ?? ""}
          onChange={(e) => setCounts((c) => ({ ...c, [it.id]: e.target.value }))}
          placeholder={String(it.currentStock)}
          aria-label={t("inventory.physicalCountAria", { name: it.name })}
          style={{
            width: COUNT_WIDTH,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        />
      ),
    },
    {
      key: "variance",
      title: t("inventory.colVariance"),
      align: "right",
      render: (_v, it) => {
        const raw = counts[it.id];
        const has = raw !== undefined && raw.trim() !== "" && !Number.isNaN(Number(raw));
        const variance = has ? Number(raw) - it.currentStock : null;
        if (variance === null) {
          return <span style={{ color: "var(--ant-color-text-secondary)" }}>—</span>;
        }
        if (variance === 0) {
          return (
            <span style={{ color: "var(--ant-color-text-secondary)" }}>
              {t("inventory.varianceMatch")}
            </span>
          );
        }
        // Tanda "+"/"−" adalah penanda non-warnanya; warnanya token UANG (#186),
        // yang lolos 4,5:1 sebagai teks 14px.
        return (
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              color:
                variance > 0
                  ? "var(--ant-color-money-positive)"
                  : "var(--ant-color-money-negative)",
            }}
          >
            {variance > 0 ? "+" : ""}
            {formatNumber(variance)}
          </span>
        );
      },
    },
  ];

  return (
    <Flex vertical gap={SECTION_GAP}>
      <Flex wrap align="flex-end" gap={CONTROL_GAP}>
        {/* Tak bisa menghitung fisik di masa depan; hitungan mundur sah —
            server membandingkannya dengan saldo buku per tanggal itu. */}
        <Input
          id="opname-date"
          type="date"
          label={t("inventory.opnameDateField")}
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
        />
        <Input
          id="opname-search"
          type="search"
          label={t("inventory.opnameSearchLabel")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("inventory.opnameSearchPlaceholder")}
          style={{ width: SEARCH_WIDTH }}
        />
        {/* Cetak DULU, hitung, baru ketik — urutan itulah alasan tombolnya ada
            di sebelah tanggalnya, bukan di kepala halaman. */}
        <Flex vertical gap={4}>
          <OpnameSheetPDFButton items={items} date={date} showSystemQty={showSystemQty} />
          {/* `Checkbox` AntD MEMANG sebuah `<label>` yang membungkus isian dan
              katanya — jadi kotak centang telanjang + label rakitan tangan tidak
              lagi diperlukan. */}
          <Checkbox
            checked={showSystemQty}
            onCheckedChange={setShowSystemQty}
            style={{ fontSize: "var(--ant-font-size-sm)", color: "var(--ant-color-text-secondary)" }}
          >
            {t("inventory.opnameSheetIncludeSystem")}
          </Checkbox>
        </Flex>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
          {t("inventory.opnameHint")}
        </p>
      </Flex>

      {/* Angka yang sudah diketik tapi kini tersembunyi penyaring TETAP ikut
          terkirim. Mengirim nilai yang tak terlihat di layar adalah cara
          termudah membuat penyesuaian yang tak seorang pun merasa membuatnya —
          jadi jumlahnya disebutkan, bukan didiamkan. */}
      {hiddenChanged > 0 && (
        <p
          style={{
            margin: 0,
            padding: "8px 12px",
            borderRadius: "var(--ant-border-radius)",
            background: "var(--ant-color-warning-bg)",
            color: "var(--ant-color-money-pending)",
          }}
        >
          {t("inventory.opnameHiddenCounts", { count: hiddenChanged })}
        </p>
      )}

      <div
        style={{
          borderRadius: "var(--ant-border-radius-lg)",
          border: "1px solid var(--ant-color-border-secondary)",
          overflow: "hidden",
        }}
      >
        {/*
         * `StaticTable`, bukan `DataTable`: barisnya memang berisi isian, tapi
         * tak satu pun kendali TABEL (sortir, saring, paginasi seketika) yang
         * dibutuhkan — penyaring namanya ada di atas, dan hitungannya disimpan
         * di state berkunci id barang.
         */}
        <StaticTable<OpnameItem>
          columns={columns}
          rows={visible}
          rowKey={(it) => it.id}
          empty={
            <EmptyState
              icon={<SearchOutlined style={{ fontSize: EMPTY_ICON_SIZE }} />}
              title={t("inventory.opnameNoMatch", { query })}
            />
          }
        />
      </div>

      <Flex align="center" justify="space-between" gap={CONTROL_GAP}>
        <p style={{ margin: 0, color: "var(--ant-color-text-secondary)" }}>
          {changed.length === 0
            ? t("inventory.noVariance")
            : t("inventory.varianceCount", { count: changed.length })}
        </p>
        <ConfirmDialog
          title={t("inventory.opnameConfirmTitle")}
          message={t("inventory.opnameConfirmMessage", { count: changed.length, date })}
          confirmLabel={t("inventory.opnameConfirmLabel")}
          confirmVariant="primary"
          onConfirm={submit}
          trigger={
            <Button variant="primary" disabled={changed.length === 0 || submitting}>
              {submitting ? t("common.saving") : t("inventory.opnameSubmit")}
            </Button>
          }
        />
      </Flex>
    </Flex>
  );
}
