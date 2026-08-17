/**
 * Purwarupa tampilan produk di hero — komposisi "dasbor + ponsel" yang
 * DIRENDER (bukan PNG), issue #401.
 *
 * ══ KENAPA ADA: KOLOM KANAN HERO MEMANG BERLUBANG ══════════════════════════
 * Hero mengurung kalimatnya pada kolom baca; di layar lebar sisi kanannya
 * adalah bidang berwarna KOSONG — tata letak yang berbentuk seolah sebuah
 * gambar akan datang, lalu tidak pernah datang. Yang mengisinya adalah gambar
 * PRODUK, sebab calon pelanggan perangkat lunak akuntansi menimbang bentuk
 * layarnya sebelum membuat akun.
 *
 * ══ KENAPA KERANGKA APLIKASI, BUKAN SATU KARTU RINGKASAN (#401) ═════════════
 * Versi sebelumnya: satu kartu tiga baris + sparkline dengan "tumpukan map"
 * — kecil dan abstrak. Tinjauan visual terhadap tujuh kompetitor
 * (2026-08-17): Kledo/Zoho/Wave memenuhi setengah layar dengan kerangka
 * aplikasi nyata. Sekarang: `LandingAppFrame` (bilah atas + pengalih PT,
 * sidebar enam modul dari registri, area kerja) berisi TIGA UBIN ANGKA (kas &
 * bank / piutang / utang — angka contoh yang sama), SATU GRAFIK AREA (pola
 * sparkline yang sama, lebih besar), dan baris "buku besar tersegel per
 * periode"; di sudut kanan-bawah bertumpuk KARTU PONSEL sempit yang
 * memperlihatkan layar yang sama versi ringkas — "ikut ke mana pun" tanpa
 * satu kalimat pun yang mengklaimnya.
 *
 * ══ KENAPA DIRENDER, BUKAN TANGKAPAN LAYAR ═════════════════════════════════
 * Ia mengikuti TEMA (tanpa tangkapan layar kedua), mengikuti BAHASA (tanpa
 * tiga PNG per layar), dan tidak pernah BASI — tangkapan layar menua diam-diam
 * dan memajang antarmuka yang sudah tidak ada. Dan PNG di `public/` adalah
 * aset yang tidak dijaga penjaga mana pun.
 *
 * ══ ⚠ ANGKANYA KARANGAN, DAN KARENA ITU DIBERI LABEL ═══════════════════════
 * `landing.md` §KLAIM HARUS PUNYA SUMBER menyasar KLAIM. Contoh tampilan
 * bukan klaim tentang produk; ia gambar tentang BENTUK layarnya. Batasnya
 * dijaga tiga hal, semuanya wajib: label "contoh tampilan — angka di atas
 * bukan data nyata" BERTEKS & selalu terlihat (kaki kerangka), nama PT jelas
 * contoh ("PT Contoh Satu/Dua", bukan nama pemasangan ini), dan `aria-hidden`
 * pada seluruh komposisi. Jumlahnya DIHITUNG dari rinciannya, tidak diketik.
 *
 * ══ TETAP SERVER COMPONENT ═════════════════════════════════════════════════
 * Nominal lewat `formatMoney()` (fungsi server), BUKAN primitif `Money` (client
 * sejak #186). Nol JavaScript sisi klien: `AMBANG_KLIEN` di
 * `tests/rsc-boundary.test.ts` tidak bergerak karena berkas ini.
 *
 * ══ WARNA UANG DIPAKAI DI SINI, DAN HANYA DI SINI ══════════════════════════
 * Hijau kas, merah utang, hijau delta yang naik — sebagaimana mestinya, dan
 * bukan penanda tunggal: labelnya sudah menyebut kas/piutang/utang, tanda (+)
 * sudah membawa arah. `landing.md` §Hijau/merah/emas/jingga: satu-satunya
 * tempat warna uang di halaman ini adalah purwarupa produk.
 */
import { BankOutlined, LockOutlined, SwapOutlined } from "@ant-design/icons";

import {
  FRAME_CARD,
  LandingAppFrame,
  landingFrameNav,
} from "@/components/landing/landing-app-frame";
import {
  LANDING_PHONE_WIDTH,
  LANDING_SURFACE,
  landingChip,
} from "@/components/landing/landing-scale";
import { TILE_LABEL } from "@/components/ui/stat-tile";
import { getT } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money-format";

/**
 * Angka contoh. Konstanta bernama, bukan tersebar di markup, supaya jelas
 * terbaca sebagai DATA CONTOH — dan supaya tidak ada yang mengira salah
 * satunya dihitung dari sesuatu.
 */
const CONTOH = {
  cash: 184_500_000,
  receivable: 92_750_000,
  payable: 41_300_000,
} as const;

/**
 * Nominal: `tabular-nums`, rata KANAN — aturan MASTER.md untuk angka uang
 * berlaku penuh. Purwarupa yang menulis angkanya dengan cara BERBEDA dari
 * aplikasinya bukan purwarupa, ia gambar yang menyesatkan.
 */
