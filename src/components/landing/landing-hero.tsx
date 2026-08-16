/**
 * Hero — dimensi pertama dari "pemasaran" (lihat `landing-scale.ts`).
 *
 * ══ INILAH SATU-SATUNYA TEKS SEBESAR INI DI SELURUH APLIKASI ═══════════════
 * Ukurannya `--sai-landing-font-size-hero`: 30px di ponsel, ≈53px di ≥576px —
 * di atas `fontSizeHeading1` AntD (38px), yang merupakan langit-langit setiap
 * kepala halaman internal. Itu disengaja dan itu yang membuatnya hero. Karena
 * variabelnya hanya dideklarasikan di dalam `[data-landing]`, ukuran ini tidak
 * bisa dicapai halaman lain dengan menyalin `style`-nya; ia harus mengimpor
 * `LandingShell`, dan impor itu ditolak penjaga.
 *
 * ══ DUA PINTU, DAN URUTANNYA DISENGAJA ═════════════════════════════════════
 * Daftar (primer) lebih dulu, Masuk (garis) sesudahnya — halaman ini ditulis
 * untuk orang yang BELUM punya akun; yang sudah punya tahu jalannya dan tetap
 * menemukannya di bilah atas. Keduanya `size="lg"` (48px), melebar penuh di
 * layar sempit karena kolomnya `flex-direction: column` di bawah 576px.
 *
 * ══ `variant="primary"` DITULIS, DAN ITU BUKAN SEKADAR KERAPIAN (#267) ══════
 * Aturan "satu aksi utama per layar" TIDAK berlaku di halaman ini — MASTER.md
 * §Aksi utama per layar → "Pendaratan `/` dikecualikan". Yang berlaku sebagai
 * gantinya: setiap tombol berisi penuh di direktori ini menuju `/register`,
 * satu ajakan yang diulang, bukan empat ajakan yang bersaing
 * (`tests/button-emphasis.test.ts`). Variannya ditulis eksplisit supaya
 * pembalikan bawaan `primary`→`secondary` tidak diam-diam mencabut hero halaman
 * pemasaran — pembalikan itu SUDAH terjadi (potongan 5), dan berkas ini termasuk
 * yang membuatnya lewat tanpa perubahan.
 */
import { LandingHeroMock } from "@/components/landing/landing-hero-mock";
import {
  LANDING_HERO_TITLE,
  LANDING_LEAD,
  LANDING_NOTE,
} from "@/components/landing/landing-scale";
import { LandingStats } from "@/components/landing/landing-stats";
import { ButtonLink } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import { TRIAL_DAYS } from "@/lib/registration";

