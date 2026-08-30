/**
 * Perender blok dokumentasi (issue #300) — server component, tanpa JavaScript.
 *
 * Satu `switch` atas `DocBlock` (`lib/docs.ts`). Bentuk itu dipilih supaya
 * penambahan jenis blok baru MERAH di `tsc` (`never` di cabang bawaan), bukan
 * diam-diam tidak tergambar.
 *
 * ── Blok `istilah`: dibaca, tidak disalin ──────────────────────────────────
 * Definisi istilah sudah punya rumahnya sejak #21/#1 — `TERMS` di
 * `lib/labels.ts`, sumber yang sama yang dipakai `<TermTooltip>` dan halaman
 * `/glossary`. Berkas ini MEMBACANYA. Menyalin kalimatnya ke dalam prosa
 * dokumentasi akan melahirkan definisi kedua yang berselisih dengan yang
 * pertama pada perubahan berikutnya, dan yang salah adalah yang tidak dibaca
 * siapa pun; `tests/docs.test.ts` menolak penyalinan itu dengan membandingkan
 * setiap `definisi` dengan seluruh teks `lib/docs-content.ts`.
 *
 * Kenapa definisinya dirender di sini alih-alih ditautkan ke `/glossary`:
 * `/glossary` bertenant (`/t/{tenant}/{company}/glossary`) dan menuntut sesi.
 * Permukaan ini justru dibaca orang yang belum punya satu pun — sebuah tautan
 * ke sana adalah tautan yang memantul ke halaman masuk.
 */

import { DocFigure } from "@/components/docs/docs-figures";
import { docAnchor } from "@/lib/docs";
import type { DocBlock } from "@/lib/docs-content";
import { getTerm } from "@/lib/labels";
import { getT } from "@/lib/i18n/server";

const PARAGRAF: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-lg)",
  lineHeight: 1.75,
  color: "var(--ant-color-text)",
};

const SUB: React.CSSProperties = {
  margin: 0,
  /*
   * 32px, bukan 12px. Jarak antar-blok di kolom ini 24px (irama app), jadi
   * sub-judul berjarak 12px justru berdiri LEBIH DEKAT ke paragraf di atasnya
   * daripada ke paragraf miliknya sendiri — pembaca yang memindai melihat satu
   * blok panjang, bukan bagian-bagian. Ini satu-satunya tempat irama 24px
   * dilampaui, dan lampauannya satu anak tangga.
   */
  marginTop: "var(--ant-margin-xl)",
  /* Sub-judul 20px — satu anak tangga di bawah judul halaman (30px). */
  fontSize: "var(--ant-font-size-heading-4)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
  /*
   * Tautan kontekstual dari menu Bantuan mendarat di jangkar INI. Tanpa ini
   * judulnya berhenti menempel di garis atas layar, dan yang terbaca pertama
   * kali adalah paragraf di bawahnya — pembaca tidak pernah melihat judul yang
   * memberi tahu ia sampai di tempat yang benar.
   */
  scrollMarginTop: "var(--ant-margin-xl)",
};

const DAFTAR: React.CSSProperties = {
  margin: 0,
  paddingInlineStart: "var(--ant-padding-lg)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-lg)",
  lineHeight: 1.7,
  color: "var(--ant-color-text)",
};

/**
 * Daftar BERURUTAN. Penomorannya dari peramban (`<ol>`), bukan angka yang
 * diketik ke dalam kalimat: menyisipkan langkah di tengah tidak boleh menuntut
 * siapa pun menomori ulang butir di bawahnya — dan penomoran yang salah nomor
 * adalah bentuk kesalahan yang paling meyakinkan.
 */
const LANGKAH: React.CSSProperties = {
  margin: 0,
  paddingInlineStart: "var(--ant-padding-lg)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-lg)",
  lineHeight: 1.7,
  color: "var(--ant-color-text)",
};

const CATATAN: React.CSSProperties = {
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
};

