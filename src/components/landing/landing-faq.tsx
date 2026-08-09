/**
 * FAQ halaman pendaratan — enam pertanyaan yang jawabannya SUDAH ADA di kode,
 * bukan enam pertanyaan yang enak dijawab.
 *
 * ══ KENAPA PERTANYAAN INI, BUKAN YANG LAIN ═════════════════════════════════
 * Pola `Pricing Page + CTA` menaruh FAQ tepat sesudah kartu harga karena di
 * situlah keberatan muncul: orang sudah melihat angkanya dan sedang mencari
 * alasan untuk tidak melanjutkan. Yang menjawab keberatan bukan kalimat
 * meyakinkan melainkan FAKTA yang bisa ditelusuri, dan keenam jawaban di bawah
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
 * Pertanyaan yang jawabannya belum ada di kode TIDAK ditulis di sini. FAQ
 * pemasaran adalah tempat paling mudah bagi janji untuk lahir tanpa
 * pelaksananya, dan janji seperti itu baru ketahuan saat ada yang menagihnya.
 *
 * ══ `<details>`, BUKAN AKORDEON BER-JAVASCRIPT ═════════════════════════════
 * Isinya harus ADA di HTML pertama: mesin pencari membacanya, penerjemah
 * halaman membacanya, dan orang yang mencetak halaman ini ikut membawanya.
 * Akordeon klien menyembunyikan keenam jawaban dari ketiganya demi animasi yang
 * tidak menambah apa pun. `<details>`/`<summary>` juga sudah membawa keyboard,
 * `aria-expanded`, dan pencarian di dalam halaman (Ctrl+F membuka panelnya di
 * peramban modern) tanpa satu baris skrip.
 */
import { DownOutlined } from "@ant-design/icons";
import { LANDING_NOTE, LANDING_SURFACE } from "@/components/landing/landing-scale";
import { LandingSection, LandingSectionIntro } from "@/components/landing/landing-section";
import { getT } from "@/lib/i18n/server";
import { TRIAL_DAYS } from "@/lib/registration";
import { DEFAULT_TAX_RATE } from "@/lib/tax";

export async function LandingFaq() {
  const t = await getT();

  const items = [
    { q: t("landing.faqTrialQ"), a: t("landing.faqTrialA", { days: TRIAL_DAYS }) },
    { q: t("landing.faqAfterTrialQ"), a: t("landing.faqAfterTrialA") },
    { q: t("landing.faqQuotaQ"), a: t("landing.faqQuotaA") },
    { q: t("landing.faqTaxQ"), a: t("landing.faqTaxA", { rate: DEFAULT_TAX_RATE }) },
    { q: t("landing.faqIsolationQ"), a: t("landing.faqIsolationA") },
    { q: t("landing.faqExportQ"), a: t("landing.faqExportA") },
  ];

  return (
    <LandingSection id="tanya" width="narrow">
      <LandingSectionIntro title={t("landing.faqHeading")} />

      {/* Seksi ini sengaja seksi POLOS — dua wilayah berwarna berturut-turut
          (harga, lalu ajakan penutup) membutuhkan satu tempat istirahat di
          antaranya. Yang menggantikan warna di sini adalah PERMUKAAN: enam
          pertanyaan dikurung dalam satu bidang melayang, bukan dibiarkan
          menjadi enam garis di atas latar halaman. */}
      <dl
        style={{
          /* Tanpa `overflow: hidden` — ia akan memotong cincin fokus
             `summary` (outline-offset 2px) tepat di baris pertama & terakhir,
             yaitu satu-satunya penanda yang dimiliki pengguna keyboard. */
          margin: 0,
          marginTop: "var(--ant-margin-lg)",
          borderRadius: "var(--ant-border-radius-lg)",
          border: "1px solid var(--ant-color-border-secondary)",
          background: LANDING_SURFACE,
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
              <dd style={{ ...LANDING_NOTE, margin: 0, paddingBottom: "var(--ant-padding)" }}>
                {item.a}
              </dd>
            </details>
          </div>
        ))}
      </dl>
    </LandingSection>
  );
}
