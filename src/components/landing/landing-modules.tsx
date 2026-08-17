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
import {
  AuditOutlined,
  BankOutlined,
  BookOutlined,
  FileProtectOutlined,
  FolderOpenOutlined,
  GoldOutlined,
  InboxOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { LandingGallery } from "@/components/landing/landing-gallery";
import {
  LANDING_NOTE,
  landingChip,
  landingGlyph,
} from "@/components/landing/landing-scale";
import {
  LandingSection,
  LandingSectionIntro,
} from "@/components/landing/landing-section";
import { Badge } from "@/components/ui/badge";
import {
  BUSINESS_MODULES,
  CORE_MODULE,
  MODULE_META,
  type BusinessModule,
} from "@/lib/business-modules";
import { getT } from "@/lib/i18n/server";

/**
 * Ikon per modul — supaya sepuluh baris bisa DIPINDAI, bukan dibaca berurutan.
 *
 * ══ KENAPA PETA LOKAL, BUKAN DI `business-modules.ts` ══════════════════════
 * Ikon adalah keputusan TAMPILAN, dan satu-satunya permukaan yang menampilkan
 * kesepuluh modul sekaligus adalah halaman ini. Menaruhnya di registri bersama
 * berarti wisaya penyiapan, konsol, dan penjaga modul ikut memikul bidang yang
 * tak satu pun dari mereka render.
 *
 * ⚠ Bertipe `Record<BusinessModule, …>` — sama dengan `MODULE_META`, dan
 * dengan alasan yang sama: modul baru tanpa ikon ditolak `tsc`, bukan tampil
 * sebagai baris tanpa lambang di halaman publik.
 *
 * ⚠ SATU warna untuk kesepuluhnya. `landing.md` menolak nada per-kategori untuk
 * daftar ini ("sepuluh hue berdampingan adalah konfeti, bukan hierarki"), dan
 * penolakan itu berlaku sama untuk ikon: yang dibedakan BENTUK, bukan warna.
 * Yang dibawa ikon hanyalah "baris ini tentang apa" pada satu kedipan mata.
 */
/*
 * Diekspor sejak #401: sidebar kerangka aplikasi (`landing-app-frame.tsx`,
 * dipakai hero & galeri) memakai ikon modul yang SAMA — satu peta, bukan dua
 * yang bisa memberi lambang berbeda untuk modul yang sama di satu halaman.
 */
export const MODULE_ICON: Record<BusinessModule, typeof BookOutlined> = {
  core_accounting: BookOutlined,
  sales: ShopOutlined,
  purchasing: ShoppingCartOutlined,
  trading: SwapOutlined,
  inventory: InboxOutlined,
  cash_bank: BankOutlined,
  fixed_assets: GoldOutlined,
  approvals: AuditOutlined,
  tax_id: FileProtectOutlined,
  documents: FolderOpenOutlined,
};

export async function LandingModules() {
  const t = await getT();

  return (
    <LandingSection id="modul" tone="cyan">
      <LandingSectionIntro
        eyebrow={t("landing.eyebrowModules")}
        title={t("landing.modulesHeading")}
      >
        {t("landing.modulesBody")}
      </LandingSectionIntro>

      {/* ⚠ Strip fakta TIDAK lagi di sini — ia pindah ke hero
          (`landing-stats.tsx`). Alasannya ada dua dan keduanya tercatat di
          sana: ia bukti terbaik halaman ini (angkanya dihitung dari registri,
          jadi tak satu pun bisa berbohong) tetapi terkubur di sepertiga
          halaman ke bawah; dan bentuknya sama persis dengan sepuluh kartu di
          bawah ini, sehingga terbaca sebagai tiga modul lagi. */}
      <ul
        style={{
          /* ══ DAFTAR, BUKAN SEPULUH KARTU ═══════════════════════════════
             Bentuk sebelumnya: sepuluh `Card` berpermukaan melayang di dalam
             kisi tiga kolom. Ia benar secara aturan dan salah secara kesan —
             sepuluh persegi bertepi seragam adalah blok paling kaku di
             halaman ini, dan seksi ini yang paling panjang, jadi kesan itulah
             yang paling lama dibawa pembaca.

             Yang hilang bersama kartunya tidak ada: modul bukan sesuatu yang
             diklik, dibandingkan, atau dipilih di sini — ia DAFTAR ISI. Daftar
             yang ditulis sebagai daftar terbaca lebih cepat daripada daftar
             yang dibungkus kotak satu per satu, dan pita seksinya sudah
             menggambar wilayahnya.

             Dua kolom, bukan tiga: barisnya kini punya deskripsi penuh di
             sebelah label, dan tiga kolom akan memotongnya jadi dua-tiga kata
             per baris. */
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
        {BUSINESS_MODULES.map((module) => {
          const meta = MODULE_META[module];
          const core = module === CORE_MODULE;
          return (
            <li
              key={module}
              style={{
                display: "flex",
                gap: "var(--ant-margin-sm)",
                alignItems: "flex-start",
              }}
            >
              {/* ⚠ BUKAN `colorMoneyPositive`. Centang ini berarti "modul ini
                  ada", bukan pernyataan tentang uang. `landing.md` §Nada pekat
                  mengurung hijau/merah/emas/jingga sebagai bahasa uang &
                  status; alasan yang sama berlaku untuk glif, dan di sini
                  lebih tajam — sepuluh centang hijau di halaman yang menjual
                  PEMBUKUAN terbaca sebagai pernyataan tentang angka. */}
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
                {(() => {
                  const Ikon = MODULE_ICON[module];
                  return <Ikon />;
                })()}
              </span>
              <div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "var(--ant-margin-xs)",
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "var(--ant-font-size-lg)",
                      fontWeight: "var(--ant-font-weight-strong)",
                    }}
                  >
                    {t(meta.labelKey)}
                  </h3>
                  {/* `default` (netral berisi), bukan `success`: "selalu aktif"
                      adalah STATUS MODUL, bukan kabar baik tentang uang.
                      Lencananya tetap BERTEKS — itulah yang dijaga, bukan
                      warnanya, dan itu pula yang menggantikan tepi merek yang
                      hilang bersama kartunya. */}
                  {core && (
                    <Badge variant="default">{t("landing.modulesCore")}</Badge>
                  )}
                </div>
                <p
                  style={{
                    ...LANDING_NOTE,
                    marginTop: "var(--ant-margin-xxs)",
                  }}
                >
                  {t(meta.descriptionKey)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Modul dinyalakan per PERUSAHAAN, bukan per akun — dan itu keputusan
          yang layak disebut sebelum mendaftar, bukan kejutan sesudahnya. */}
      <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin-lg)" }}>
        {t("landing.modulesNote")}
      </p>

      {/* ══ GALERI LAYAR (#399) — jawaban HARFIAH atas judul seksi ini ══════
          Tiga purwarupa dirender (jurnal umum, faktur penjualan, pengalih
          PT) di bawah daftar modul, BUKAN sebagai seksi sendiri: irama
          halaman (polos → pita → polos → pita) tidak menyisakan tempat untuk
          seksi baru tanpa dua polos/pita berturut-turut, dan "apa saja yang
          ada di dalam" memang paling jujur dijawab dengan layarnya. Kartunya
          `surface` bertepi di atas pita cyan — bentuk purwarupa hero di atas
          pita hero. Alasan lengkap & aturan angkanya di kepala berkasnya. */}
      <LandingGallery />
    </LandingSection>
  );
}
