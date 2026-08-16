/**
 * FAQ halaman pendaratan — sebelas pertanyaan yang jawabannya SUDAH ADA di kode,
 * bukan sebelas pertanyaan yang enak dijawab.
 *
 * ══ KENAPA PERTANYAAN INI, BUKAN YANG LAIN ═════════════════════════════════
 * Pola `Pricing Page + CTA` menaruh FAQ tepat sesudah kartu harga karena di
 * situlah keberatan muncul: orang sudah melihat angkanya dan sedang mencari
 * alasan untuk tidak melanjutkan. Yang menjawab keberatan bukan kalimat
 * meyakinkan melainkan FAKTA yang bisa ditelusuri, dan enam jawaban pertama
 * masing-masing punya sumbernya:
 *
 *   • lama uji coba          → `TRIAL_DAYS`
 *   • tarif PPN              → `lib/tax.ts` (dan sakelar `PLATFORM_PPN_DISABLED`)
 *   • menunggak → hanya-baca → siklus hidup langganan, docs/MULTI-TENANT.md §7.4
 *   • naik/turun paket       → `lib/plan-change.ts` (prorata; turun ditolak
 *                              bila pemakaian melampaui kuota baru)
 *   • buku terpisah per PT   → satu basis data per perusahaan (#104)
 *   • ekspor mandiri         → `lib/tenant-export.ts` (ZIP CSV, tetap bekerja
 *                              saat akun ditangguhkan — itu justru intinya)
 *
 * Lima pertanyaan PEMBELI ditambahkan di #397 — keenam pertanyaan pertama
 * seluruhnya soal tagihan & isolasi, dan yang ditanya orang SEBELUM sampai ke
 * tagihan tidak terjawab satu pun. Masing-masing diverifikasi ke kode dulu:
 *
 *   • impor dari sistem lama → `lib/coa-import.ts` (akun, kolom Accurate),
 *                              `lib/import/master.ts` (pelanggan/pemasok/
 *                              barang), `lib/import/opening-ar-ap.ts`,
 *                              `lib/import/fixed-assets.ts`; templat lewat
 *                              `lib/import/template.ts`; kolom dikenali dari
 *                              JUDUL (`lib/import/spec.ts`); yang sudah ada
 *                              dilewati, bukan ditimpa (route impornya).
 *                              Saldo awal akun: wizard `(setup)/…/setup`.
 *                              ⚠ Riwayat jurnal TIDAK diimpor — dan itu
 *                              ditulis apa adanya, bukan disembunyikan.
 *   • akuntan/KAP eksternal  → undangan surel + peran per PT
 *                              (docs/MULTI-TENANT.md §7.2–7.3, kuota
 *                              `maxUsers` dicek), izin per peran + peran
 *                              kustom (docs/RBAC.md), jejak audit
 *                              (`lib/audit.ts`), pencabutan sesi ≤60 dtk
 *                              (docs/RBAC.md §Sesi & pencabutan).
 *   • kanal dukungan         → HANYA yang ada: dokumentasi publik `/docs` dan
 *                              formulir kontak `landing-contact.tsx`, yang
 *                              hanya dirender bila `PLATFORM_CONTACT_EMAIL`
 *                              terisi — maka jawabannya BERCABANG pada sakelar
 *                              yang sama (lihat `faqSupportADocsOnly`). Tanpa
 *                              jam layanan, tanpa SLA: tak ada kode yang
 *                              menjaminnya.
 *   • tempat data & UU PDP   → basis data per PT (#104), ekspor mandiri,
 *                              permintaan hapus bertenggang 30 hari & bisa
 *                              dibatalkan (docs/COMPLIANCE.md), `/privacy`.
 *                              ⚠ LOKASI SERVER TIDAK DIKLAIM — data residency
 *                              masih keputusan terbuka (COMPLIANCE.md §5.1).
 *   • cocok untuk usaha apa  → `BUSINESS_CATEGORIES`/`CATEGORY_META` (preset
 *                              wizard) + `BUSINESS_MODULES.length`; daftar
 *                              presetnya DIRAKIT dari registri, bukan diketik.
 *
 * Pertanyaan yang jawabannya belum ada di kode TIDAK ditulis di sini. FAQ
 * pemasaran adalah tempat paling mudah bagi janji untuk lahir tanpa
 * pelaksananya, dan janji seperti itu baru ketahuan saat ada yang menagihnya.
 *
 * ══ `<details>`, BUKAN AKORDEON BER-JAVASCRIPT ═════════════════════════════
 * Isinya harus ADA di HTML pertama: mesin pencari membacanya, penerjemah
 * halaman membacanya, dan orang yang mencetak halaman ini ikut membawanya.
 * Akordeon klien menyembunyikan seluruh jawaban dari ketiganya demi animasi yang
 * tidak menambah apa pun. `<details>`/`<summary>` juga sudah membawa keyboard,
 * `aria-expanded`, dan pencarian di dalam halaman (Ctrl+F membuka panelnya di
 * peramban modern) tanpa satu baris skrip.
 */
