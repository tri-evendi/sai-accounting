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
import { CheckOutlined } from "@ant-design/icons";
import {
  LANDING_NOTE,
  LANDING_SURFACE,
  landingChip,
  landingFill,
  landingGrid,
} from "@/components/landing/landing-scale";
import { LandingSection, LandingSectionIntro } from "@/components/landing/landing-section";
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
    <LandingSection id="modul" tone="cyan">
      <LandingSectionIntro title={t("landing.modulesHeading")}>
        {t("landing.modulesBody")}
      </LandingSectionIntro>

      {/* Strip fakta: tiga angka yang menjawab "seberapa banyak" sebelum
          orang menyusuri sepuluh kartu di bawahnya.

          Ketiganya berisi nada TERKUAT di seksi ini (`chip-brand`, 28%) dan
          itu disengaja: angka adalah hal pertama yang dicari mata di wilayah
          ini, dan sebelumnya ia kotak putih bergaris di antara sepuluh kotak
          putih bergaris lain. Nada birunya berbeda hue dari pita cyan
          seksinya, jadi ia terpisah dari pita bukan hanya oleh terang-gelap
          (1,16:1 terang · 1,29:1 gelap). */}
      <dl style={{ ...landingGrid(3, 200), margin: 0, marginTop: "var(--ant-margin-lg)" }}>
        {facts.map((fact) => (
          <div
            key={fact.label}
            style={{
              borderRadius: "var(--ant-border-radius-lg)",
              border: "1px solid var(--ant-color-border-secondary)",
              background: landingChip("brand"),
              padding: "var(--ant-padding)",
            }}
          >
            <dt style={{ ...LANDING_NOTE }}>{fact.label}</dt>
            <dd
              style={{
                margin: 0,
                marginTop: "var(--ant-margin-xxs)",
                fontSize: "var(--ant-font-size-heading-3)",
                fontWeight: "var(--ant-font-weight-strong)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <ul
        style={{
          ...landingGrid(3, 260),
          listStyle: "none",
          margin: 0,
          marginTop: "var(--ant-margin)",
          padding: 0,
        }}
      >
        {BUSINESS_MODULES.map((module) => {
          const meta = MODULE_META[module];
          const core = module === CORE_MODULE;
          return (
            <li key={module}>
              {/* Sepuluh kartu di atas pita berwarna: badannya
                  `--sai-landing-surface` (melayang), BUKAN nada — sepuluh
                  kotak bernada di atas pita sehue akan melebur jadi satu blok
                  di tema terang. Yang dibedakan nada hanyalah modul INTI, satu
                  buah, karena ia memang satu-satunya yang berbeda status; dan
                  pembedanya tetap berlapis — lencana berteks + tepi merek —
                  bukan warna saja. */}
              <Card
                style={{
                  height: "100%",
                  background: core ? landingFill("brand") : LANDING_SURFACE,
                  ...(core ? { borderColor: "var(--ant-color-primary)" } : null),
                }}
              >
                <CardContent>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "var(--ant-margin-xs)",
                    }}
                  >
                    <CheckOutlined
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        color: "var(--ant-color-money-positive)",
                        fontSize: "var(--ant-font-size-lg)",
                      }}
                    />
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "var(--ant-font-size-lg)",
                        fontWeight: "var(--ant-font-weight-strong)",
                      }}
                    >
                      {t(meta.labelKey)}
                    </h3>
                    {core && <Badge variant="success">{t("landing.modulesCore")}</Badge>}
                  </div>
                  <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin-xs)" }}>
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
      <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin-lg)" }}>
        {t("landing.modulesNote")}
      </p>
    </LandingSection>
  );
}
