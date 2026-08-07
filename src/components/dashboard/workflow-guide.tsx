/**
 * Panel "Alur Kerja" (panduan urutan) di Beranda.
 *
 * Menjawab "mulai dari mana?": tiap alur digambar sebagai langkah bernomor yang
 * bisa diklik, sehingga pengguna awam melihat URUTAN kerja (Kontrak → Catat
 * Penjualan → Terima Uang → Pantau Piutang), bukan sekadar daftar menu. Server
 * component — daftar alur & langkah sudah disaring izin di server
 * (`visibleWorkflows`), jadi langkah yang tak boleh dipakai tak dikirim.
 *
 * Warna nada (masuk/keluar/netral) hanya aksen; makna dibawa NOMOR + LABEL,
 * jadi tak melanggar aturan "jangan warna saja" MASTER.md.
 *
 * ── Tanpa satu kelas Tailwind pun (issue #240, fase C9) ────────────────────
 * Berkas ini **tidak boleh mengimpor `antd`** — beranda tetap server component
 * (dijaga `tests/rsc-boundary.test.ts`), dan `tests/workflow-guide.test.tsx`
 * merendernya dengan `renderToStaticMarkup` tanpa peramban. Warnanya karena itu
 * `var(--ant-…)`, yang sejak #227 teratasi di mana pun.
 *
 * ⚠ PANAH PENGHUBUNG ANTAR-LANGKAH DIHAPUS, bukan dipindahkan — keputusan yang
 * sama dengan garis penghubung `document-chain-timeline` (#227), karena
 * sebabnya sama. Panah itu dulu `rotate-90 md:rotate-0`: ia menunjuk ke BAWAH
 * di layar sempit dan ke KANAN di layar lebar, dan kebenarannya bergantung pada
 * satu titik patah yang harus tetap cocok dengan titik patah tata letaknya.
 * Susunan langkah kini membungkus sendiri sesuai lebar (`flex-wrap`), jadi tidak
 * ada lagi cara mengetahui apakah langkah berikutnya ada di kanan atau di baris
 * bawah — dan panah yang menunjuk ke tempat yang salah lebih buruk daripada
 * tidak ada panah. Urutannya tetap terbaca: nomor "1."–"n" ada di setiap
 * langkah, dan `<ol>`-nya tetap daftar berurutan.
 */
import { Link } from "@/components/ui/app-link";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  LockOutlined,
  MoneyCollectOutlined,
  NodeIndexOutlined,
  ReconciliationOutlined,
  ShoppingCartOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import type { IconComponent } from "@/lib/icons";
import type { Workflow, WorkflowTone } from "@/lib/workflows";
import type { TranslateFn } from "@/lib/i18n/client";

/**
 * `lib/workflows.ts` tetap menyebut ikon dengan NAMA LAMA: modul itu
 * murni data dan tidak boleh tahu paket ikon mana yang menggambarnya (pola yang
 * sama dengan `lib/nav.ts` → `layout/sidebar.tsx`, issue #201). Yang berpindah
 * ke `@ant-design/icons` adalah NILAI peta ini.
 */
const ICONS: Record<string, IconComponent> = {
  FileText: FileTextOutlined,
  Receipt: FileDoneOutlined,
  ArrowDownLeft: ArrowDownOutlined,
  ArrowUpRight: ArrowUpOutlined,
  HandCoins: MoneyCollectOutlined,
  ShoppingCart: ShoppingCartOutlined,
  Wallet: WalletOutlined,
  Scale: ReconciliationOutlined,
  Lock: LockOutlined,
  BarChart3: BarChartOutlined,
};

/**
 * Bulatan nomor langkah. Latar TIPIS + teks anak tangga uang (#186), aturan
 * `Tag` (#187) — warna pekat sebagai teks pada 14px hanya 2,21:1.
 */
const TONE_BADGE: Record<WorkflowTone, React.CSSProperties> = {
  in: {
    background: "var(--ant-color-success-bg)",
    color: "var(--ant-color-money-positive)",
  },
  out: {
    background: "var(--ant-color-error-bg)",
    color: "var(--ant-color-money-negative)",
  },
  neutral: {
    background: "var(--ant-color-primary-bg)",
    color: "var(--ant-color-link)",
  },
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

const HINT: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

const LIST: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin)",
};

/** Kartu satu alur — `rounded-xl border bg-card p-4 shadow-sm`. */
const FLOW_CARD: React.CSSProperties = {
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  boxShadow: "var(--ant-box-shadow-tertiary)",
};

const FLOW_TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

const FLOW_DESC: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