import Link from "next/link";

import { DownOutlined } from "@ant-design/icons";
import { JsonLd } from "@/components/landing/landing-jsonld";
import { LANDING_NOTE, landingFill } from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_MODULES,
  CATEGORY_META,
} from "@/lib/business-modules";
import { getT } from "@/lib/i18n/server";
import { TRIAL_DAYS } from "@/lib/registration";
import { DEFAULT_TAX_RATE } from "@/lib/tax";

export async function LandingFaq() {
  const t = await getT();

  /* Formulir kontak hanya dirender bila alamat tujuannya ada
     (`landing-contact.tsx`, sakelar yang sama). Jawaban yang menyuruh orang
     "pakai formulir kontak di halaman ini" pada pemasangan tanpa formulir
     adalah penunjuk palsu — jadi jawabannya mengikuti sakelar itu. */
  const kontakAda = Boolean(process.env.PLATFORM_CONTACT_EMAIL?.trim());

  /* Preset kategori usaha DIRAKIT dari registri: `custom` bukan jenis usaha
     melainkan "pilih sendiri", dan itu disebut kalimatnya secara terpisah.
     Kategori baru muncul di sini tanpa ada yang perlu ingat. */
  const kategori = BUSINESS_CATEGORIES.filter((c) => c !== "custom")
    .map((c) => t(CATEGORY_META[c].labelKey))
    .join(", ");

  const items = [
    {
      q: t("landing.faqTrialQ"),
      a: t("landing.faqTrialA", { days: TRIAL_DAYS }),
    },
    { q: t("landing.faqAfterTrialQ"), a: t("landing.faqAfterTrialA") },
    { q: t("landing.faqQuotaQ"), a: t("landing.faqQuotaA") },
    {
      q: t("landing.faqTaxQ"),
      a: t("landing.faqTaxA", { rate: DEFAULT_TAX_RATE }),
    },
    { q: t("landing.faqIsolationQ"), a: t("landing.faqIsolationA") },
    { q: t("landing.faqExportQ"), a: t("landing.faqExportA") },
    /* Lima pertanyaan pembeli (#397) — urutannya mengikuti urutan orang
       menanyakannya: cocok untuk saya? → data lama saya? → akuntan saya? →
       kalau macet? → data saya di mana? Sumber tiap jawaban di kepala berkas. */
    {
      q: t("landing.faqFitQ"),
      a: t("landing.faqFitA", {
        categories: kategori,
        modules: BUSINESS_MODULES.length,
      }),
    },
    { q: t("landing.faqImportQ"), a: t("landing.faqImportA") },
    { q: t("landing.faqAccountantQ"), a: t("landing.faqAccountantA") },
    {
      q: t("landing.faqSupportQ"),
      a: kontakAda
        ? t("landing.faqSupportA")
        : t("landing.faqSupportADocsOnly"),
    },
    { q: t("landing.faqDataQ"), a: t("landing.faqDataA") },
  ];

  return (
    /* ⚠ `width` DIBIARKAN LEBAR, dan kolom bacanya dipasang pada `<dl>` saja.
       Sebelumnya seksi ini `width="narrow"` (48rem), yang memusatkan SELURUH
       isinya — termasuk judulnya. Akibatnya tepi kiri halaman melompat ke
       dalam tepat satu seksi lalu kembali keluar, dan di layar itu terbaca
       sebagai salah sejajar, bukan sebagai kolom baca yang disengaja.
       Yang memang perlu sempit hanyalah teks yang dibaca berurutan, jadi
       hanya itu yang disempitkan. */
    <LandingSection id="tanya">
      {/* `FAQPage` dibangkitkan dari `items` DI ATAS — array yang sama yang
          merender panelnya. Ini yang membuat data terstruktur tidak bisa
          menyimpang dari halamannya: pertanyaan ketujuh memperbarui keduanya
          sekaligus, dan tidak ada salinan kedua untuk dilupakan. Alasan
          lengkap + kenapa `<` diloloskan: `landing-jsonld.tsx`. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <LandingSectionIntro
        eyebrow={t("landing.eyebrowFaq")}
        title={t("landing.faqHeading")}
      />

      {/* Seksi ini sengaja seksi POLOS — dua wilayah berwarna berturut-turut
          (harga, lalu ajakan penutup) membutuhkan satu tempat istirahat di
          antaranya. Yang menggantikan warna di sini adalah PERMUKAAN: sebelas
          pertanyaan dikurung dalam satu bidang melayang, bukan dibiarkan
          menjadi sebelas garis di atas latar halaman. */}
      <dl
        style={{
          /* Tanpa `overflow: hidden` — ia akan memotong cincin fokus
             `summary` (outline-offset 2px) tepat di baris pertama & terakhir,
             yaitu satu-satunya penanda yang dimiliki pengguna keyboard. */
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          /* Kolom baca hidup DI SINI sekarang, bukan di seksinya — lihat
             catatan pada `<LandingSection>` di atas. Tanpa `marginInline`
             otomatis: ia rata kiri bersama judulnya, sejajar dengan setiap
             seksi lain. */
          maxWidth: "var(--sai-landing-measure-narrow)",
          borderRadius: "var(--sai-landing-radius)",
          /* ⚠ TANPA tepi. Panel ini berdiri di seksi POLOS, jadi nadanya
             sendiri yang menggambar batasnya — persis alasan yang sama dengan
             kartu manfaat & kartu keamanan. Sebelumnya ia `surface` + garis
             1px, dan garis itulah yang membuat blok pertanyaan terbaca
             sebagai kotak yang digambar, bukan sebagai bidang. */
          background: landingFill("brand"),
          paddingInline: "var(--ant-padding-lg)",
        }}
      >
        {items.map((item, index) => (
          <div
            key={item.q}
            style={
              index === 0
                ? undefined
                : { borderTop: "1px solid var(--ant-color-border-secondary)" }
            }
          >
            <details>
              {/* Rotasi karet, kursor, penghapus penanda bawaan, hover, dan
                  cincin fokus adalah KEADAAN — tak satu pun bisa ditulis
                  sebagai gaya sebaris. Semuanya di blok `[data-landing-faq]`
                  (`landing-scale.ts`), termasuk `prefers-reduced-motion`. */}
              <summary
                data-landing-faq=""
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--ant-margin)",
                  paddingBlock: "var(--ant-padding)",
                  textAlign: "left",
                  fontWeight: "var(--ant-font-weight-strong)",
                }}
              >
                {/* `<dt>` DI DALAM `<summary>`: yang bisa diklik harus
                    summary-nya (itu yang membawa keyboard & aria), sedangkan
                    pasangan istilah–penjelasan tetap harus terbaca sebagai
                    daftar definisi oleh pembaca layar. */}
                <dt>{item.q}</dt>
                <DownOutlined
                  data-landing-caret=""
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    color: "var(--ant-color-text-secondary)",
                    fontSize: "var(--ant-font-size-xl)",
                  }}
                />
              </summary>
              <dd
                style={{
                  ...LANDING_NOTE,
                  margin: 0,
                  paddingBottom: "var(--ant-padding)",
                }}
              >
                {item.a}
              </dd>
            </details>
          </div>
        ))}
      </dl>

      {/* Sebelas pertanyaan tidak mungkin menutup semuanya, dan pembaca yang
          pertanyaannya TIDAK ada di sini sebelumnya sampai di ujung seksi
          tanpa jalan ke mana pun — persis di titik ia paling mungkin pergi.
          Dokumentasi publik sudah ada; yang kurang hanya penunjuknya. */}
      <p
        style={{
          ...LANDING_NOTE,
          maxWidth: "var(--sai-landing-measure-narrow)",
          marginTop: "var(--ant-margin-lg)",
        }}
      >
        {t("landing.faqMoreText")}{" "}
        <Link
          href="/docs"
          data-landing-link=""
          style={{ color: "var(--ant-color-link)", textDecoration: "none" }}
        >
          {t("landing.faqMoreCta")} →
        </Link>
      </p>
    </LandingSection>
  );
}
