/**
 * "Apa saja yang ada di dalam" — daftar MODUL, dibaca dari registri yang sama
 * dengan yang menyalakan & mematikannya.
 *
 * ══ KENAPA DARI `BUSINESS_MODULES`, BUKAN DARI DAFTAR YANG DITULIS ULANG ═══
 * Bagian ini adalah jawaban atas satu-satunya pertanyaan yang benar-benar
 * ditanyakan calon pelanggan sebelum mendaftar: *apakah pekerjaan saya ada di
 * dalamnya?* Menjawabnya dengan daftar yang diketik di markup berarti daftar
 * itu akan basi pada modul berikutnya — dan yang basi di halaman pemasaran
 * tidak berbunyi: ia hanya berhenti menyebut hal yang justru baru dibangun.
 *
 * Karena itu isinya `BUSINESS_MODULES` + `MODULE_META`, registri yang SAMA
 * yang dipakai penjaga modul, layar penyiapan, dan konsol. Modul baru muncul
 * di sini tanpa ada yang perlu ingat, dan `Record` penuh di `MODULE_META`
 * berarti modul tanpa teks ditolak `tsc` — bukan tampil sebagai baris kosong
 * di halaman publik.
 *
 * Teksnya pun bukan teks baru: `labelKey`/`descriptionKey` sudah ada di
 * ketiga kamus karena modul memang hanya pernah tampil lewat `t()`. Halaman
 * ini tidak menambah satu kalimat pemasaran pun — ia memperlihatkan apa yang
 * sudah dikatakan produknya tentang dirinya sendiri, dalam bahasa pembacanya.
 *
 * ══ MODUL INTI DITANDAI, DAN ITU BUKAN HIASAN ══════════════════════════════
 * `core_accounting` tidak bisa dimatikan (anti-lockout). Menampilkannya sebagai
 * satu dari sepuluh pilihan yang setara akan menyesatkan ke dua arah sekaligus:
 * seolah ia bisa dilepas, dan seolah sembilan lainnya wajib ikut. Lencananya
 * BERTEKS, bukan sekadar tepi berwarna — MASTER.md §Anti-Patterns melarang
 * warna sebagai satu-satunya penanda.
 *
 * ══ ANGKA DI STRIP FAKTA DIHITUNG, TIDAK DIKETIK ═══════════════════════════
 * Jumlah modul dari `BUSINESS_MODULES.length`, jumlah bahasa dari
 * `LOCALES.length`, daftar mata uang dari `CURRENCIES`. Angka yang diketik
 * akan salah pada perubahan berikutnya, dan salahnya persis di tempat yang
 * paling merusak kepercayaan: halaman yang dibaca sebelum orang percaya.
 */
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BUSINESS_MODULES, CORE_MODULE, MODULE_META } from "@/lib/business-modules";
import { CURRENCIES } from "@/lib/constants";
import { LOCALES } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";

export async function LandingModules() {
  const t = await getT();

  const facts = [
    { value: String(BUSINESS_MODULES.length), label: t("landing.factModules") },
    { value: String(LOCALES.length), label: t("landing.factLanguages") },
    { value: CURRENCIES.join(" · "), label: t("landing.factCurrencies") },
  ];

  return (
    <section
      id="modul"
      className="scroll-mt-20 border-t border-border py-16 sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("landing.modulesHeading")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {t("landing.modulesBody")}
          </p>
        </div>

        {/* Strip fakta: tiga angka yang menjawab "seberapa banyak" sebelum
            orang menyusuri sepuluh kartu di bawahnya. */}
        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="rounded-xl border border-border bg-card px-5 py-4"
            >
              <dt className="text-sm text-muted-foreground">{fact.label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS_MODULES.map((module) => {
            const meta = MODULE_META[module];
            const core = module === CORE_MODULE;
            return (
              <li key={module}>
                <Card className="h-full">
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Check className="size-4 shrink-0 text-success" aria-hidden />
                      <h3 className="text-base font-semibold text-foreground">{t(meta.labelKey)}</h3>
                      {core && <Badge variant="success">{t("landing.modulesCore")}</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(meta.descriptionKey)}
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>

        {/* Modul dinyalakan per PERUSAHAAN, bukan per akun — dan itu keputusan
            yang layak disebut sebelum mendaftar, bukan kejutan sesudahnya. */}
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          {t("landing.modulesNote")}
        </p>
      </div>
    </section>
  );
}
