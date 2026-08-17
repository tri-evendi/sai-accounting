/**
 * Galeri layar — tiga purwarupa produk DIRENDER (bukan PNG), issue #399.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Sampai #399 satu-satunya gambar produk di halaman ini adalah kartu ringkasan
 * di hero. Enam dari sembilan kompetitor yang ditinjau (#397) memperlihatkan
 * BEBERAPA layar — dasbor, faktur, laporan — dan calon pelanggan perangkat
 * lunak akuntansi memang menimbang bentuk layarnya sebelum mendaftar: jurnal
 * seperti apa yang akan ia isi, faktur seperti apa yang akan ia kirim. Tiga
 * layar di sini menjawab persis itu: **jurnal umum**, **faktur penjualan**,
 * dan **pengalih perusahaan** — layar yang paling sering dibuka, dan yang
 * ketiga adalah janji hero ("beberapa PT, satu akun") yang digambar.
 *
 * ══ POLA PERSIS `landing-hero-mock.tsx` ════════════════════════════════════
 * Dirender, mengikuti tema & bahasa, `aria-hidden`, nominal lewat
 * `formatMoney()` (server), dan ketiga syarat `landing.md` §"Angkanya
 * karangan": label berteks selalu terlihat (`landing.mockCaption`, di dalam
 * tiap kartu), nama PT jelas contoh (`PT Contoh Satu/Dua`), dan `aria-hidden`
 * pada seluruh purwarupa. Yang membedakannya dari PNG bukan estetika: PNG
 * menua diam-diam dan tidak dijaga penjaga mana pun.
 *
 * ══ ANGKA YANG DIHITUNG, BUKAN DIKETIK ═════════════════════════════════════
 *   • Jurnal: debit & kredit dijumlahkan dari barisnya, dan label "Seimbang"
 *     hanya dirender kalau kedua jumlah itu SAMA — kartu contoh yang tidak
 *     seimbang akan terbaca sebagai bug oleh pembaca yang paling mungkin
 *     memeriksanya (akuntan), jadi keseimbangannya bukan teks melainkan hasil.
 *   • Faktur: subtotal dijumlahkan dari dua barisnya; PPN & total dari
 *     `computeTax()` di `lib/tax.ts` dengan `DEFAULT_TAX_RATE` — mesin yang
 *     SAMA yang menghitung faktur sungguhan. Kalau tarif berubah, kartu ini
 *     ikut berubah tanpa disentuh.
 *   • Baris kredit jurnal (penjualan + PPN Keluaran) adalah rincian yang SAMA
 *     dengan faktur di sebelahnya, dan debitnya total faktur itu — satu
 *     transaksi, dua layar, angka yang saling cocok.
 *
 * ══ TEMPATNYA: DI DALAM "APA SAJA YANG ADA DI DALAM" ══════════════════════
 * Issue #399 membebaskan pilihan antara sesudah "Yang Anda dapatkan" atau
 * sebagai bagian seksi modul. Dipilih yang kedua, karena irama halaman
 * (`landing.md` §Susunan seksi: polos → pita → polos → pita) tidak menyisakan
 * tempat untuk seksi baru tanpa dua polos atau dua pita berturut-turut — dan
 * karena secara isi galeri ini memang jawaban harfiah atas judul seksinya.
 * Kartunya `LANDING_SURFACE` + tepi di atas pita cyan: bentuk yang sama
 * dengan purwarupa hero di atas pita hero, dan tepinya WAJIB (§Tepi hanya
 * wajib untuk kartu DI ATAS PITA).
 *
 * ══ KERANGKA APLIKASI + SATU KARTU DOMINAN (#401) ══════════════════════════
 * Sampai #401 tiga kartu "dokumen" sejajar tanpa chrome aplikasi. Kini tiap
 * layar dibungkus `LandingAppFrame` — kerangka yang SAMA dengan hero (bilah
 * judul jendela: nama layar + pengalih PT mini; sidebar 40px berikon) —
 * supaya galeri terbaca sebagai tiga LAYAR dari satu aplikasi, bukan tiga
 * kartu. Tata letaknya 1 besar + 2 kecil di ≥992px (`landing-scale.ts`
 * `[data-landing-gallery]`): jurnal dominan di kiri (~60%) sebab ialah layar
 * yang paling menjawab "seperti apa pekerjaan saya di dalamnya"; faktur &
 * pengalih PT bertumpuk di kanan; satu kolom di bawahnya. Sidebar tiap
 * kerangka menandai modul layar itu aktif (jurnal → pembukuan inti, faktur →
 * penjualan, pengalih → pembukuan inti).
 *
 * Warna uang TIDAK dipakai di sini: debit/kredit dan total faktur bukan
 * "masuk"/"keluar" — mewarnainya hijau/merah justru pernyataan yang salah.
 * Satu-satunya warna di luar netral adalah nada `brand` pada pengalih PT dan
 * ikon, sama seperti purwarupa hero.
 */