const NOMINAL: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontWeight: "var(--ant-font-weight-strong)",
  whiteSpace: "nowrap",
};

/**
 * Deret 12 titik — kontrak "stat tile" (skill dataviz): label · nilai · delta
 * · tren. Bentuknya AREA karena deretnya SATU (satu seri = area; banyak seri
 * = garis); satu seri berarti TANPA legenda — judul kartunya yang menamainya.
 *
 * ══ KENAPA TIDAK ADA TOOLTIP / CROSSHAIR / TABEL ═══════════════════════════
 * Ini bukan grafik yang dibaca siapa pun — ia GAMBAR TENTANG grafik, di dalam
 * purwarupa `aria-hidden` yang angkanya sudah dinyatakan contoh. Tooltip
 * justru mengundang orang memeriksa angka karangan, dan lapisan hover
 * menuntut JavaScript sisi klien (`AMBANG_KLIEN`). Kalau kelak ada grafik
 * SUNGGUHAN di halaman ini, aturan `dataviz` berlaku penuh dan pengecualian
 * ini tidak menular.
 */
const TREN = [38, 41, 39, 44, 47, 45, 52, 55, 53, 58, 62, 67] as const;

/**
 * Grafik area, satu hue. Isian 14%, garis 2px, penanda periode berjalan
 * berupa GARIS TEGAK — bukan lingkaran: `preserveAspectRatio="none"`
 * meregangkan sumbu-x supaya grafik mengisi lebar kartunya, dan peregangan itu
 * mengubah lingkaran menjadi elips. Semuanya `var(--ant-…)`, ikut tema tanpa
 * satu cabang pun. Tingginya parameter: 96px di kartu dasbor, 40px di ponsel.
 */
function AreaChart({ height }: { height: number }) {
  const W = 320;
  const H = height;
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
      {/* Tiga garis bantu mendatar, 8% dari warna teks: yang membuat bidang
          ini terbaca sebagai GRAFIK dan bukan sebagai hiasan bergelombang.
          Tanpa angka sumbu — angkanya karangan, sumbu berangka mengundang
          orang membacanya. */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          y1={(H * f).toFixed(1)}
          x2={W}
          y2={(H * f).toFixed(1)}
          stroke="var(--ant-color-text)"
          strokeWidth={1}
          opacity={0.08}
        />
      ))}
      <path d={bidang} fill="var(--ant-color-primary)" opacity={0.14} />
      <path
        d={garis}
        stroke="var(--ant-color-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