/**
 * Lebar dasar satu langkah. Menggantikan `md:flex-row`: langkahnya membagi baris
 * dan turun sendiri saat tak muat, jadi 375px memberi satu kolom dan 1440px
 * memberi empat — tanpa titik patah yang harus dijaga.
 */
const STEP_BASIS = 220;

const STEPS: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--ant-margin-xs)",
  margin: 0,
  marginTop: "var(--ant-margin)",
  padding: 0,
  listStyle: "none",
};

const STEP_ITEM: React.CSSProperties = {
  display: "flex",
  flex: `1 1 ${STEP_BASIS}px`,
  minWidth: 0,
  listStyle: "none",
};

/** Kartu langkah — `rounded-lg border bg-background p-3`. */
const STEP_LINK: React.CSSProperties = {
  display: "flex",
  width: "100%",
  alignItems: "flex-start",
  gap: "var(--ant-margin-sm)",
  padding: "var(--ant-padding-sm)",
  borderRadius: "var(--ant-border-radius)",
  border: "var(--ant-line-width) solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-layout)",
  color: "var(--ant-color-text)",
};

/** Bulatan nomor `h-7 w-7`. */
const STEP_NUMBER: React.CSSProperties = {
  display: "flex",
  width: 28,
  height: 28,
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  fontSize: "var(--ant-font-size)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  fontVariantNumeric: "tabular-nums",
};

const STEP_LABEL_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  flexWrap: "wrap",
};

const STEP_LABEL: React.CSSProperties = {
  fontSize: "var(--ant-font-size)",
  fontWeight: "var(--ant-font-weight-strong)" as React.CSSProperties["fontWeight"],
  color: "var(--ant-color-text)",
};

/** Lencana "Opsional" — teks, bukan warna saja. */
const STEP_OPTIONAL: React.CSSProperties = {
  borderRadius: "var(--ant-border-radius-sm)",
  background: "var(--ant-color-fill-tertiary)",
  paddingInline: "var(--ant-padding-xxs)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "var(--ant-color-text-secondary)",
};

const STEP_DESC: React.CSSProperties = {
  display: "block",
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1.375,
  color: "var(--ant-color-text-secondary)",
};

/*
 * `t` datang sebagai PROP, bukan dari `getT()` di dalam komponen.
 *
 * Panel ini dirender-uji tanpa peramban (`tests/workflow-guide.test.tsx`,
 * `renderToStaticMarkup`), dan `getT()` menyeret `server-only` + `cookies()`
 * yang tak ada di lingkungan tes. Menerima penerjemahnya membuat komponen ini
 * tetap sinkron & murni-tampilan: halaman server meneruskan `await getT()`,
 * tesnya meneruskan penerjemah dari `id.json` — jadi teks yang diperiksa tes
 * tetap teks yang sesungguhnya, bukan tiruan.
 */
export function WorkflowGuide({
  workflows,
  t,
}: {
  workflows: Workflow[];
  t: TranslateFn;
}) {
  if (workflows.length === 0) return null;

  return (
    <section data-tour="alur-kerja" aria-labelledby="alur-judul">
      <div style={HEAD_ROW}>
        <NodeIndexOutlined
          aria-hidden="true"
          style={{ fontSize: 20, color: "var(--ant-color-link)" }}
        />
        <h2 id="alur-judul" style={TITLE}>
          {t("dashboard.workflowTitle")}
        </h2>
      </div>
      <p style={HINT}>{t("dashboard.workflowHint")}</p>

      <div style={LIST}>
        {workflows.map((wf) => (
          <div key={wf.id} style={FLOW_CARD}>
            <h3 style={FLOW_TITLE}>{t(wf.labelKey)}</h3>
            <p style={FLOW_DESC}>{t(wf.descriptionKey)}</p>

            <ol style={STEPS}>
              {wf.steps.map((step, i) => {
                const Icon = ICONS[step.icon] ?? FileTextOutlined;
                return (
                  <li key={step.href} style={STEP_ITEM}>
                    <Link href={step.href} style={STEP_LINK}>
                      <span
                        style={{ ...STEP_NUMBER, ...TONE_BADGE[wf.tone] }}
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={STEP_LABEL_ROW}>
                          <Icon
                            aria-hidden="true"
                            style={{
                              fontSize: 16,
                              flexShrink: 0,
                              color: "var(--ant-color-text-secondary)",
                            }}
                          />
                          <span style={STEP_LABEL}>{t(step.labelKey)}</span>
                          {step.optional && (
                            <span style={STEP_OPTIONAL}>{t("dashboard.workflowOptional")}</span>
                          )}
                        </span>
                        <span style={STEP_DESC}>{t(step.descriptionKey)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
