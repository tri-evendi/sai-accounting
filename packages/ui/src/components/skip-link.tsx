/**
 * Tautan lewati-ke-isi untuk kulit aplikasi (temuan T13, audit D5 #205).
 *
 * Di layar lebar menu samping adalah kolom permanen, jadi tanpa tautan ini
 * pengguna papan ketik menyusuri SELURUH menu di setiap pemuatan halaman
 * sebelum sampai ke isi. Halaman pendaratan sudah punya satu sejak lama
 * (`landing-shell.tsx`, `[data-landing-skip]`); ini pasangannya untuk kulit
 * bersider — dasbor, panel tenant, wizard penyiapan, dan konsol operator — di
 * paket supaya konsol (yang tidak boleh mengimpor `src/`) memakai yang sama.
 *
 * ── Bentuknya ──────────────────────────────────────────────────────────────
 * Tak terlihat sampai difokuskan; keduanya keadaan CSS (`:focus`), jadi
 * keduanya di blok `<style href precedence>` yang menyasar atribut, bukan di
 * `style` sebaris — pola `learn-more.tsx` / `table.tsx`.
 *
 * Warna saat terlihat: `colorText` di atas `colorBgElevated` + cincin fokus
 * `colorPrimaryBorder` (#187, ≥3:1). SENGAJA bukan resep pendaratan
 * (label putih di atas `colorPrimary`): pasangan itu 4,10:1, di bawah 4,5:1
 * untuk teks 14px — angka yang sama yang membuat #186 menurunkan isian tombol
 * primer sebagai token komponen.
 *
 * Sasarannya `<main id={targetId} tabIndex={-1}>`: `tabIndex` membuat fokus
 * benar-benar PINDAH ke isi (bukan hanya menggulir), sehingga Tab berikutnya
 * berlanjut dari isi, bukan dari menu. Cincin fokus pada `<main>` itu sendiri
 * dimatikan — ia wadah, bukan kendali — lewat `[data-skip-target]`.
 *
 * Bukan client component: tak ada keadaan, jadi kulit server pun bisa
 * merendernya.
 */

const SKIP_LINK_RULES = `
[data-skip-link]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}
[data-skip-link]:focus{top:var(--ant-margin);left:var(--ant-margin);z-index:2000;width:auto;height:auto;margin:0;clip:auto;padding:var(--ant-padding-xs) var(--ant-padding);border-radius:var(--ant-border-radius);background:var(--ant-color-bg-elevated);color:var(--ant-color-text);box-shadow:var(--ant-box-shadow-secondary);outline:2px solid var(--ant-color-primary-border);outline-offset:2px;text-decoration:none}
[data-skip-target]:focus{outline:none}
`;

/** `id` bawaan `<main>` yang dituju — satu nama untuk semua kulit. */
export const SKIP_TARGET_ID = "isi";

/** Atribut untuk `<main>` / `Layout.Content` yang dituju tautan. */
export const SKIP_TARGET_PROPS = {
  id: SKIP_TARGET_ID,
  tabIndex: -1,
  "data-skip-target": "",
} as const;

export function SkipLink({ label, targetId = SKIP_TARGET_ID }: { label: string; targetId?: string }) {
  return (
    <>
      <style href="sai-skip-link" precedence="default">
        {SKIP_LINK_RULES}
      </style>
      <a href={`#${targetId}`} data-skip-link="">
        {label}
      </a>
    </>
  );
}
