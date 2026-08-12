/**
 * Purwarupa tampilan produk di hero — SATU-SATUNYA gambar produk di halaman ini.
 *
 * ══ KENAPA ADA: KOLOM KANAN HERO MEMANG BERLUBANG ══════════════════════════
 * Hero mengurung kalimatnya pada `--sai-landing-measure-copy` (42rem) di dalam
 * seksi selebar `--sai-landing-measure` (72rem). Di layar lebar itu berarti
 * ~40% sisi kanan hero adalah bidang berwarna KOSONG — tata letak yang
 * berbentuk seolah sebuah gambar akan datang, lalu tidak pernah datang.
 *
 * Sampai perubahan ini seluruh halaman tidak memuat satu pun gambar produk:
 * calon pelanggan yang menimbang perangkat lunak AKUNTANSI tidak bisa melihat
 * satu layar pun sebelum membuat akun. Setiap pola pendaratan untuk jenis
 * produk ini menaruh gambar produk di atas lipatan.
 *
 * ══ KENAPA DIRENDER, BUKAN TANGKAPAN LAYAR ═════════════════════════════════
 * Tiga hal yang tangkapan layar tidak bisa lakukan dan berkas ini dapat gratis:
 *   • ia mengikuti TEMA — versi gelap tidak perlu tangkapan layar kedua;
 *   • ia mengikuti BAHASA — tanpa tiga berkas PNG per layar;
 *   • ia tidak pernah BASI — tangkapan layar menua diam-diam, dan yang menua di
 *     halaman pemasaran memajang antarmuka yang sudah tidak ada lagi.
 * Ditambah satu yang menentukan di repo ini: PNG di `public/` adalah aset yang
 * tidak dijaga penjaga mana pun.
 *
 * ══ ⚠ ANGKANYA KARANGAN, DAN KARENA ITU DIBERI LABEL ═══════════════════════
 * `landing.md` §KLAIM HARUS PUNYA SUMBER melarang angka tanpa sumber. Aturan
 * itu menyasar KLAIM — harga, kuota, lama uji coba, jumlah pelanggan: hal yang
 * dipercaya orang lalu ternyata berbeda saat ditagih. Contoh tampilan bukan
 * klaim tentang produk; ia gambar tentang BENTUK layarnya.
 *
 * Batas itu dijaga dengan cara yang paling sederhana: kartu ini memikul
 * kalimat "contoh tampilan — angka di atas bukan data nyata", BERTEKS dan
 * selalu terlihat, bukan sebagai `title` atau `aria-label` yang hanya terbaca
 * sebagian orang. Nama perusahaannya pun sengaja "PT Contoh Satu/Dua" — bukan
 * nama yang bisa dikira nyata, dan bukan pula nama PT pemasangan ini (yang
 * dilarang §"Nama PT tidak pernah muncul di sini", karena pemasangan multi-PT
 * tidak bisa tahu tenant mana yang sedang datang).
 *
 * ══ TETAP SERVER COMPONENT ═════════════════════════════════════════════════
 * Nominalnya lewat `formatMoney()` — fungsi server yang sama yang dipakai kartu
 * paket — BUKAN primitif `Money`, yang sejak #186 adalah komponen client
 * (`theme.useToken()`). Satu `Money` di sini berarti hidrasi dibayar setiap
 * pengunjung yang mungkin tidak pernah mendaftar, dan `AMBANG_KLIEN` di
 * `tests/rsc-boundary.test.ts` yang menguncinya.
 */
import { BankOutlined, LockOutlined, SwapOutlined } from "@ant-design/icons";

import {
  LANDING_NOTE,
  LANDING_SURFACE,
  landingChip,
  landingFill,
} from "@/components/landing/landing-scale";
import { getT } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money-format";

/**
 * Angka contoh. Ditulis sebagai konstanta bernama, bukan tersebar di markup,
 * supaya jelas terbaca sebagai DATA CONTOH — dan supaya tidak ada yang mengira
 * salah satunya dihitung dari sesuatu.
 */
const CONTOH = {
  cash: 184_500_000,
  receivable: 92_750_000,
  payable: 41_300_000,
} as const;

/** Baris nominal: label kiri, angka kanan, rata pada garis dasar yang sama. */
const BARIS: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--ant-margin)",
  paddingBlock: "var(--ant-padding-sm)",
};

/**
 * Nominal: `tabular-nums` dan rata KANAN — aturan MASTER.md untuk angka uang
 * berlaku penuh di sini. Purwarupa yang menulis angkanya dengan cara yang
 * BERBEDA dari aplikasinya bukan purwarupa, ia gambar yang menyesatkan.
 */
