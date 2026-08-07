/**
 * Spanduk "stok menipis" di beranda.
 *
 * ── Tanpa satu kelas Tailwind pun (issue #240, fase C9) ────────────────────
 * Server component: beranda membaca buku besar lewat Prisma, jadi berkas ini
 * **tidak boleh mengimpor `antd`** (dijaga `tests/rsc-boundary.test.ts`).
 * Warnanya `var(--ant-…)`, sah di server component sejak #227.
 *
 * Pasangan warnanya mengikuti aturan `Tag` (#187): latar TIPIS
 * (`colorWarningBg`) dengan teks anak tangga uang `colorMoneyPending` (#186) —
 * `colorWarning` pekat sebagai teks 14px hanya 1,90:1. Ikon segitiga boleh
 * memakai warna pekat: sebagai grafis ambangnya 3:1, bukan 4,5:1.
 *
 * Peringatan tidak pernah warna saja: ada ikon, kalimat berisi jumlah barang,
 * dan daftar nama barangnya.
 */
import { Link } from "@/components/ui/app-link";
import { WarningOutlined } from "@ant-design/icons";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { getT } from "@/lib/i18n/server";

export type LowStockAlertItem = {
  name: string;
  currentStock: number;
  unit: string | null;
};

const BANNER: React.CSSProperties = {
  borderRadius: "var(--ant-border-radius-lg)",
  border: "var(--ant-line-width) solid var(--ant-color-warning-border)",
  background: "var(--ant-color-warning-bg)",
  paddingInline: "var(--ant-padding)",
  paddingBlock: "var(--ant-padding-sm)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-money-pending)",
};

const ITEM_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--ant-margin)",
};

const TRUNCATE: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export async function StockAlertBanner({ items }: { items: LowStockAlertItem[] }) {
  if (items.length === 0) return null;

  const t = await getT();

  const preview = items.slice(0, 5);
  const remaining = items.length - preview.length;

  return (
    <div role="alert" style={BANNER}>
      <div style={{ display: "flex", gap: "var(--ant-margin-sm)" }}>
        <WarningOutlined
          aria-hidden="true"
          style={{ fontSize: 20, flexShrink: 0, marginTop: 2, color: "var(--ant-color-warning)" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
            }}
          >
            {t("dashboard.lowStockTitle", {
              count: items.length,
              threshold: LOW_STOCK_THRESHOLD,
            })}
          </p>
          <ul
            style={{
              margin: 0,
              marginTop: "var(--ant-margin-xs)",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "var(--ant-margin-xxs)",
            }}
          >
            {preview.map((item) => (
              <li key={item.name} style={{ ...ITEM_ROW, listStyle: "none" }}>
                <span style={TRUNCATE}>{item.name}</span>
                <span
                  style={{ flexShrink: 0, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
                >
                  {item.currentStock} {item.unit || t("dashboard.lowStockUnit")}
                </span>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <p
              style={{
                margin: 0,
                marginTop: "var(--ant-margin-xxs)",
                fontSize: "var(--ant-font-size-sm)",
              }}
            >
              {t("dashboard.lowStockMore", { count: remaining })}
            </p>
          )}
          <Link
            href="/inventory/opname"
            style={{
              display: "inline-block",
              marginTop: "var(--ant-margin-xs)",
              fontSize: "var(--ant-font-size-sm)",
              fontWeight: 500,
              color: "var(--ant-color-money-pending)",
              textDecoration: "underline",
            }}
          >
            {t("dashboard.lowStockLink")}
          </Link>
        </div>
      </div>
    </div>
  );
}
