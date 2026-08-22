/**
 * Daftar halaman dokumentasi — kolom kiri (issue #453).
 *
 * ══ KENAPA ADA, PADAHAL SUDAH ADA DAFTAR ISI ═══════════════════════════════
 * Sampai perubahan ini, satu-satunya jalan dari halaman dokumen ke halaman
 * dokumen lain adalah kembali ke `/docs` lebih dulu — atau pengalih
 * Sebelumnya/Berikutnya, yang hanya berjalan DI DALAM satu cabang. Pembaca yang
 * mendarat dari mesin pencari (jalur masuk normal ke permukaan publik) karena
 * itu tidak pernah melihat bahwa ada dua belas halaman lain.
 *
 * ⚠ Ini BUKAN pengganti menu kulit aplikasi: `navDokumentasi` di sana memuat
 * "kembali ke buku" + menu akun, bukan satu pun butir dokumen. Jadi kolom ini
 * dibutuhkan di KEDUA kulit, dan karena itu ia hidup di `DocsShell`.
 *
 * ══ DIBANGKITKAN DARI `DOC_INDEX` ══════════════════════════════════════════
 * Tidak ada satu pun judul yang diketik di sini; cabang, urutan, dan nama
 * halaman datang dari registri yang sama yang merender daftar isi. Halaman
 * ke-14 muncul di kolom ini tanpa berkas ini disentuh — aturan yang sama yang
 * berlaku untuk matriks izin dan tabel endpoint.
 *
 * ══ DI BAWAH 992px IA TIDAK DIRENDER SAMA SEKALI ═══════════════════════════
 * Bukan disembunyikan lalu tetap dikirim: `display:none` di blok gaya membuat
 * markup-nya tetap ada di DOM dan tetap dibaca sebagai navigasi kedua oleh
 * sebagian pembaca layar. Di lebar sempit jalannya tetap seperti hari ini —
 * daftar isi `/docs` + pengalih halaman. Keputusan itu ditulis di issue #453
 * sebagai batas yang diketahui, bukan sebagai kelalaian.
 */

import { Link } from "@/components/ui/app-link";
import {
  DOC_BRANCHES,
  docsInBranch,
  docsPath,
  type DocBranch,
  type DocEntry,
} from "@/lib/docs";
import type { TranslateFn } from "@/lib/i18n/client";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/** Nama cabang di kamus — peta eksplisit; alasannya sama dengan di halaman dokumen. */
const NAMA_CABANG: Record<DocBranch, DictionaryKey> = {
  pelanggan: "docs.branchCustomer",
  pengguna: "docs.branchUser",
};

const KOLOM: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin)",
  fontSize: "var(--ant-font-size-sm)",
};

const LABEL_CABANG: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--ant-margin-xs)",
  fontSize: "var(--ant-font-size-sm)",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--ant-color-text-tertiary)",
};

const DAFTAR: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
};

/**
 * Butir: garis kiri 2px selalu ADA (transparan saat tidak aktif), bukan
 * ditambahkan saat aktif. Garis yang lahir dan mati menggeser teksnya 2px
 * setiap kali halaman berganti — gerakan yang terlihat seperti bug.
 */
const BUTIR: React.CSSProperties = {
  display: "block",
  borderLeft: "2px solid transparent",
  paddingBlock: "var(--ant-padding-xxs)",
  paddingInline: "var(--ant-padding-xs)",
  color: "var(--ant-color-text-secondary)",
  textDecoration: "none",
  lineHeight: 1.5,
};

const BUTIR_AKTIF: React.CSSProperties = {
  ...BUTIR,
  borderLeftColor: "var(--ant-color-primary)",
  color: "var(--ant-color-text)",
  fontWeight: 600,
};

function Butir({ halaman, aktif }: { halaman: DocEntry; aktif: boolean }) {
  return (
    <li>
      <Link
        href={docsPath(halaman.slug)}
        data-docs-nav-item=""
        /* `aria-current="page"` — penanda halaman aktif yang TIDAK bergantung
           warna maupun bobot huruf; keduanya tidak sampai ke pembaca layar. */
        aria-current={aktif ? "page" : undefined}
        style={aktif ? BUTIR_AKTIF : BUTIR}
      >
        {halaman.judul}
      </Link>
    </li>
  );
}

export function DocsNav({ t, slug }: { t: TranslateFn; slug?: string }) {
  return (
    <nav aria-label={t("docs.allPages")} style={KOLOM}>
      {DOC_BRANCHES.map((cabang) => (
        <div key={cabang}>
          <p style={LABEL_CABANG}>{t(NAMA_CABANG[cabang])}</p>
          <ul style={DAFTAR}>
            {docsInBranch(cabang).map((halaman) => (
              <Butir key={halaman.slug} halaman={halaman} aktif={halaman.slug === slug} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
