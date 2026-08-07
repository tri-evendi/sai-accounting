/**
 * Label — `<label>` biasa (issue #187, fase B1; sebelumnya Radix Label).
 *
 * ── Kenapa primitif ini TIDAK merender komponen AntD ──────────────────────
 * Karena AntD tidak punya satu pun. Di AntD label bukan komponen melainkan
 * PROP: `Form.Item label`. Menariknya ke sini sekarang berarti memutuskan
 * bentuk lapisan formulir lebih dulu — dan itu justru keputusan yang sedang
 * ditimbang di issue #192 (RHF + zod sebagai mesin, AntD sebagai kulit).
 * Menebaknya di B1 berarti menulis ulang keempat pemakainya dua kali.
 *
 * Jadi yang dilakukan di sini hanya melepas Radix. Yang hilang bersamanya
 * praktis tidak ada: `<label htmlFor>` native sudah memfokuskan kontrolnya saat
 * diklik, termasuk ketika labelnya berisi elemen lain (mis. `TermTooltip`), dan
 * pencegahan seleksi teks pada klik ganda sudah ditangani `select-none`.
 *
 * Yang DIDAPAT sepadan: berkas ini berhenti menjadi modul `"use client"`.
 * Sebelumnya ia menyeret Radix menyeberangi batas client hanya untuk merender
 * satu `<label>` — dan ia dipakai `Input`, `Select`, dan `PasswordInput`, yaitu
 * dasar hampir setiap formulir.
 *
 * Kelas Tailwind-nya dicabut di issue #203 dan diganti gaya sebaris dari
 * variabel `--ant-*`. Berkas ini TETAP server-safe: variabelnya diwarisi dari
 * `<html>` (issue #227), jadi tidak perlu `theme.useToken()` — dan karena itu
 * tidak perlu menjadi modul client demi lima deklarasi gaya.
 */

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  fontWeight: 500,
  color: "var(--ant-color-text)",
  // Label kerap diklik ganda untuk memfokuskan isiannya; tanpa ini yang terjadi
  // justru teks labelnya tersorot.
  userSelect: "none",
};

function Label({ style, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" style={{ ...LABEL_STYLE, ...style }} {...props} />;
}

/**
 * Tanda "wajib" — SATU implementasi untuk seluruh keluarga isian.
 *
 * Tinggal di sini, bukan di `form.tsx`, karena `Input`, `Select`, dan
 * `PasswordInput` juga menggambarnya dan ketiganya TIDAK boleh mengimpor
 * `form.tsx`: berkas itu menyeret `react-hook-form` menyeberangi batas client
 * untuk setiap isian di aplikasi, termasuk yang berdiri di luar pola `Form`.
 *
 * Warnanya `colorMoneyNegative` (#186), bukan `colorError` AntD: yang terakhir
 * berkontras 3,27:1 sebagai teks di tema terang — di bawah 4,5:1 untuk huruf
 * 14px. Aturan yang sama berlaku untuk setiap teks galat di aplikasi ini.
 *
 * Kata " (wajib)" disembunyikan dari mata lewat `[data-sr-only]` (globals.css),
 * bukan disembunyikan dari semua orang: tanda bintang sendirian tidak
 * dibacakan pembaca layar sebagai "wajib".
 */
function RequiredMark() {
  return (
    <>
      <span
        aria-hidden="true"
        style={{ marginInlineStart: 2, color: "var(--ant-color-money-negative)" }}
      >
        *
      </span>
      <span data-sr-only> (wajib)</span>
    </>
  );
}

export { Label, RequiredMark };
