/**
 * "Integrasi & jalan keluar data" — enam jalur data masuk/keluar, dan
 * SEMUANYA punya sumber di kode (#398).
 *
 * ══ KENAPA SEKSI INI ADA ═══════════════════════════════════════════════════
 * Keberatan kedua yang paling sering pada perangkat lunak pembukuan bukan
 * harga melainkan "apakah data saya terkunci di dalam" — dan halaman ini sudah
 * punya jawabannya di kode, tersebar: ekspor e-Faktur, impor & pencocokan
 * rekening koran, impor data awal dari Excel, API bertoken, ekspor ZIP/CSV
 * per PT, tiga mata uang. Tak satu pun disebut sebagai jalur; yang tersebut
 * hanya "ekspor mandiri" di seksi kepercayaan, dari sudut "bisa keluar".
 * Seksi ini menyusunnya dari sudut PEKERJAAN: apa yang masuk, apa yang keluar,
 * lewat bentuk apa.
 *
 * ══ SETIAP BUTIR PUNYA SUMBER — dan hanya butir yang punya sumber ══════════
 * `landing.md` §KLAIM HARUS PUNYA SUMBER. Yang ditulis di sini diperiksa ke
 * kode sebelum ditulis, dan yang TIDAK ada tidak ditulis (tak ada "sinkron
 * bank otomatis", tak ada "integrasi marketplace"):
 *
 *   • e-Faktur      → `lib/efaktur.ts` + `lib/efaktur-data.ts` (CSV berorientasi
 *                     DJP/Coretax; NPWP/PEB yang hilang DITANDAI — kepala berkas
 *                     itu jujur bahwa ia bukan reproduksi byte-per-byte skema
 *                     DJP, dan kalimat di sini mengikuti kejujuran itu)
 *   • rekening koran → `lib/reconciliation.ts` (impor CSV baris rekening koran)
 *                     + `lib/bank-statements.ts` (pencocokan ke buku kas)
 *   • impor data awal → `lib/import/*` + `lib/coa-import.ts`; route
 *                     `api/.../master/import` (pelanggan, pemasok, barang),
 *                     `api/.../master/opening` (piutang/utang terbuka, aset
 *                     tetap), `api/.../accounts/import` (daftar akun) —
 *                     ⚠ stok awal TIDAK lewat berkas (wisaya penyiapan), jadi
 *                     tidak disebut
 *   • API bertoken  → `app/api/v1/*` (accounts, customers, suppliers, items,
 *                     invoices, openapi.json) + `lib/api-token.ts`; token per PT
 *                     memerankan sebuah PERAN (`ApiToken.role`), bukan cakupan
 *                     sendiri
 *   • ekspor ZIP/CSV & laporan → `lib/tenant-export.ts` (+ `lib/export-csv.ts`)
 *                     dan `lib/report-export.ts` (Excel) / `lib/pdf/*` (PDF)
 *   • tiga mata uang → `CURRENCIES` di `lib/constants.ts`; kurs + nilai dasar
 *                     tersimpan per transaksi (docs/DATABASE.md §Valas)
 *
 * ══ TAUTAN DOKUMEN LEWAT `DocSlug` — atau TIDAK SAMA SEKALI ════════════════
 * Pola seksi kepercayaan: butir yang punya halaman `/docs` menautkannya, yang
 * belum punya dibiarkan TANPA tautan (`doc: null`) — menautkan ke dokumen
 * terdekat adalah penunjuk palsu. Slug bertipe `DocSlug`, jadi dokumen yang
 * dihapus ditolak `tsc`, bukan menjadi tautan mati di halaman publik.
 *
 * ══ PITA `brand`, DAFTAR TANPA KARTU ═══════════════════════════════════════
 * Seksi ini berdiri di antara "Untuk siapa" (polos, kartu bernada) dan
 * "Yang menjaga pembukuan Anda" (polos, kartu bernada); tanpa pita di antara
 * keduanya halaman ini memajang TIGA kisi kartu bernada berturut-turut.
 * Bentuknya daftar seperti seksi modul — enam jalur adalah daftar isi, bukan
 * sesuatu yang dibandingkan atau dipilih — dan pita `brand` (14%) sudah
 * diukur layak memikul teks di kedua tema. Ikonnya SATU warna
 * (`landing.md` §Daftar modul): yang dibedakan bentuk, bukan hue.
 */
