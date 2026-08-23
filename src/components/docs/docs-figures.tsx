/**
 * GAMBAR MEKANISME dokumentasi (issue #453, Tahap 3).
 *
 * ══ KENAPA HTML, BUKAN SVG ═════════════════════════════════════════════════
 * Rencana awal di `pages/docs.md` menyebut "SVG skematik sebaris", dan itu
 * diubah setelah diukur. Sebuah SVG ber-`viewBox` menskalakan SELURUH isinya
 * mengikuti lebar kotaknya — termasuk hurufnya. Kolom baca di ponsel 320px
 * memberi gambar selebar ±290px; teks 14 satuan di dalam `viewBox` selebar 560
 * mendarat sebagai ±7px di layar. Yang tergambar tetap benar dan tidak
 * terbaca — kegagalan yang paling mudah lolos, sebab di layar pengembang ia
 * tampak sempurna.
 *
 * Bentuk di bawah HTML biasa: kotak, panah, kisi. Ia mengalir mengikuti lebar
 * (mendatar di kolom lebar, bertumpuk di kolom sempit), hurufnya tetap huruf
 * halaman ini pada ukuran yang sama, warnanya token yang sama, dan tema gelap
 * datang gratis. Pembaca layar membacanya sebagai TEKS — bukan sebagai "gambar"
 * yang isinya harus ditebak dari satu kalimat `alt`.
 *
 * ⚠ Panahnya `aria-hidden`: arah dibaca dari URUTAN teksnya, dan "panah kanan"
 * yang dibacakan di antara setiap kotak hanya kebisingan. `<figcaption>` yang
 * menyertainya — prosa di `docs-content.ts` — adalah kalimat yang berdiri
 * sendiri, jadi orang yang tidak melihat gambarnya tetap mendapat isinya.
 *
 * ⚠ Yang digambar di sini TIDAK BOLEH mengklaim apa pun yang tidak dikatakan
 * prosanya. Angka pada contoh jurnal (100 juta, 11%, 111 juta) adalah angka
 * yang sama persis dengan yang sudah tertulis di halaman `mesin-akuntansi`;
 * mengarang angka kedua di gambar berarti dua sumber yang akan berselisih.
 */

/** Nama gambar yang ada. `tsc` menolak `kind: "diagram"` bernama lain. */
export type NamaDiagram = "alur-jurnal" | "alur-persetujuan" | "buku-per-pt";

const KOTAK: React.CSSProperties = {
  flex: "1 1 0",
  minWidth: 0,
  padding: "var(--ant-padding-sm)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
};

/** Kotak yang menjadi POKOK gambar — satu per gambar, tidak lebih. */
const KOTAK_UTAMA: React.CSSProperties = {
  ...KOTAK,
  borderColor: "var(--ant-color-primary-border)",
  background: "var(--ant-color-primary-bg)",
};

const JUDUL_KOTAK: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const ISI_KOTAK: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Panah antar-kotak. Bentuknya berganti mengikuti arah tumpukan — mendatar
 * "→", menumpuk "↓" — lewat dua penanda yang disetel blok gaya `docs-shell`.
 */
function Panah() {
  return (
    <span aria-hidden="true" data-docs-arrow="" style={{ color: "var(--ant-color-text-quaternary)" }}>
      <span data-docs-arrow-h="">→</span>
      <span data-docs-arrow-v="">↓</span>
    </span>
  );
}

const BARIS: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: "var(--ant-margin-xs)",
};

function Kotak({
  judul,
  isi,
  utama,
}: {
  judul: string;
  isi?: React.ReactNode;
  utama?: boolean;
}) {
  return (
    <div style={utama ? KOTAK_UTAMA : KOTAK}>
      <p style={JUDUL_KOTAK}>{judul}</p>
      {isi !== undefined && <p style={ISI_KOTAK}>{isi}</p>}
    </div>
  );
}

/** Baris debit/kredit di dalam kotak jurnal — rata kanan, `tabular-nums`. */
const BARIS_JURNAL: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
};

const NOMINAL: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  color: "var(--ant-color-text)",
};

function BarisJurnal({ akun, nominal }: { akun: string; nominal: string }) {
  return (
    <span style={BARIS_JURNAL}>
      <span>{akun}</span>
      <span style={NOMINAL}>{nominal}</span>
    </span>
  );
}