/** Nada `peringatan` — tepi & latar peringatan, DAN kata penanda di depannya. */
const CATATAN_PERINGATAN: React.CSSProperties = {
  ...CATATAN,
  border: "1px solid var(--ant-color-warning-border)",
  background: "var(--ant-color-warning-bg)",
};

const PENANDA_PERINGATAN: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const KODE_KOTAK: React.CSSProperties = {
  position: "relative",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-fill-quaternary)",
};

const KODE_LABEL: React.CSSProperties = {
  display: "block",
  padding: "var(--ant-padding-xs) var(--ant-padding)",
  borderBottom: "1px solid var(--ant-color-border-secondary)",
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

const KODE: React.CSSProperties = {
  /*
   * `overflow-x` DI SINI, bukan di halaman: sebuah `curl` beralamat panjang
   * lebih lebar daripada kolom baca 768px di layar ponsel, dan kotak yang tidak
   * bisa digulung sendiri akan menggulungkan SELURUH halaman ke samping.
   */
  margin: 0,
  overflowX: "auto",
  padding: "var(--ant-padding)",
  /* Monospace: cuplikan ini ditempel orang, jadi setiap spasi berarti. */
  fontFamily: "var(--ant-font-family-code)",
  fontSize: "var(--ant-font-size-sm)",
  lineHeight: 1.7,
  color: "var(--ant-color-text)",
  /* Perintah yang ditempel orang: tab 8 kolom bawaan peramban mematahkan
     baris `curl` yang sudah pas di 768px. */
  tabSize: 2,
  /* Baris panjang digulung, TIDAK dipatah: perintah yang patah di tengah
     tanda kutip adalah perintah yang gagal saat ditempel. */
  whiteSpace: "pre",
};

const ISTILAH_KOTAK: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-sm)",
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
};

const ISTILAH_JUDUL: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const ISTILAH_SUMBER: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-sm)",
  color: "var(--ant-color-text-tertiary)",
};

const ISTILAH_LABEL: React.CSSProperties = {
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const ISTILAH_FORMAL: React.CSSProperties = {
  color: "var(--ant-color-text-tertiary)",
};

const ISTILAH_DEFINISI: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
};

/**
 * Satu blok. Blok BANGKITAN (`matriks-izin`, `endpoint-api`, `riwayat-rilis`)
 * dirender
 * pemanggilnya — lihat `DocBody`.
 */
