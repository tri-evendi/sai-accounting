"use client";

/**
 * "Pelajari ini" (issue #21) — tautan kontekstual dari layar yang rumit
 * langsung ke entri Kamus Istilah yang menjelaskannya. Judul dan tujuannya
 * diambil dari kamus tunggal `src/lib/labels.ts` — definisi tidak pernah
 * ditulis ulang di halaman.
 *
 * **Client component, dan HARUS tetap begitu.** Dulu ini server component
 * (tanpa "use client") demi "tidak menambah JavaScript", tapi komponen ini
 * juga dipakai DI DALAM dua form client — `inventory/update/stock-form.tsx`
 * dan `finance/new/transaction-form.tsx`. Begitu label butuh terjemahan,
 * versi server-nya menarik `lib/i18n/server.ts` (`server-only` +
 * `next/headers`) ikut masuk ke bundel browser lewat kedua form itu, dan
 * `next build` GAGAL — kegagalan yang tak terlihat oleh `tsc` karena ini
 * batasan bundler, bukan tipe. Karena itu terjemahan diambil lewat `useT()`.
 *
 * ── Kenapa ia TETAP `<Link>`, bukan `Typography.Link` AntD (issue #190) ────
 * Ini satu-satunya primitif fase B4 yang tidak merender komponen AntD, dan
 * alasannya sama dengan alasan komponen ini wajib client: ia dipakai DI DALAM
 * formulir. `Typography.Link` (juga `Button href` — lihat catatan `asChild` di
 * `button.tsx`) adalah `<a href>` biasa, yang berarti pemuatan halaman PENUH.
 * Ditekan dari tengah formulir stok atau transaksi keuangan yang setengah
 * terisi, pemuatan penuh membuang seluruh isian yang belum disimpan — untuk
 * membuka sebuah definisi. Tautan ini justru paling sering ditekan saat orang
 * ragu di tengah mengisi.
 *
 * Yang dipindahkan ke AntD adalah WARNANYA: `--ant-color-link`, variabel yang
 * ditulis `ConfigProvider` dan yang di aplikasi ini menunjuk `colorBrandText`
 * (#186) — anak tangga biru yang sudah diukur lolos 4,5:1 di ketiga latar,
 * bukan `colorPrimary` bawaan yang hanya 4,10:1 sebagai teks.
 */

import { Link } from "@/components/ui/app-link";
import { BookOutlined } from "@ant-design/icons";
import { getTerm, glossaryHref } from "@/lib/labels";
import { useT } from "@/lib/i18n/client";

/**
 * Dua keadaan yang tidak punya bentuk sebaris — garis bawah saat disorot dan
 * cincin fokus papan ketik. Cincinnya digambar sendiri karena ini `<a>`
 * telanjang, bukan komponen AntD: `genFocusStyle()` AntD tidak menyentuhnya.
 * Warnanya `colorPrimaryBorder`, token yang SAMA yang dipakai setiap cincin
 * fokus AntD dan yang dinaikkan ke `colorBrandText` di issue #187 — jadi fokus
 * di sini tidak bisa berpisah rupa dari fokus di tombol sebelahnya.
 */
const LEARN_MORE_RULES = `
[data-learn-more]:hover{text-decoration:underline}
[data-learn-more]:focus{outline:none}
[data-learn-more]:focus-visible{outline:2px solid var(--ant-color-primary-border);outline-offset:1px}
`;

interface LearnMoreProps {
  /** Kunci entri kamus, mis. "piutang". */
  term: string;
  /** Teks tautan; standarnya "Pelajari ini: <label>". */
  label?: string;
}

export function LearnMore({ term, label }: LearnMoreProps) {
  // Hook dipanggil SEBELUM early-return: aturan hooks React melarang
  // pemanggilan bersyarat.
  const t = useT();

  const entry = getTerm(term);
  if (!entry) return null;

  return (
    <>
      <style href="sai-learn-more" precedence="default">
        {LEARN_MORE_RULES}
      </style>
      <Link
        data-learn-more
        href={glossaryHref(entry.key)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          borderRadius: "var(--ant-border-radius)",
          fontSize: "var(--ant-font-size)",
          fontWeight: 500,
          cursor: "pointer",
          transition: "color 150ms",
          color: "var(--ant-color-link)",
        }}
      >
        <BookOutlined aria-hidden="true" style={{ fontSize: 16 }} />
        {label ?? t("learnMore.label", { term: entry.label })}
      </Link>
    </>
  );
}
