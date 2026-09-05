"use client";

/**
 * Pemilih pembeli untuk formulir Kontrak (migrasi 0057).
 *
 * ── KENAPA ADA ─────────────────────────────────────────────────────────────
 * `contracts.buyer` dulu satu-satunya identitas pembeli, dan ia teks bebas.
 * Akibatnya "PT Maju Jaya", "PT. Maju Jaya", dan "Maju Jaya" adalah tiga
 * pembeli berbeda yang tidak bisa direkonsiliasi, dan faktur — yang sejak #35
 * memang menunjuk `customers` lewat FK — tidak punya apa pun untuk dicocokkan
 * dengan kontrak sumbernya. Isian ini memberi kontrak kaki yang sama.
 *
 * ── DUA ISIAN, DAN KEDUANYA PUNYA TUGAS ────────────────────────────────────
 * Pemilih menetapkan TAUTAN (`customerId`); kotak teks di bawahnya menetapkan
 * NAMA YANG TERCETAK (`buyer`). Keduanya tidak berlebihan:
 *
 *   • Saat sebuah pelanggan terpilih, kotak teksnya diisi dari master dan
 *     dikunci — nama di kontrak dan nama di master tidak boleh berselisih pada
 *     dokumen yang baru dibuat.
 *   • Saat tidak ada yang terpilih (kontrak WARISAN yang sedang disunting),
 *     kotak teksnya kembali bisa diketik dan tetap menjadi identitas pembeli.
 *     Pola yang sama dengan `consignee`/`consigneeId` sejak #22: teks lama tidak
 *     pernah hilang hanya karena masternya belakangan ada.
 *
 * Yang TIDAK dilakukan: mencerminkan perubahan nama master ke kontrak lama.
 * `buyer` adalah snapshot saat kontrak dibuat, sama seperti
 * `contract_items.item_name` terhadap master barang — kontrak yang sudah
 * ditandatangani tidak berubah bunyinya karena seseorang merapikan ejaan di
 * master enam bulan kemudian.
 */

import { useEffect, useState } from "react";
import { Flex, theme, Typography } from "antd";
import { Link } from "@/components/ui/app-link";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Label, RequiredMark } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";
import { fetchOptionList } from "@/lib/option-list";

interface CustomerOption {
  id: number;
  name: string;
  npwp: string | null;
  taxExempt: boolean;
}

export interface ContractCustomerRef {
  id: number;
  name: string;
}

interface CustomerSelectProps {
  /** Master pelanggan yang terpilih, atau null bila kontrak hanya punya teks. */
  customerId: number | null;
  onCustomerIdChange: (id: number | null) => void;
  /** Nama tercetak (`contracts.buyer`) — dikendalikan pemanggil. */
  buyer: string;
  onBuyerChange: (name: string) => void;
  /**
   * Beri tanda wajib dan `aria-required` pada pemilihnya. Dipakai formulir
   * kontrak BARU; formulir sunting membiarkannya mati supaya kontrak warisan
   * yang belum tertaut tetap bisa disimpan.
   */
  requireMaster?: boolean;
  /**
   * Pelanggan yang sedang tertaut pada kontrak ini (`customerRef`), bila ada.
   * Dititipkan supaya pelanggan yang sudah DINONAKTIFKAN tetap tampil sebagai
   * pilihan berjalan — daftar aktif-saja akan menjatuhkannya, dan menyimpan
   * ulang akan diam-diam memutus tautannya.
   */
  current?: ContractCustomerRef | null;
}

/** Id tetap — `aria-describedby` harus menunjuk simpul yang sungguh ada. */
const BUYER_HINT_ID = "buyer-hint";

function describe(c: CustomerOption, taxExemptLabel: string): string | undefined {
  return [c.npwp, c.taxExempt ? taxExemptLabel : null].filter(Boolean).join(" · ") || undefined;
}

