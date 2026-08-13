/**
 * Panel "Rutinitas Bulanan" — tugas akhir bulan untuk perusahaan yang sudah
 * berjalan (issue #355).
 *
 * Saudara kembar `first-steps-panel.tsx` dan sengaja SERUPA sampai ke jaraknya:
 * pengguna yang sudah belajar membaca panel Langkah Pertama pada hari pertama
 * tidak perlu belajar bentuk baru pada akhir bulan pertamanya. Yang berbeda
 * hanya judul, ikon kepala, dan bahwa panel ini KEMBALI setiap bulan alih-alih
 * menghilang selamanya.
 *
 * Server component seperti saudaranya: daftarnya sudah disaring izin efektif di
 * server (`visibleMonthlySteps`), jadi langkah yang tidak boleh dikerjakan
 * seseorang tidak ikut dikirim ke browsernya — bukan disembunyikan CSS. Tak
 * sebaris pun ikut ke bundel client, dan **`antd` tidak boleh diimpor** (beranda
 * tetap server component, dijaga `tests/rsc-boundary.test.ts`); warnanya
 * `var(--ant-…)`, sah di server component sejak #227.
 *
 * Status "sudah/belum" TIDAK pernah disampaikan lewat warna saja (MASTER.md
 * §Anti-Patterns): baris yang selesai membawa ikon centang DAN kata "Selesai";
 * yang belum membawa nomor urut dan ajakan bertindak.
 */

import { Link } from "@/components/ui/app-link";
import {
  ArrowRightOutlined,
  ArrowUpOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckOutlined,
  LockOutlined,
} from "@ant-design/icons";

import { getT } from "@/lib/i18n/server";
import type { IconComponent } from "@/lib/icons";
import type { MonthlyStep, MonthlyRoutineProgress } from "@/lib/monthly-routine";

/**
 * Nama ikon di `lib/monthly-routine.ts` tetap NAMA umum — modul itu murni data
 * dan tidak boleh tahu paket ikon mana yang menggambarnya (pola yang sama
 * dengan `lib/nav.ts` → `layout/sidebar.tsx`).
 */
const ICONS: Record<string, IconComponent> = {
  ArrowUpRight: ArrowUpOutlined,
  Landmark: BankOutlined,
  Lock: LockOutlined,
};

const HEAD_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-xs)",
  marginBottom: "var(--ant-margin-sm)",
};

const TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const SUBTITLE: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

const PANEL: React.CSSProperties = {
  overflow: "hidden",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  boxShadow: "var(--ant-box-shadow-tertiary)",
};

const PROGRESS: React.CSSProperties = {
  margin: 0,
  paddingInline: "var(--ant-padding)",
  paddingBlock: "var(--ant-padding-xs)",
  borderBottom: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-fill-quaternary)",
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
  color: "var(--ant-color-text-secondary)",
};

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin)",
  paddingInline: "var(--ant-padding)",
  paddingBlock: "var(--ant-padding-sm)",
  color: "var(--ant-color-text)",
};

const ICON_BOX: React.CSSProperties = {
  display: "flex",
  width: 40,
  height: 40,
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "var(--ant-border-radius-lg)",
};

const LABEL_ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "var(--ant-margin-xs)",
  rowGap: "var(--ant-margin-xxs)",
};

const STEP_INDEX: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  fontVariantNumeric: "tabular-nums",
  color: "var(--ant-color-text-secondary)",
};

const STEP_LABEL: React.CSSProperties = {
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const DONE_BADGE: React.CSSProperties = {
  borderRadius: 9999,
  background: "var(--ant-color-success-bg)",
  paddingInline: "var(--ant-padding-xs)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 500,
  color: "var(--ant-color-money-positive)",
};

const STEP_DESC: React.CSSProperties = {
  display: "block",
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.375,
  color: "var(--ant-color-text-secondary)",
};

const CTA: React.CSSProperties = {
  display: "flex",
  flexShrink: 0,
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
};

export async function MonthlyRoutinePanel({
  steps,
  progress,
  monthLabel,
}: {
  steps: MonthlyStep[];
  progress: MonthlyRoutineProgress;
  /** Nama bulan yang sedang dipertanggungjawabkan, mis. "Juli 2026". */
  monthLabel: string;
}) {
  if (steps.length === 0) return null;

  const t = await getT();
  const doneCount = steps.filter((step) => progress[step.key]).length;

  return (
    <section aria-labelledby="rutinitas-bulanan-judul">
      <div style={HEAD_ROW}>
        <CalendarOutlined
          aria-hidden="true"
          style={{ fontSize: 20, color: "var(--ant-color-link)" }}
        />
        <h2 id="rutinitas-bulanan-judul" style={TITLE}>
          {t("monthlyRoutine.title", { month: monthLabel })}
        </h2>
      </div>
      {/* Subjudulnya menyebut BULANNYA, bukan sekadar "akhir bulan": pengguna
          yang membuka beranda tanggal 3 perlu tahu ini tentang bulan lalu. */}
      <p style={SUBTITLE}>{t("monthlyRoutine.subtitle", { month: monthLabel })}</p>

      <div style={PANEL}>
        <p style={PROGRESS}>
          {t("monthlyRoutine.progress", { done: doneCount, total: steps.length })}
        </p>

        <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {steps.map((step, index) => {
            const Icon = ICONS[step.icon] ?? CalendarOutlined;
            const done = progress[step.key] === true;

            return (
              <li
                key={step.key}
                style={{
                  listStyle: "none",
                  borderTop:
                    index === 0
                      ? undefined
                      : "var(--ant-line-width) solid var(--ant-color-border-secondary)",
                }}
              >
                <Link href={step.href} style={ROW}>
                  <span
                    style={{
                      ...ICON_BOX,
                      background: done
                        ? "var(--ant-color-success-bg)"
                        : "var(--ant-color-primary-bg)",
                      color: done
                        ? "var(--ant-color-money-positive)"
                        : "var(--ant-color-link)",
                    }}
                    aria-hidden="true"
                  >
                    {done ? (
                      <CheckOutlined style={{ fontSize: 20 }} />
                    ) : (
                      <Icon style={{ fontSize: 20 }} />
                    )}
                  </span>

                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={LABEL_ROW}>
                      {!done && <span style={STEP_INDEX}>{index + 1}.</span>}
                      <span style={STEP_LABEL}>{t(step.labelKey)}</span>
                      {done && <span style={DONE_BADGE}>{t("monthlyRoutine.done")}</span>}
                    </span>
                    <span style={STEP_DESC}>{t(step.descriptionKey)}</span>
                  </span>

                  <span
                    style={{
                      ...CTA,
                      color: done
                        ? "var(--ant-color-text-secondary)"
                        : "var(--ant-color-link)",
                    }}
                  >
                    {done ? t("monthlyRoutine.again") : t("monthlyRoutine.start")}
                    <ArrowRightOutlined aria-hidden="true" style={{ fontSize: 16 }} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