async function Blok({
  blok,
}: {
  blok: Exclude<
    DocBlock,
    { kind: "matriks-izin" } | { kind: "endpoint-api" } | { kind: "riwayat-rilis" }
  >;
}) {
  const t = await getT();

  switch (blok.kind) {
    case "paragraf":
      return <p style={PARAGRAF}>{blok.teks}</p>;

    case "sub":
      /*
       * `<h2>` dengan `id` dari judulnya: itulah jangkar yang ditunjuk tautan
       * kontekstual dari dalam aplikasi. Jangkar yang ditulis terpisah dari
       * judulnya adalah jangkar yang akan menyimpang dari judulnya.
       */
      return (
        <h2 id={docAnchor(blok.judul)} style={SUB}>
          {blok.judul}
        </h2>
      );

    case "poin":
      return (
        <ul style={DAFTAR}>
          {blok.butir.map((butir) => (
            <li key={butir}>{butir}</li>
          ))}
        </ul>
      );

    case "langkah":
      return (
        <ol style={LANGKAH}>
          {blok.butir.map((butir) => (
            <li key={butir}>{butir}</li>
          ))}
        </ol>
      );

    case "diagram":
      return <DocFigure nama={blok.nama} keterangan={blok.keterangan} />;

    case "kode":
      /*
       * `<pre>` di dalam `<figure>` berlabel: label bahasanya bukan hiasan —
       * ia yang memberi tahu pembaca bahwa yang di bawahnya perintah shell,
       * bukan jawaban yang ia harapkan. Tanpa pewarna sintaks (tidak ada
       * pewarna di repo ini, dan menambah satu demi empat cuplikan adalah
       * dependensi yang salah).
       */
      return (
        <figure style={{ ...KODE_KOTAK, margin: 0 }}>
          <figcaption style={KODE_LABEL}>{blok.bahasa}</figcaption>
          <pre style={KODE}>
            <code>{blok.teks}</code>
          </pre>
        </figure>
      );

    case "catatan":
      /*
       * SENGAJA bukan `Alert` AntD. `Alert` selalu merender `role="alert"` —
       * wilayah live ASERTIF yang memotong bacaan pembaca layar yang sedang
       * berjalan — dan ia membuang `role` yang dioper (MASTER.md §Primitif
       * Wajib). Catatan di dalam sebuah dokumen statis tidak mendesak apa pun;
       * ia bagian dari bacaannya.
       */
      /*
       * Kata penanda ("Perhatikan") ada di dalam kotak peringatan, bukan hanya
       * warnanya: satu dari dua belas pembaca laki-laki tidak membedakan
       * oranye dari abu-abu, dan sebuah peringatan yang hanya berbeda warna
       * adalah catatan biasa bagi mereka.
       */
      return blok.nada === "peringatan" ? (
        <div style={CATATAN_PERINGATAN}>
          <strong style={PENANDA_PERINGATAN}>{t("docs.noteWarning")}</strong> {blok.teks}
        </div>
      ) : (
        <div style={CATATAN}>{blok.teks}</div>
      );

    case "istilah": {
      const entri = blok.kunci.map(getTerm).filter((e) => e !== undefined);
      if (entri.length === 0) return null;
      return (
        <aside style={ISTILAH_KOTAK}>
          <div>
            <h2 style={ISTILAH_JUDUL}>{t("docs.termsHeading")}</h2>
            <p style={ISTILAH_SUMBER}>{t("docs.termsSource")}</p>
          </div>
          <dl style={{ margin: 0 }}>
            {entri.map((e) => (
              <div key={e.key} style={{ marginBottom: "var(--ant-margin-sm)" }}>
                <dt>
                  <span style={ISTILAH_LABEL}>{e.label}</span>{" "}
                  <span style={ISTILAH_FORMAL}>· {e.term}</span>
                </dt>
                <dd style={ISTILAH_DEFINISI}>{e.definisi}</dd>
              </div>
            ))}
          </dl>
        </aside>
      );
    }

    default: {
      /* Jenis blok baru tanpa cabang di atas ditolak `tsc`, bukan dilewati. */
      const belumDitangani: never = blok;
      return belumDitangani;
    }
  }
}

export async function DocBody({
  blok,
  matriks,
  endpoints,
  riwayat,
}: {
  blok: readonly DocBlock[];
  /**
   * Perender blok bangkitan, dititipkan dari halaman.
   *
   * Ada supaya berkas ini tetap tidak tahu apa pun tentang `authz.ts`: yang
   * membangkitkan matriks izin adalah komponennya sendiri, dan perender blok
   * hanya tahu ada satu tempat untuk menaruhnya.
   */
  matriks: React.ReactNode;
  /**
   * Alasan yang sama, sumber yang lain: daftar endpoint `/api/v1` dibangkitkan
   * dari `lib/api-v1-spec.ts` oleh komponennya sendiri. Dititipkan, bukan
   * diimpor di sini, supaya perender blok tetap tidak tahu apa-apa tentang
   * permukaan API.
   */
  endpoints: React.ReactNode;
  /**
   * Alasan yang sama, sumber yang lain: riwayat rilis dibangkitkan dari
   * `lib/changelog.ts` oleh komponennya sendiri.
   */
  riwayat: React.ReactNode;
}) {
  return (
    <>
      {blok.map((b, i) => {
        if (b.kind === "matriks-izin") return <div key={`matriks-${i}`}>{matriks}</div>;
        if (b.kind === "endpoint-api") return <div key={`endpoint-${i}`}>{endpoints}</div>;
        if (b.kind === "riwayat-rilis") return <div key={`riwayat-${i}`}>{riwayat}</div>;
        return <Blok key={`${b.kind}-${i}`} blok={b} />;
      })}
    </>
  );
}
