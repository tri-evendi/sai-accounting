/**
 * Satu seksi beranda: judul + penjelas di kiri, aksi & tautan "lihat semua" di
 * kanan, isinya di bawah.
 *
 * ── Tetap SERVER component (issue #240, fase C9) ───────────────────────────
 * Beranda menjalankan belasan kueri Prisma dan merender tabelnya sebagai HTML;
 * seksi ini adalah bingkainya, jadi ia **tidak boleh mengimpor `antd`** (dijaga
 * `tests/rsc-boundary.test.ts`). Jarak & warnanya ditulis `var(--ant-…)`, yang
 * sah di server component sejak #227.
 *
 * Baris kepalanya dulu `flex-col` yang berubah jadi `sm:flex-row` — satu titik
 * patah yang harus dijaga tetap sama dengan titik patah lain. Penggantinya
 * `flex-wrap`: judul dan aksinya berdampingan selama muat dan turun sendiri
 * ketika tidak, tanpa media query mana pun.
 *
 * Prop `className` DICABUT — tidak ada pemanggil yang mengisinya, dan jalan
 * lewat untuk kelas Tailwind adalah persis yang dihapus fase ini.
 */
import { Link } from "@/components/ui/app-link";
import { getT } from "@/lib/i18n/server";

/** `space-y-5` (20px) = `marginMD`. */
const SECTION: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-md)",
};

const HEAD_ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "var(--ant-margin-sm)",
};

/** `text-lg font-semibold` — judul seksi. */
const TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const DESCRIPTION: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

const ACTIONS: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "var(--ant-margin-xs)",
};

/*
 * `--ant-color-link` (= `colorBrandText`, 5,65:1), bukan `--ant-color-primary`
 * yang sebagai teks hanya 4,10:1 — aturan yang sama dengan tautan nomor kontrak
 * di beranda.
 */
const LINK: React.CSSProperties = {
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
  color: "var(--ant-color-link)",
};

interface DashboardSectionProps {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export async function DashboardSection({
  title,
  description,
  href,
  hrefLabel,
  actions,
  children,
}: DashboardSectionProps) {
  const t = await getT();
  const linkLabel = hrefLabel ?? t("dashboard.seeAll");
  return (
    <section style={SECTION}>
      <div style={HEAD_ROW}>
        <div style={{ minWidth: 0 }}>
          <h2 style={TITLE}>{title}</h2>
          {description && <p style={DESCRIPTION}>{description}</p>}
        </div>
        <div style={ACTIONS}>
          {actions}
          {href && (
            <Link href={href} style={LINK}>
              {linkLabel} →
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