/** Baris "Periode berjalan · (gembok) Buku besar tersegel per periode". */
function BarisPeriode({
  period,
  note,
  compact = false,
}: {
  period: string;
  note: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "var(--ant-margin-xxs) var(--ant-margin-xs)",
        fontSize: "var(--ant-font-size-sm)",
        color: "var(--ant-color-text-secondary)",
        paddingTop: compact ? "var(--ant-padding-xxs)" : "var(--ant-padding-xs)",
      }}
    >
      <span>{period}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--ant-margin-xxs)",
        }}
      >
        <LockOutlined />
        {note}
      </span>
    </div>
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
  /* JUMLAH DIHITUNG dari ketiga baris, tidak diketik: kartu contoh yang
     jumlahnya tidak cocok dengan rinciannya terbaca sebagai kesalahan oleh
     pembaca yang paling mungkin memeriksanya — akuntan. */
  const selisih = CONTOH.cash + CONTOH.receivable - CONTOH.payable;

  const companies = [
    { name: t("landing.mockCompany"), active: true },
    { name: t("landing.mockCompanyTwo"), active: false },
  ];

  return (
    /* `aria-hidden` — gambar DEKORATIF. Isinya angka karangan; membacakannya
       kepada pengguna pembaca layar berarti membacakan data palsu seolah data.
       Yang perlu mereka dengar sudah ada di kalimat hero di sebelahnya.
       `data-landing-hero-frame` → kaki kerangka menyisakan ruang untuk kartu
       ponsel mulai 768px (`landing-scale.ts`). */
    <div
      aria-hidden="true"
      data-landing-hero-frame=""
      style={{ position: "relative", minWidth: 0 }}
    >
      <LandingAppFrame
        title={t("landing.mockDashboardTitle")}
        companies={companies}
        nav={landingFrameNav(t, "core_accounting")}
        navLabels
        caption={t("landing.mockCaption")}
      >
        {/* ══ TIGA UBIN ANGKA ══════════════════════════════════════════════
            `flex-wrap` dengan basis 120px, BUKAN kisi `auto-fit`: di kerangka
            sempit (288px di viewport 320, ~370px di 768) tiga ubin tidak
            muat sebaris; dengan flex-grow ubin ketiga MELEBAR memenuhi
            barisnya sendiri alih-alih menyisakan kotak yatim setengah lebar
            (`landing.md` §Yang DICOBA lalu dibuang: kisi asimetris). */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ant-margin-xs)" }}>
          {rows.map((row) => (
            <div key={row.label} style={{ ...FRAME_CARD, flex: "1 1 120px" }}>
              <p style={{ ...TILE_LABEL, fontSize: "var(--ant-font-size-sm)" }}>
                {row.label}
              </p>
              <p
                style={{
                  ...NOMINAL,
                  margin: 0,
                  marginTop: 2,
                  color: row.tone,
                  fontSize: "var(--ant-font-size)",
                }}
              >
                {formatMoney(row.value, "IDR")}
              </p>
            </div>
          ))}
        </div>

        {/* ══ GRAFIK AREA — kartu "selisih bersih": label · nilai · delta ·
            tren, kontrak stat tile penuh. Delta hijau karena naik memang baik
            di sini, dan tandanya (+) sudah membawa artinya tanpa warna. */}
        <div style={{ ...FRAME_CARD, marginTop: "var(--ant-margin-xs)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "var(--ant-margin-xxs) var(--ant-margin-sm)",
            }}
          >
            <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ ...TILE_LABEL, fontSize: "var(--ant-font-size-sm)" }}>
                {t("landing.mockNetLabel")}
              </span>
              <span
                style={{
                  fontSize: "var(--ant-font-size-sm)",
                  color: "var(--ant-color-money-positive)",
                }}
              >
                {t("landing.mockDelta")}
              </span>
            </span>
            <span
              style={{
                ...NOMINAL,
                fontSize: "var(--ant-font-size-lg)",
                color: "var(--ant-color-money-positive)",
              }}
            >
              {formatMoney(selisih, "IDR")}
            </span>
          </div>
          <div style={{ marginTop: "var(--ant-margin-xs)" }}>
            <AreaChart height={96} />
          </div>
        </div>

        {/* Baris periode + segel — yang membedakan tampilan AKUNTANSI dari
            daftar angka mana pun: setiap nominal hanya berarti bersama
            periodenya, dan buku besar disegel per periode. */}
        <BarisPeriode period={t("landing.mockPeriod")} note={t("landing.mockLedgerNote")} />
      </LandingAppFrame>

      {/* ══ KARTU PONSEL — layar yang sama, versi ringkas ═════════════════
          Bertumpuk di sudut kanan-bawah, menjorok 16px keluar kerangka ke
          kanan & bawah (masih di dalam gutter seksi, jadi tidak menggulung
          mendatar). Disembunyikan di bawah 768px (`[data-landing-phone]`):
          di kerangka selebar layar ponsel ia hanya menutupi angka. TANPA
          label contoh sendiri — ia bagian komposisi yang labelnya sudah ada
          di kaki kerangka, dan `aria-hidden` mewarisinya dari wadah ini.
          Radius lebih bulat daripada kartu (1,25×): itu yang membuatnya
          terbaca sebagai perangkat, bukan sebagai kartu kedua. */}
      <div
        data-landing-phone=""
        style={{
          position: "absolute",
          right: "calc(-1 * var(--ant-margin))",
          bottom: "calc(-1 * var(--ant-margin))",
          width: LANDING_PHONE_WIDTH,
          borderRadius: "calc(var(--sai-landing-radius) * 1.25)",
          border: "1px solid var(--ant-color-border-secondary)",
          background: LANDING_SURFACE,
          /* Melayang di atas kerangka → bayangan tingkat berikutnya (token). */
          boxShadow: "var(--ant-box-shadow)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ant-margin-xxs)",
            paddingInline: "var(--ant-padding-sm)",
            paddingBlock: "var(--ant-padding-xs)",
            borderBottom: "1px solid var(--ant-color-border-secondary)",
            background: landingChip("brand"),
            fontSize: "var(--ant-font-size-sm)",
            fontWeight: "var(--ant-font-weight-strong)",
          }}
        >
          <BankOutlined />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t("landing.mockCompany")}
          </span>
          <SwapOutlined
            style={{ marginInlineStart: "auto", color: "var(--ant-color-text-secondary)" }}
          />
        </div>
        <div style={{ paddingInline: "var(--ant-padding-sm)", paddingBlock: "var(--ant-padding-xs)" }}>
          {rows.slice(0, 2).map((row) => (
            <div key={row.label} style={{ paddingBlock: "var(--ant-padding-xxs)" }}>
              <p style={{ ...TILE_LABEL, fontSize: "var(--ant-font-size-sm)" }}>{row.label}</p>
              <p style={{ ...NOMINAL, margin: 0, color: row.tone, fontSize: "var(--ant-font-size)" }}>
                {formatMoney(row.value, "IDR")}
              </p>
            </div>
          ))}
          <div style={{ marginTop: "var(--ant-margin-xxs)" }}>
            <AreaChart height={40} />
          </div>
          <BarisPeriode period={t("landing.mockPeriod")} note={t("landing.mockLedgerNote")} compact />
        </div>
      </div>
    </div>
  );
}