const NOMINAL: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontWeight: "var(--ant-font-weight-strong)",
  textAlign: "right",
};

/**
 * Sparkline 12 titik — kontrak "stat tile" dari skill dataviz: label · nilai ·
 * delta · tren. Bentuknya AREA karena deretnya SATU (satu seri = area; banyak
 * seri = garis), dan satu seri berarti TANPA legenda — judul barisnya yang
 * menamainya.
 *
 * ══ KENAPA TIDAK ADA TOOLTIP / CROSSHAIR / TABEL ═══════════════════════════
 * Aturan bawaan skill itu: grafik HTML/SVG wajib punya lapisan hover, dan
 * grafik nyata wajib punya padanan tabel. Keduanya SENGAJA tidak dipasang di
 * sini, dan alasannya bukan kemalasan:
 *
 *   • ini bukan grafik yang dibaca siapa pun — ia GAMBAR TENTANG grafik, di
 *     dalam purwarupa `aria-hidden` yang angkanya sudah dinyatakan contoh.
 *     Memasang tooltip justru mengundang orang memeriksa angka karangan;
 *   • lapisan hover menuntut JavaScript sisi klien, dan halaman ini membayarnya
 *     dengan hidrasi untuk pengunjung yang mungkin tidak pernah mendaftar
 *     (`AMBANG_KLIEN`, `tests/rsc-boundary.test.ts`).
 *
 * Kalau kelak ada grafik SUNGGUHAN di halaman ini — angka nyata yang dibaca
 * orang — aturan itu berlaku penuh dan pengecualian ini tidak menular.
 *
 * ══ WARNA ══════════════════════════════════════════════════════════════════
 * Satu hue. Isian 20% (angka dari basis data grafik untuk deret tunggal),
 * garis 2px, dan titik periode BERJALAN dalam nada aksen — persis kontrak
 * "tren dalam nada redup, periode berjalan dalam aksen". Semuanya
 * `var(--ant-…)`, jadi ia ikut berganti tema tanpa satu cabang pun.
 */
const TREN = [38, 41, 39, 44, 47, 45, 52, 55, 53, 58, 62, 67] as const;

function Sparkline() {
  /* Melebar penuh (viewBox + `width: 100%`) dan lebih tinggi daripada versi
     pertama: sparkline 132×34 yang terselip di samping nominal terbaca sebagai
     hiasan kecil. Membentang di dasar kartu, ia menjadi bagian kartu itu —
     dan justru itu yang membuat purwarupanya terbaca sebagai dasbor. */
  const W = 320;
  const H = 56;
  const min = Math.min(...TREN);
  const max = Math.max(...TREN);
  const span = max - min || 1;
  const x = (i: number) => (i / (TREN.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * (H - 8) - 4;

  const garis = TREN.map(
    (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
  ).join(" ");
  const bidang = `${garis} L${W},${H} L0,${H} Z`;
  const akhirX = x(TREN.length - 1);
  const akhirY = y(TREN[TREN.length - 1]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: H }}
    >
      <path d={bidang} fill="var(--ant-color-primary)" opacity={0.14} />
      <path
        d={garis}
        stroke="var(--ant-color-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* ⚠ Penanda periode berjalan berupa GARIS TEGAK, bukan lingkaran.
          `preserveAspectRatio="none"` meregangkan sumbu-x supaya grafiknya
          mengisi lebar kartu berapa pun — dan peregangan itu akan mengubah
          lingkaran menjadi elips. Garis tegak kebal terhadapnya. */}
      <line
        x1={akhirX}
        y1={akhirY}
        x2={akhirX}
        y2={H}
        stroke="var(--ant-color-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.45}
      />
    </svg>
  );
}