import { BankOutlined, CheckOutlined, PlusOutlined } from "@ant-design/icons";

import {
  FRAME_CARD,
  LandingAppFrame,
  landingFrameNav,
  type FrameCompany,
  type FrameNavItem,
} from "@/components/landing/landing-app-frame";
import {
  LANDING_NOTE,
  landingChip,
  landingGlyph,
} from "@/components/landing/landing-scale";
import { getT } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money-format";
import { DEFAULT_TAX_RATE, computeTax } from "@/lib/tax";

/**
 * Angka contoh. Konstanta bernama, bukan tersebar di markup, supaya jelas
 * terbaca sebagai DATA CONTOH — dan supaya yang DIHITUNG darinya (PPN, total,
 * jumlah debit/kredit) terlihat sebagai hitungan, bukan angka lain yang
 * kebetulan berdekatan.
 */
const CONTOH = {
  itemOne: 9_500_000,
  itemTwo: 3_000_000,
} as const;

/** Nomor faktur contoh — string, tidak diterjemahkan (nomor bukan teks). */
const NOMOR_FAKTUR = "INV-2026-0042";

/** Nominal: `tabular-nums`, rata kanan — aturan angka MASTER.md berlaku penuh. */
const NOMINAL: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
  whiteSpace: "nowrap",
};

const BARIS: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "var(--ant-margin-sm)",
  paddingBlock: "var(--ant-padding-xs)",
};

/** Kepala kolom kecil (Akun · Debit · Kredit) — 12px sah: label struktural. */
const KEPALA_KOLOM: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: "var(--ant-font-weight-strong)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--ant-color-text-secondary)",
};

/**
 * Satu layar galeri: kerangka aplikasi bersama (`LandingAppFrame`) dengan
 * isi layar di dalam satu kartu area kerja (`FRAME_CARD`) — bentuk yang
 * SAMA dengan purwarupa hero, jadi keempatnya terbaca sebagai satu produk.
 */
function Layar({
  title,
  companies,
  nav,
  caption,
  children,
}: {
  title: string;
  companies: FrameCompany[];
  nav: FrameNavItem[];
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <LandingAppFrame
      title={title}
      companies={companies}
      nav={nav}
      caption={caption}
      style={{ height: "100%" }}
    >
      <div
        style={{
          ...FRAME_CARD,
          height: "100%",
          fontSize: "var(--ant-font-size)",
        }}
      >
        {children}
      </div>
    </LandingAppFrame>
  );
}

