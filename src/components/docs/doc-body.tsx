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
  marginTop: "var(--ant-margin-sm)",
  /* Sub-judul 20px — satu anak tangga di bawah judul halaman (30px). */
  fontSize: "var(--ant-font-size-heading-4)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
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

const CATATAN: React.CSSProperties = {
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.7,
  color: "var(--ant-color-text-secondary)",
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

/** Satu blok. `matriks-izin` dirender pemanggilnya — lihat `DocBody`. */
async function Blok({ blok }: { blok: Exclude<DocBlock, { kind: "matriks-izin" }> }) {
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

    case "catatan":
      /*
       * SENGAJA bukan `Alert` AntD. `Alert` selalu merender `role="alert"` —
       * wilayah live ASERTIF yang memotong bacaan pembaca layar yang sedang
       * berjalan — dan ia membuang `role` yang dioper (MASTER.md §Primitif
       * Wajib). Catatan di dalam sebuah dokumen statis tidak mendesak apa pun;
       * ia bagian dari bacaannya.
       */
      return <div style={CATATAN}>{blok.teks}</div>;

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
}) {
  return (
    <>
      {blok.map((b, i) =>
        b.kind === "matriks-izin" ? (
          <div key={`matriks-${i}`}>{matriks}</div>
        ) : (
          <Blok key={`${b.kind}-${i}`} blok={b} />
        )
      )}
    </>
  );
}