/**
 * Satu dokumen → satu jurnal berpasangan → laporan.
 *
 * Angkanya diambil dari contoh yang sudah ada di prosa halaman
 * `mesin-akuntansi`: faktur Rp 100 juta + PPN 11% = piutang Rp 111 juta.
 */
function AlurJurnal() {
  return (
    <div data-docs-figure-flow="" style={BARIS}>
      <Kotak judul="Faktur penjualan" isi="Rp 100 juta + PPN 11%" />
      <Panah />
      <Kotak
        judul="Jurnal berpasangan"
        utama
        isi={
          <>
            <BarisJurnal akun="Debit · Piutang" nominal="111 jt" />
            <BarisJurnal akun="Kredit · Pendapatan" nominal="100 jt" />
            <BarisJurnal akun="Kredit · Utang PPN" nominal="11 jt" />
          </>
        }
      />
      <Panah />
      <Kotak judul="Laporan" isi="Neraca · Laba rugi · Buku besar" />
    </div>
  );
}

/** Dokumen di bawah ambang berlaku langsung; di atasnya menunggu keputusan. */
function AlurPersetujuan() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin-xs)" }}>
      <div data-docs-figure-flow="" style={BARIS}>
        <Kotak judul="Dokumen disimpan" isi="Tersimpan dan bisa dibaca, apa pun nominalnya" />
        <Panah />
        <Kotak judul="Nominal dibandingkan ambang" utama isi="Ambang & penyetujunya di-snapshot saat itu juga" />
      </div>
      <div data-docs-figure-flow="" style={BARIS}>
        <Kotak judul="Di bawah ambang" isi="Jurnalnya terbit seketika" />
        <Kotak
          judul="Di atas ambang → antre"
          isi="Disetujui: jurnalnya terbit. Ditolak: kembali ke pemohon beserta alasannya, dan bisa diajukan ulang."
        />
      </div>
    </div>
  );
}

const KISI_PT: React.CSSProperties = {
  display: "grid",
  gap: "var(--ant-margin-xs)",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
};

/** Satu basis data kendali di atas, satu buku per PT di bawahnya. */
function BukuPerPt() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ant-margin-xs)" }}>
      <Kotak
        judul="Basis data kendali"
        utama
        isi="Akun pengguna, daftar perusahaan, dan keanggotaan — siapa boleh membuka buku yang mana"
      />
      <span aria-hidden="true" style={{ color: "var(--ant-color-text-quaternary)", textAlign: "center" }}>
        ↓
      </span>
      <div style={KISI_PT}>
        <Kotak judul="PT A" isi="Buku besarnya sendiri" />
        <Kotak judul="PT B" isi="Buku besarnya sendiri" />
        <Kotak judul="PT C" isi="Buku besarnya sendiri" />
      </div>
    </div>
  );
}

const GAMBAR: Record<NamaDiagram, () => React.ReactElement> = {
  "alur-jurnal": AlurJurnal,
  "alur-persetujuan": AlurPersetujuan,
  "buku-per-pt": BukuPerPt,
};

const FIGURE: React.CSSProperties = {
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xs)",
  /*
   * Gambar ini WADAHNYA SENDIRI. Titik patahnya harus menanyakan lebar GAMBAR,
   * bukan lebar bingkai halaman: bingkai 1200px bisa berarti kolom baca 768px
   * (tiga kolom) atau 950px (dua kolom), dan kotak yang berjajar di satu
   * keadaan menjadi pipih di keadaan lain. Wadah bersarang: `@container` di
   * blok gaya menjawab ke wadah TERDEKAT, yaitu ini.
   */
  containerType: "inline-size",
};

const KETERANGAN: React.CSSProperties = {
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-tertiary)",
};

export function DocFigure({ nama, keterangan }: { nama: NamaDiagram; keterangan: string }) {
  const Gambar = GAMBAR[nama];
  return (
    <figure style={FIGURE}>
      <Gambar />
      {/* Keterangan DI BAWAH gambar: ia menjelaskan yang baru dilihat, bukan
          menjanjikan yang akan dilihat. */}
      <figcaption style={KETERANGAN}>{keterangan}</figcaption>
    </figure>
  );
}