export function CustomerSelect({
  customerId,
  onCustomerIdChange,
  buyer,
  onBuyerChange,
  requireMaster = false,
  current,
}: CustomerSelectProps) {
  const t = useT();
  const { token } = theme.useToken();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  /* Gagal memuat ≠ master kosong. Formulir kontrak MEWAJIBKAN pelanggan dari
     master, jadi daftar yang kosong karena kegagalan tidak sekadar
     membingungkan — ia membuat kontraknya mustahil disimpan, tanpa satu kata
     pun tentang sebabnya. */
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchOptionList<CustomerOption>("/api/customers?active=1");
      if (cancelled) return;
      setLoadFailed(data == null);
      setCustomers(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const exempt = t("contracts.buyerTaxExempt");
  const options: SearchableOption[] = customers.map((c) => ({
    value: String(c.id),
    label: c.name,
    description: describe(c, exempt),
  }));

  if (current && !options.some((o) => o.value === String(current.id))) {
    options.unshift({
      value: String(current.id),
      label: t("contracts.buyerInactiveSuffix", { name: current.name }),
    });
  }

  /** Memilih master menetapkan tautan DAN menyalin namanya ke teks tercetak. */
  function handlePick(value: string | null) {
    if (value == null) {
      onCustomerIdChange(null);
      return;
    }
    const id = Number(value);
    onCustomerIdChange(id);
    const picked = customers.find((c) => c.id === id);
    const name = picked?.name ?? (current?.id === id ? current.name : null);
    if (name) onBuyerChange(name);
  }

  const linked = customerId != null;

  return (
    /* `gridColumn: "1 / -1"` — sama dengan `ConsigneeSelect`: benar di kedua
       lebar, sebab di 375px kisinya memang satu kolom. */
    <Flex vertical gap={token.marginXS} style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "grid", gap: token.marginXXS }}>
        <Label htmlFor="customerId">
          {t("contracts.buyerMasterField")}
          {requireMaster && <RequiredMark />}
        </Label>
        <SearchableSelect
          id="customerId"
          placeholder={t("contracts.buyerMasterPlaceholder")}
          emptyText={t("contracts.buyerNoMatch")}
          options={options}
          value={customerId != null ? String(customerId) : null}
          onChange={handlePick}
        />
      </div>
      {loadFailed && (
        /* Kegagalan yang MENYEBUT dirinya. Tanpa baris ini, daftar kosong
           terbaca sebagai "belum ada satu pun di master" — dan pengguna
           menambahkan yang sebenarnya sudah ada. */
        <Typography.Text
          role="alert"
          style={{ fontSize: token.fontSizeSM, color: token.colorError }}
        >
          {t("common.optionsLoadFailed")}
        </Typography.Text>
      )}
      <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
        {t("contracts.buyerNotInMaster")}{" "}
        {/* Garis bawahnya TETAP, bukan hanya saat hover: tautan di tengah
            kalimat, dan warna sendirian bukan penanda yang cukup
            (MASTER.md §Anti-Patterns). Warnanya `--ant-color-link`
            (= `colorBrandText`, 5,65:1), pola `learn-more.tsx`. */}
        <Link
          href="/customers/new"
          target="_blank"
          style={{ color: "var(--ant-color-link)", textDecoration: "underline" }}
        >
          {t("contracts.buyerAddLink")}
        </Link>
        {t("contracts.buyerAddTail")}
      </Typography.Text>
      <div style={{ display: "grid", gap: token.marginXXS }}>
        <Input
          id="buyer"
          name="buyer"
          label={t("contracts.buyerField")}
          value={buyer}
          onChange={(e) => onBuyerChange(e.target.value)}
          /* Terkunci saat tertaut: nama tercetak MENGIKUTI master, jadi
             mengetik di sini hanya akan membuat satu dokumen menyebut dua nama
             untuk satu pihak. Lepaskan pilihannya bila memang perlu teks lain.
             `readOnly`, BUKAN `disabled`: isian mati tidak ikut terkirim, dan
             `buyer` wajib — mematikannya akan membuat setiap kontrak yang
             pembelinya terpilih ditolak skema. */
          readOnly={linked}
          required
          aria-describedby={BUYER_HINT_ID}
        />
        <Typography.Text
          id={BUYER_HINT_ID}
          type="secondary"
          style={{ fontSize: token.fontSizeSM }}
        >
          {linked ? t("contracts.buyerFollowsMaster") : t("contracts.buyerLegacyHint")}
        </Typography.Text>
      </div>
    </Flex>
  );
}
