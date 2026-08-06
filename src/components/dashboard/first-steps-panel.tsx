/**
 * Panel "Langkah Pertama" — sambutan untuk perusahaan yang belum bertransaksi.
 *
 * Server component seperti `QuickActions`: daftarnya sudah disaring izin
 * efektif di server (`visibleFirstSteps`), jadi langkah yang tidak boleh
 * dikerjakan seseorang tidak ikut dikirim ke browsernya — bukan disembunyikan
 * CSS. Tak sebaris pun ikut ke bundel client.
 *
 * Status "sudah/belum" TIDAK pernah disampaikan lewat warna saja (MASTER.md
 * §Anti-Patterns): baris yang selesai membawa ikon centang DAN kata
 * "Selesai"; yang belum membawa nomor urut dan ajakan bertindak.
 *
 * ── Tanpa satu kelas Tailwind pun (issue #240, fase C9) ────────────────────
 * Berkas ini **tidak boleh mengimpor `antd`** (beranda tetap server component,
 * dijaga `tests/rsc-boundary.test.ts`); warnanya `var(--ant-…)`, sah di server
 * component sejak #227. Dua perubahan yang terlihat di layar dan disengaja:
 *
 *  • **Garis pemisah antar-baris naik ke ATAS baris** (`borderTop` pada baris
 *    ke-2 dan seterusnya) alih-alih `border-b last:border-b-0`. Selektor
 *    `:last-child` tidak punya padanan gaya sebaris, dan menghitungnya dari
 *    INDEKS membuat aturannya terbaca di tempat yang sama dengan barisnya.
 *  • **Ajakan "Mulai →" tidak lagi disembunyikan di layar sempit** (`hidden
 *    sm:flex`). Ia satu kata dan sebuah panah di ujung baris yang tengahnya
 *    boleh menyusut; menyembunyikannya berarti pengguna ponsel — justru yang
 *    paling sering membuka beranda hari pertama — kehilangan satu-satunya
 *    petunjuk bahwa barisnya bisa ditekan.
 */

import { Link } from "@/components/ui/app-link";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  ListChecks,
  PackagePlus,
  Receipt,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { getT } from "@/lib/i18n/server";
import type { FirstStep, FirstStepProgress } from "@/lib/first-steps";

const ICONS: Record<string, LucideIcon> = {
  Users,
  Truck,
  PackagePlus,
  Receipt,
  ArrowDownLeft,
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

/** Kemajuan sebagai ANGKA di kepala panel. */
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

/** Kotak ikon `h-10 w-10 rounded-lg`. */
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

/** Lencana "Selesai" — kata, bukan warna saja. */
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

export async function FirstStepsPanel({
  steps,
  progress,
}: {
  steps: FirstStep[];
  progress: FirstStepProgress;
}) {
  if (steps.length === 0) return null;

  const t = await getT();
  const doneCount = steps.filter((step) => progress[step.key]).length;

  return (
    <section aria-labelledby="langkah-pertama-judul">
      <div style={HEAD_ROW}>
        <ListChecks size={20} style={{ color: "var(--ant-color-link)" }} aria-hidden="true" />
        <h2 id="langkah-pertama-judul" style={TITLE}>
          {t("firstSteps.title")}
        </h2>
      </div>
      <p style={SUBTITLE}>{t("firstSteps.subtitle")}</p>

      <div style={PANEL}>
        {/* Kemajuan sebagai ANGKA, bukan bilah warna: "2 dari 5" bisa dibaca
            pembaca layar dan tetap benar tanpa warna. */}
        <p style={PROGRESS}>
          {t("firstSteps.progress", { done: doneCount, total: steps.length })}
        </p>

        <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {steps.map((step, index) => {
            const Icon = ICONS[step.icon] ?? Receipt;
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
                    {done ? <Check size={20} strokeWidth={3} /> : <Icon size={20} />}
                  </span>

                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={LABEL_ROW}>
                      {/* Nomor urut hanya untuk yang BELUM: pada baris selesai
                          ia sudah digantikan centang, dan dua penanda untuk satu
                          keadaan hanya menambah bising. */}
                      {!done && <span style={STEP_INDEX}>{index + 1}.</span>}
                      <span style={STEP_LABEL}>{t(step.labelKey)}</span>
                      {done && <span style={DONE_BADGE}>{t("firstSteps.done")}</span>}
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
                    {done ? t("firstSteps.again") : t("firstSteps.start")}
                    <ArrowRight size={16} aria-hidden="true" />
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