import {
  ApiOutlined,
  BankOutlined,
  CloudDownloadOutlined,
  DollarOutlined,
  FileDoneOutlined,
  ImportOutlined,
} from "@ant-design/icons";
import Link from "next/link";

import {
  LANDING_NOTE,
  landingChip,
  landingGlyph,
} from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import { docsPath, type DocSlug } from "@/lib/docs";
import { getT } from "@/lib/i18n/server";

interface Pathway {
  icon: typeof ApiOutlined;
  title: string;
  body: string;
  doc: DocSlug | null;
}

export async function LandingIntegrations() {
  const t = await getT();

  const items: Pathway[] = [
    {
      icon: FileDoneOutlined,
      title: t("landing.integrationEfakturTitle"),
      body: t("landing.integrationEfakturBody"),
      /* Belum ada halaman `/docs` tentang pajak/e-Faktur — tanpa tautan. */
      doc: null,
    },
    {
      icon: BankOutlined,
      title: t("landing.integrationBankTitle"),
      body: t("landing.integrationBankBody"),
      doc: "kas-dan-bank",
    },
    {
      icon: ImportOutlined,
      title: t("landing.integrationImportTitle"),
      body: t("landing.integrationImportBody"),
      /* `saldo-awal` menempel pada `/setup` & `/master/import` (navHrefs). */
      doc: "saldo-awal",
    },
    {
      icon: ApiOutlined,
      title: t("landing.integrationApiTitle"),
      body: t("landing.integrationApiBody"),
      /* `peran-dan-izin` menempel pada `/api-tokens`: token memerankan peran. */
      doc: "peran-dan-izin",
    },
    {
      icon: CloudDownloadOutlined,
      title: t("landing.integrationExportTitle"),
      body: t("landing.integrationExportBody"),
      doc: "data-anda",
    },
    {
      icon: DollarOutlined,
      title: t("landing.integrationCurrencyTitle"),
      body: t("landing.integrationCurrencyBody"),
      /* Belum ada halaman `/docs` tentang valas — tanpa tautan. */
      doc: null,
    },
  ];

  return (
    <LandingSection id="integrasi" tone="brand">
      <LandingSectionIntro
        eyebrow={t("landing.eyebrowIntegrations")}
        title={t("landing.integrationsHeading")}
      >
        {t("landing.integrationsBody")}
      </LandingSectionIntro>

      {/* Dua kolom, kisi yang sama dengan daftar modul: baris punya kalimat
          penuh di sebelah judulnya, dan tiga kolom akan memotongnya menjadi
          dua-tiga kata per baris. */}
      <ul
        style={{
          display: "grid",
          gap: "var(--ant-margin-lg) var(--ant-margin-xl)",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(max(280px, (100% - var(--ant-margin-xl)) / 2), 1fr))",
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          padding: 0,
        }}
      >
        {items.map((item) => (
          <li
            key={item.title}
            style={{
              display: "flex",
              gap: "var(--ant-margin-sm)",
              alignItems: "flex-start",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: landingChip("brand"),
                color: landingGlyph("brand"),
                fontSize: "var(--ant-font-size)",
              }}
            >
              <item.icon />
            </span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "var(--ant-font-size-lg)",
                  fontWeight: "var(--ant-font-weight-strong)",
                }}
              >
                {item.title}
              </h3>
              <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin-xxs)" }}>
                {item.body}
              </p>
              {item.doc !== null && (
                <Link
                  href={docsPath(item.doc)}
                  data-landing-link=""
                  style={{
                    display: "inline-block",
                    marginTop: "var(--ant-margin-xs)",
                    color: "var(--ant-color-link)",
                    fontSize: "var(--ant-font-size)",
                    textDecoration: "none",
                  }}
                >
                  {t("landing.integrationItemDoc")} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </LandingSection>
  );
}
