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
import { ChevronDown } from "lucide-react";

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
    <section id="tanya" className="scroll-mt-20 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("landing.faqHeading")}
        </h2>

        <dl className="mt-8 divide-y divide-border border-y border-border">
          {items.map((item) => (
            <div key={item.q}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  {/* `<dt>` DI DALAM `<summary>`: yang bisa diklik harus
                      summary-nya (itu yang membawa keyboard & aria), sedangkan
                      pasangan istilah–penjelasan tetap harus terbaca sebagai
                      daftar definisi oleh pembaca layar. */}
                  <dt>{item.q}</dt>
                  <ChevronDown
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden
                  />
                </summary>
                <dd className="pb-4 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
              </details>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