export async function LandingHero() {
  const t = await getT();

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        borderBottom: "1px solid var(--ant-color-border-secondary)",
        /* ══ BIDANG WARNA, BUKAN TEKS DI ATAS PUTIH ═══════════════════════
           Dua nada pendaratan yang sama yang dipakai pita seksi di bawahnya
           (`landing-scale.ts`), dibentangkan sebagai satu bidang: sudut hero
           adalah nada TERKUAT halaman (`band-accent`), sisi jauhnya cyan.
           Keduanya `color-mix` opak di atas `colorBgContainer`, jadi arah
           terang/gelapnya mengikuti tema dengan sendirinya — tidak ada cabang
           tema di berkas ini.

           Sebelumnya di sini berdiri `colorPrimaryBg` telanjang. Ia tidak
           salah, hanya datar: satu tint, satu arah, dan hero yang terbaca
           sebagai kotak pucat. Yang tidak berubah adalah alasan aslinya —
           latarnya tetap SATU properti pada seksinya sendiri, tanpa elemen
           berlapis yang bisa memakan klik tombol di atasnya. */
        /* ⚠ `band-brand`, BUKAN `band-accent`. Nada `accent` (16%) dinyatakan
           `landing.md` sebagai nada TERKUAT halaman yang dipakai "tepat
           sekali" — di ajakan penutup. Hero memakainya juga (sebagai ujung
           gradien), dan di layar hasilnya persis yang dikhawatirkan aturan
           itu: pita penutup terbaca sebobot hero, sehingga halaman berakhir
           datar alih-alih memuncak. Dengan hero mulai dari `band-brand` (10%),
           `accent` benar-benar muncul sekali. */
        /* DUA lapis, dan lapis keduanya yang mengusir kesan kaku: gradien
           linier sendirian menghasilkan bidang yang berpindah warna dalam satu
           garis lurus — rapi, dan mati. Sorotan RADIAL di kuadran kanan atas
           (tempat purwarupa produk berdiri) memberi hero satu sumber cahaya,
           jadi bidangnya terbaca melengkung alih-alih terlipat.

           ⚠ Kedua lapis memakai nada tingkat PITA (≤16%), bukan `chip-*` (28%).
           Hero memikul tombol primer, dan `landing.md` §Nada pekat mengunci
           batas itu: di atas 16% isian tombol jatuh di bawah ambang 3:1 di tema
           gelap. Sorotan yang lebih terang di sini akan menghilangkan tombol
           ajakan halaman ini sebagai bidang. */
        /* TIGA lapis, dari atas ke bawah:
             1. kisi titik halus — TEKSTUR. Inilah yang membedakan bidang
                berwarna dari bidang yang terasa punya permukaan, dan ia pola
                baku di pemasaran produk keuangan justru karena ia menambah
                kedalaman tanpa menambah satu elemen pun yang harus dibaca.
                Titiknya 1px pada kisi 22px dan hanya 7% dari warna teks —
                terlihat sebagai butiran, tidak pernah sebagai pola;
             2. sorotan radial di kuadran tempat purwarupa berdiri;
             3. gradien linier merek → cyan.

           ⚠ Ketiganya tetap di tingkat PITA (≤16%) karena hero memikul tombol
           primer — di atas itu isian tombol jatuh di bawah 3:1 di tema gelap.
           Kisi titik tidak menggeser angka itu: ia butiran 1px, bukan bidang. */
        backgroundImage:
          "radial-gradient(color-mix(in srgb, var(--ant-color-text) 7%, transparent) 1px, transparent 1.5px), radial-gradient(120% 90% at 78% 8%, var(--sai-landing-band-accent) 0%, transparent 62%), linear-gradient(135deg, var(--sai-landing-band-brand) 0%, var(--sai-landing-band-cyan) 100%)",
        backgroundSize: "22px 22px, auto, auto",
        paddingBlock: "var(--sai-landing-rhythm)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "var(--sai-landing-measure)",
          marginInline: "auto",
          paddingInline: "var(--sai-landing-gutter)",
        }}
      >
        <div data-landing-hero="">
          <div style={{ maxWidth: "var(--sai-landing-measure-copy)" }}>
            <h1 style={LANDING_HERO_TITLE}>{t("landing.heroHeading")}</h1>
            <p style={{ ...LANDING_LEAD, marginTop: "var(--ant-margin)" }}>
              {t("landing.heroBody")}
            </p>
            <div
              data-landing-actions=""
              style={{ marginTop: "var(--sai-landing-cta-space)" }}
            >
              {/* `ButtonLink`, bukan `Button href` (#289): `/register` dan
                `/login` adalah rute DI DALAM app, dan `button.tsx` menyatakan
                pembagiannya tanpa ruang tafsir — `Button href` untuk tautan
                keluar/unduhan/muat-ulang yang disengaja, `ButtonLink` untuk
                rute internal. Keduanya merender `<a class="ant-btn">` yang
                sama; yang berubah hanya prefetch + navigasi sisi-klien.

                Di halaman inilah selisih itu paling mahal: tombol ini adalah
                satu-satunya alasan halaman ini ada, dan sampai perubahan ini
                ia justru satu-satunya tautan di halaman yang memuat ulang
                seluruh aplikasi sebelum formulir pendaftaran muncul. */}
              {/* ══ AJAKAN HERO MENYEBUT LAMA UJI COBA (#397) ═══════════════
                  "Coba gratis {days} hari", bukan "Buat akun". Yang dijual
                  tombol ini adalah PERCOBAAN TANPA RISIKO, dan itu baru
                  tersampaikan kalau lamanya tertulis di tombolnya — bukan
                  tiga layar ke bawah di catatan harga. Angkanya `TRIAL_DAYS`,
                  konstanta yang sama yang menghitung masa uji coba, jadi ia
                  tidak bisa berbohong (§KLAIM HARUS PUNYA SUMBER).

                  Kuncinya SENDIRI (`heroTrialCta`), bukan `heroPrimary` yang
                  diubah teksnya: `heroPrimary` dipanggil TANPA `{days}` oleh
                  kartu paket & ajakan penutup, dan placeholder yang tidak
                  diisi mendarat sebagai teks "{days}" di halaman publik.
                  Tujuannya tetap `/register` — satu ajakan yang diulang
                  (`tests/button-emphasis.test.ts`), hanya bunyinya berbeda.
                  ⚠ "Tanpa kartu kredit" TIDAK ditulis; tak ada kode yang
                  menjaminnya. */}
              <ButtonLink href="/register" size="lg" variant="primary">
                {t("landing.heroTrialCta", { days: TRIAL_DAYS })}
              </ButtonLink>
              <ButtonLink href="/login" size="lg" variant="outline">
                {t("landing.heroSecondary")}
              </ButtonLink>
            </div>
            {/* Orang yang diundang rekan kerja TIDAK boleh mendaftar sendiri:
              akun kedua membuatnya jadi tenant baru, bukan anggota tim yang
              mengundangnya. Kalimat ini menahannya sebelum ia menekan tombol
              yang salah.

              ⚠ DISEMBUNYIKAN DI BAWAH 576px (`[data-landing-hero-note]`,
              `landing-scale.ts`) — bukan dihapus. Di ponsel hero adalah SATU
              kolom dan setiap baris di atas purwarupa mendorong sisa halaman
              ke bawah lipatan; kalimat ini menyasar orang yang hampir pasti
              TIDAK sedang membaca hero (yang diundang datang lewat tautan di
              surelnya, bukan lewat halaman ini). Ia tetap di HTML dan tetap
              tampil di ≥576px, tempat ruangnya ada; yang hilang hanya di
              layar yang paling mahal ruangnya bagi pengunjung yang paling
              tidak membutuhkannya.
              Alasan lengkap: `pages/landing.md` §Catatan undangan. */}
            <p
              data-landing-hero-note=""
              style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin)" }}
            >
              {t("landing.heroNote")}
            </p>
          </div>

          {/* Purwarupa produk — mengisi kolom yang selama ini kosong. Di bawah
              576px ia jatuh ke baris KEDUA (satu kolom), jadi ajakan di atas
              tidak pernah terdorong ke bawah lipatan.

              `paddingTop` memberi ruang bagi TUMPUKAN kartu yang menyembul ke
              atas (`landing-hero-mock.tsx`); tanpa itu dua kartu belakang
              terpotong tepi seksi di layar sempit. */}
          <div style={{ paddingTop: "var(--ant-padding-lg)" }}>
            <LandingHeroMock />
          </div>
        </div>

        {/* Strip bukti: tiga angka yang dihitung dari registri, tepat sesudah
            hero dan sebelum penjelasan apa pun. Sebelumnya ia terkubur di
            sepertiga halaman ke bawah, di antara sepuluh kartu modul yang
            berbentuk sama persis dengannya. */}
        <div style={{ marginTop: "var(--sai-landing-rhythm)" }}>
          <LandingStats />
        </div>
      </div>
    </section>
  );
}