export async function LandingGallery() {
  const t = await getT();
  const caption = t("landing.mockCaption");

  /* Satu transaksi untuk dua layar: faktur di kanan menghasilkan jurnal di
     kiri. PPN dari mesin pajak yang sama dengan faktur sungguhan. */
  const subtotal = CONTOH.itemOne + CONTOH.itemTwo;
  const pajak = computeTax(subtotal, DEFAULT_TAX_RATE);

  /* DUA entri jurnal sejak #401 — kartu jurnal kini dominan (dua baris kisi
     di ≥992px) dan satu entri tiga baris menyisakan bidang kosong. Entri
     kedua adalah PELUNASAN faktur yang sama (kas & bank ← piutang), jadi
     ketiga layar tetap satu cerita: faktur → jurnal penjualan → pelunasan.
     Jumlah & keseimbangan tiap entri DIHITUNG dari barisnya. */
  const entri = [
    {
      memo: t("landing.mockJournalMemo"),
      rows: [
        { account: t("landing.mockAccountReceivable"), debit: pajak.total, credit: 0 },
        { account: t("landing.mockAccountSales"), debit: 0, credit: pajak.dpp },
        { account: t("landing.mockAccountVatOut"), debit: 0, credit: pajak.taxAmount },
      ],
    },
    {
      memo: t("landing.mockJournalMemoTwo"),
      rows: [
        { account: t("landing.mockRowCash"), debit: pajak.total, credit: 0 },
        { account: t("landing.mockAccountReceivable"), debit: 0, credit: pajak.total },
      ],
    },
  ].map((e) => {
    const totalDebit = e.rows.reduce((sum, row) => sum + row.debit, 0);
    const totalKredit = e.rows.reduce((sum, row) => sum + row.credit, 0);
    return { ...e, totalDebit, totalKredit, seimbang: totalDebit === totalKredit };
  });

  const perusahaan = [
    { name: t("landing.mockCompany"), active: true },
    { name: t("landing.mockCompanyTwo"), active: false },
  ];

  /* Angka "—" untuk sisi jurnal yang kosong: sel kosong di kolom nominal
     terbaca sebagai render yang gagal; tanda strip adalah konvensi jurnal. */
  const nominal = (value: number) => (value === 0 ? "—" : formatMoney(value, "IDR"));

  return (
    <div style={{ marginTop: "var(--sai-landing-rhythm)" }}>
      {/* `<h3>` — di bawah `<h2>` seksi modul, sesuai urutan tingkat heading. */}
      <div style={{ maxWidth: "var(--sai-landing-measure-copy)" }}>
        <h3
          style={{
            margin: 0,
            fontSize: "var(--ant-font-size-heading-4)",
            fontWeight: "var(--ant-font-weight-strong)",
            lineHeight: "var(--ant-line-height-heading-4)",
          }}
        >
          {t("landing.galleryHeading")}
        </h3>
        <p style={{ ...LANDING_NOTE, marginTop: "var(--ant-margin-xs)" }}>
          {t("landing.galleryBody")}
        </p>
      </div>

      {/* `aria-hidden` pada SELURUH galeri — isinya angka karangan; kalimat
          yang perlu didengar pembaca layar sudah ada di judul & paragraf di
          atas, yang berada DI LUAR wadah ini. */}
      <div
        aria-hidden="true"
        data-landing-gallery=""
        style={{ marginTop: "var(--ant-margin-lg)" }}
      >
        {/* ══ 1. JURNAL UMUM — kartu DOMINAN (kiri, dua baris di ≥992px) ══ */}
        <div data-landing-gallery-main="" style={{ minWidth: 0 }}>
          <Layar
            title={t("landing.mockJournalTitle")}
            companies={perusahaan}
            nav={landingFrameNav(t, "core_accounting")}
            caption={caption}
          >
            <div
              style={{
                ...BARIS,
                ...KEPALA_KOLOM,
                borderBottom: "1px solid var(--ant-color-border-secondary)",
              }}
            >
              <span>{t("landing.mockAccount")}</span>
              <span style={{ display: "flex", gap: "var(--ant-margin-md)" }}>
                <span style={{ ...NOMINAL, minWidth: "7ch" }}>{t("landing.mockDebit")}</span>
                <span style={{ ...NOMINAL, minWidth: "7ch" }}>{t("landing.mockCredit")}</span>
              </span>
            </div>
            {entri.map((e, i) => (
              <div key={e.memo} style={{ marginTop: i === 0 ? "var(--ant-margin-xs)" : "var(--ant-margin)" }}>
                <p style={{ ...LANDING_NOTE, marginBottom: "var(--ant-margin-xxs)" }}>{e.memo}</p>
                {e.rows.map((row) => (
                  <div key={row.account} style={BARIS}>
                    {/* Baris kredit menjorok — konvensi penulisan jurnal. */}
                    <span style={{ paddingInlineStart: row.debit ? 0 : "var(--ant-padding)" }}>
                      {row.account}
                    </span>
                    <span style={{ display: "flex", gap: "var(--ant-margin-md)" }}>
                      <span style={{ ...NOMINAL, minWidth: "7ch" }}>{nominal(row.debit)}</span>
                      <span style={{ ...NOMINAL, minWidth: "7ch" }}>{nominal(row.credit)}</span>
                    </span>
                  </div>
                ))}
                {/* Baris jumlah — garis lebih tegas (`colorBorder`), konvensi
                    yang sama dengan neraca di aplikasi. Kedua jumlah DIHITUNG. */}
                <div
                  style={{
                    ...BARIS,
                    borderTop: "2px solid var(--ant-color-border)",
                    marginTop: "var(--ant-margin-xxs)",
                    fontWeight: "var(--ant-font-weight-strong)",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "var(--ant-margin-xxs)",
                    }}
                  >
                    {t("landing.mockTotal")}
                    {/* "Seimbang" HANYA bila hasil hitungnya memang sama — teks +
                        centang, dan centangnya `colorPrimary`, bukan hijau: ini
                        pernyataan tentang jurnal, bukan tentang uang. */}
                    {e.seimbang && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          marginInlineStart: "var(--ant-margin-xs)",
                          fontSize: "var(--ant-font-size-sm)",
                          fontWeight: "normal",
                          color: "var(--ant-color-primary)",
                        }}
                      >
                        <CheckOutlined />
                        {t("landing.mockBalanced")}
                      </span>
                    )}
                  </span>
                  <span style={{ display: "flex", gap: "var(--ant-margin-md)" }}>
                    <span style={{ ...NOMINAL, minWidth: "7ch" }}>{formatMoney(e.totalDebit, "IDR")}</span>
                    <span style={{ ...NOMINAL, minWidth: "7ch" }}>{formatMoney(e.totalKredit, "IDR")}</span>
                  </span>
                </div>
              </div>
            ))}
          </Layar>
        </div>

        {/* ══ 2. FAKTUR PENJUALAN ══════════════════════════════════════════ */}
        <Layar
          title={t("landing.mockInvoiceTitle")}
          companies={perusahaan}
          nav={landingFrameNav(t, "sales")}
          caption={caption}
        >
          <div style={{ ...BARIS, paddingTop: 0 }}>
            <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>{NOMOR_FAKTUR}</span>
            <span style={LANDING_NOTE}>{t("landing.mockPeriod")}</span>
          </div>
          <div style={{ ...BARIS, borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
            <span style={{ color: "var(--ant-color-text-secondary)" }}>
              {t("landing.mockCustomer")}
            </span>
            <span>{t("landing.mockCompanyTwo")}</span>
          </div>
          {[
            { label: t("landing.mockItemOne"), value: CONTOH.itemOne },
            { label: t("landing.mockItemTwo"), value: CONTOH.itemTwo },
          ].map((row) => (
            <div key={row.label} style={BARIS}>
              <span>{row.label}</span>
              <span style={NOMINAL}>{formatMoney(row.value, "IDR")}</span>
            </div>
          ))}
          <div
            style={{
              ...BARIS,
              borderTop: "1px solid var(--ant-color-border-secondary)",
              color: "var(--ant-color-text-secondary)",
            }}
          >
            <span>{t("landing.mockSubtotal")}</span>
            <span style={NOMINAL}>{formatMoney(pajak.dpp, "IDR")}</span>
          </div>
          <div style={{ ...BARIS, color: "var(--ant-color-text-secondary)" }}>
            <span>{t("landing.mockVat", { rate: pajak.taxRate })}</span>
            <span style={NOMINAL}>{formatMoney(pajak.taxAmount, "IDR")}</span>
          </div>
          <div
            style={{
              ...BARIS,
              borderTop: "2px solid var(--ant-color-border)",
              marginTop: "var(--ant-margin-xxs)",
              fontWeight: "var(--ant-font-weight-strong)",
            }}
          >
            <span>{t("landing.mockInvoiceTotal")}</span>
            <span style={NOMINAL}>{formatMoney(pajak.total, "IDR")}</span>
          </div>
        </Layar>

        {/* ══ 3. PENGALIH PERUSAHAAN ═══════════════════════════════════════
            Janji hero ("beberapa PT, satu akun") sebagai LAYAR: menu akun
            dengan dua PT contoh, satu sedang dibuka, dan jalan menambah PT —
            `companies/new` memang ada, jadi tombol itu bukan janji kosong. */}
        <Layar
          title={t("landing.mockSwitcherTitle")}
          companies={perusahaan}
          nav={landingFrameNav(t, "core_accounting")}
          caption={caption}
        >
          <p style={{ ...LANDING_NOTE, marginBottom: "var(--ant-margin-xs)" }}>
            {t("landing.mockSwitcherHint")}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {perusahaan.map((company) => (
              <li
                key={company.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--ant-margin-sm)",
                  paddingBlock: "var(--ant-padding-xs)",
                  paddingInline: "var(--ant-padding-xs)",
                  marginInline: "calc(-1 * var(--ant-padding-xs))",
                  borderRadius: "var(--ant-border-radius)",
                  /* Butir yang sedang dibuka bernada — dan berteks
                     ("Sedang dibuka") supaya nadanya bukan penanda tunggal. */
                  background: company.active ? landingChip("brand") : undefined,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    borderRadius: "50%",
                    background: landingChip("brand"),
                    color: landingGlyph("brand"),
                  }}
                >
                  <BankOutlined />
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontWeight: "var(--ant-font-weight-strong)" }}>
                    {company.name}
                  </span>
                  {company.active && (
                    <span
                      style={{
                        fontSize: "var(--ant-font-size-sm)",
                        color: "var(--ant-color-primary)",
                      }}
                    >
                      {t("landing.mockActive")}
                    </span>
                  )}
                </span>
                {company.active && (
                  <CheckOutlined
                    style={{ marginInlineStart: "auto", color: "var(--ant-color-primary)" }}
                  />
                )}
              </li>
            ))}
            <li
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ant-margin-sm)",
                paddingBlock: "var(--ant-padding-xs)",
                marginTop: "var(--ant-margin-xxs)",
                borderTop: "1px solid var(--ant-color-border-secondary)",
                color: "var(--ant-color-text-secondary)",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: "50%",
                  border: "1px dashed var(--ant-color-border)",
                }}
              >
                <PlusOutlined />
              </span>
              {t("landing.mockAddCompany")}
            </li>
          </ul>
        </Layar>
      </div>
    </div>
  );
}