export async function LandingHeroMock() {
  const t = await getT();

  const rows = [
    {
      label: t("landing.mockRowCash"),
      value: CONTOH.cash,
      tone: "var(--ant-color-money-positive)",
    },
    {
      label: t("landing.mockRowReceivable"),
      value: CONTOH.receivable,
      tone: "var(--ant-color-text)",
    },
    {
      label: t("landing.mockRowPayable"),
      value: CONTOH.payable,
      tone: "var(--ant-color-money-negative)",
    },
  ];

  return (
    /* `aria-hidden` — gambar DEKORATIF. Isinya angka karangan; membacakannya
       kepada pengguna pembaca layar berarti membacakan data palsu seolah data.
       Yang perlu mereka dengar sudah ada di kalimat hero di sebelahnya. */
    <div aria-hidden="true" style={{ position: "relative" }}>
      {/* ══ TUMPUKAN BUKU BESAR ═══════════════════════════════════════════
          Judul hero berjanji "beberapa PT, satu akun" — dan sampai perubahan
          ini ilustrasinya memperlihatkan SATU perusahaan. Gambar yang tidak
          mengatakan hal yang sama dengan kalimat di sebelahnya adalah hiasan,
          bukan ilustrasi.

          Dua bilah di belakang menyembul di ATAS kartu utama seperti tumpukan
          map — "beberapa PT" menjadi sesuatu yang TERLIHAT, bukan hanya
          terbaca. Nama PT-nya SENGAJA tidak ditulis di sana: dicoba lebih dulu
          dan dibuang, sebab teks di dalam pita setinggi 18px terpotong oleh
          kartu di depannya dan terbaca sebagai render yang gagal. Perusahaan
          yang sedang dibuka sudah dinamai kepala kartu utama; bilah ini cukup
          mengatakan "ada yang lain di belakangnya".

          ⚠ Keduanya lebih SEMPIT (inset kiri-kanan), bukan digeser mendatar.
          Menggeser ke samping akan melebarkan kotak pembatasnya dan berisiko
          menggulung mendatar di layar sempit — kegagalan yang sudah pernah
          terjadi di bilah atas. Menyempit hanya butuh ruang di atas. */}
      {[
        { inset: 30, lift: 18 },
        { inset: 15, lift: 9 },
      ].map((k) => (
        <div
          key={k.inset}
          style={{
            position: "absolute",
            insetInline: k.inset,
            top: -k.lift,
            height: k.lift + 16,
            borderTopLeftRadius: "var(--sai-landing-radius)",
            borderTopRightRadius: "var(--sai-landing-radius)",
            border: "1px solid var(--ant-color-border-secondary)",
            borderBottom: "none",
            background: landingFill("brand"),
          }}
        />
      ))}

      <div
        style={{
          position: "relative",
          borderRadius: "var(--sai-landing-radius)",
          border: "1px solid var(--ant-color-border-secondary)",
          background: LANDING_SURFACE,
          /* `--ant-box-shadow-tertiary`, bukan bayangan tulisan tangan: nilainya
           berlapis tiga dan disetel per algoritma tema (MASTER.md §Jarak,
           radius, bayangan). */
          boxShadow: "var(--ant-box-shadow-tertiary)",
          overflow: "hidden",
        }}
      >
        {/* Kepala kartu = pemilih perusahaan. Inilah janji hero yang digambar:
          "beberapa PT, satu akun" — jadi yang diperlihatkan pertama bukan
          angkanya melainkan bahwa perusahaannya BISA DIGANTI. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ant-margin-xs)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            background: landingChip("brand"),
            paddingInline: "var(--ant-padding)",
            paddingBlock: "var(--ant-padding-sm)",
          }}
        >
          <BankOutlined style={{ fontSize: "var(--ant-font-size-lg)" }} />
          <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>
            {t("landing.mockCompany")}
          </span>
          <SwapOutlined
            style={{
              marginInlineStart: "auto",
              color: "var(--ant-color-text-secondary)",
              fontSize: "var(--ant-font-size-lg)",
            }}
          />
        </div>

        {/* Baris periode — apa yang membedakan tampilan AKUNTANSI dari daftar
          angka mana pun: setiap nominal hanya berarti bersama periodenya, dan
          buku besar disegel per periode. Menaruhnya di bawah nama perusahaan
          menirukan urutan yang sama di dalam aplikasi. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--ant-margin-xs)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            paddingInline: "var(--ant-padding)",
            paddingBlock: "var(--ant-padding-xs)",
            fontSize: "var(--ant-font-size-sm)",
            color: "var(--ant-color-text-secondary)",
          }}
        >
          <span>{t("landing.mockPeriod")}</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--ant-margin-xxs)",
            }}
          >
            <LockOutlined />
            {t("landing.mockLedgerNote")}
          </span>
        </div>

        <div
          style={{
            paddingInline: "var(--ant-padding)",
            paddingBlock: "var(--ant-padding-sm)",
          }}
        >
          {/* ⚠ TANPA keterangan "ringkasan periode berjalan" di sini. Baris
            periode tepat di atas sudah mengatakannya, dan dua kalimat yang
            menyebut hal sama berjarak satu baris terbaca sebagai render yang
            keliru, bukan sebagai penegasan. */}
          <dl style={{ margin: 0 }}>
            {rows.map((row) => (
              <div
                key={row.label}
                style={{
                  ...BARIS,
                  /* ⚠ TANPA garis antar-baris. Tiga hairline di kartu sekecil
                   ini menghasilkan kisi bergaris, dan justru itu yang membuat
                   purwarupanya terbaca kaku. Yang memisahkan baris cukup
                   jaraknya sendiri. Garis JUMLAH di bawah tetap — ia bukan
                   pemisah melainkan konvensi akuntansi. */
                }}
              >
                <dt style={{ color: "var(--ant-color-text-secondary)" }}>
                  {row.label}
                </dt>
                {/* Warna uang dipakai SEBAGAIMANA MESTINYA di sini — hijau masuk,
                  merah keluar — dan ia bukan satu-satunya penanda: labelnya
                  sudah menyebut kas, piutang, dan utang. */}
                <dd style={{ ...NOMINAL, margin: 0, color: row.tone }}>
                  {formatMoney(row.value, "IDR")}
                </dd>
              </div>
            ))}

            {/* BARIS JUMLAH — inilah yang membuat kartu ini terbaca sebagai
              pembukuan alih-alih tiga angka berdampingan. Tampilan akuntansi
              selalu ditutup sebuah jumlah, dan jumlah itu dipisahkan garis
              yang lebih tegas daripada pemisah antar-baris (`colorBorder`,
              bukan `colorBorderSecondary`) — konvensi yang sama yang dipakai
              neraca dan laba rugi di dalam aplikasi.

              Angkanya DIHITUNG dari ketiga baris di atas, tidak diketik: kartu
              contoh yang jumlahnya tidak cocok dengan rinciannya akan terbaca
              sebagai kesalahan oleh satu-satunya pembaca yang paling mungkin
              memeriksanya — akuntan. */}
            <div
              style={{
                ...BARIS,
                /* Nilai sejajar dengan LABELNYA di atas, bukan dengan dasar
                 sparkline: pasangan label–nilai yang terpisah setinggi grafik
                 berhenti terbaca sebagai satu baris. */
                alignItems: "flex-start",
                borderTop: "2px solid var(--ant-color-border)",
                marginTop: "var(--ant-margin-xxs)",
              }}
            >
              <dt style={{ fontWeight: "var(--ant-font-weight-strong)" }}>
                {t("landing.mockNetLabel")}
                {/* DELTA + TREN — kontrak "stat tile": nilai saja menjawab
                  "berapa", delta menjawab "dibanding apa", dan sparkline
                  menjawab "arahnya ke mana". Ketiganya yang membuat kartu ini
                  terbaca sebagai dasbor, bukan sebagai daftar angka.

                  ⚠ Warna delta = ARAH × apakah naik itu baik. Di sini naik
                  memang baik (selisih bersih), jadi hijau uang dipakai
                  SEBAGAIMANA MESTINYA — dan tandanya (+) sudah membawa artinya
                  tanpa warna, jadi warna bukan penanda tunggal. */}
                <span
                  style={{
                    display: "block",
                    marginTop: 2,
                    fontSize: "var(--ant-font-size-sm)",
                    fontWeight: "normal",
                    color: "var(--ant-color-money-positive)",
                  }}
                >
                  {t("landing.mockDelta")}
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: "var(--ant-margin-xs)",
                  }}
                >
                  <Sparkline />
                </span>
              </dt>
              <dd
                style={{
                  ...NOMINAL,
                  margin: 0,
                  color: "var(--ant-color-money-positive)",
                }}
              >
                {formatMoney(
                  CONTOH.cash + CONTOH.receivable - CONTOH.payable,
                  "IDR",
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Label contoh: BERTEKS, selalu terlihat, di dalam kartunya sendiri —
          bukan keterangan di bawah gambar yang terpisah saat halaman dipotong
          di layar sempit. */}
        <p
          style={{
            ...LANDING_NOTE,
            borderTop: "1px solid var(--ant-color-border-secondary)",
            background: "var(--ant-color-fill-quaternary)",
            paddingInline: "var(--ant-padding)",
            paddingBlock: "var(--ant-padding-xs)",
            /* ⚠ 14px, BUKAN 12px. Kalimat ini bukan keterangan hias — ia
             MEKANISME yang membuat angka karangan di atasnya sah
             (`landing.md` §"Angkanya karangan, dan karena itu diberi label").
             Sebagai teks terkecil di halaman ia justru paling mudah dilewati,
             dan yang dilewati adalah satu-satunya hal yang membedakan contoh
             dari klaim. MASTER.md membolehkan 12px hanya untuk keterangan yang
             MENGULANG informasi di tempat lain; ini tidak mengulang apa pun. */
            fontSize: "var(--ant-font-size)",
          }}
        >
          {t("landing.mockCaption")}
        </p>
      </div>
    </div>
  );
}
