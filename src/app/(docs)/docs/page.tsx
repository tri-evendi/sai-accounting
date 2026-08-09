/**
 * `/docs` — DAFTAR ISI dokumentasi, PUBLIK (issue #300).
 *
 * ══ Kenapa halaman ini tidak memanggil satu penjaga pun ════════════════════
 * Itu keputusan 1, dan ia dinyatakan di tiga tempat supaya tidak bisa lolos
 * karena terlupa:
 *   • `src/proxy.ts` — `isDocsPath()` melepaskan subpohon ini dari pemeriksaan
 *     sesi;
 *   • `tests/authz-coverage.test.ts` — grup rute `(docs)` terdaftar sebagai
 *     grup PUBLIK, dengan describe-nya sendiri yang menuntut halaman di
 *     dalamnya TIDAK memanggil penjaga apa pun (penjaga izin di sini akan
 *     memantulkan justru pembaca yang halamannya dibuat untuknya);
 *   • `tests/docs.test.ts` — halaman & komponennya tidak boleh mengimpor
 *     `auth()`, Prisma, atau chrome app internal.
 *
 * Alasannya bukan kenyamanan: sebagian pertanyaan yang paling sering ditanyakan
 * lahir persis ketika orang TIDAK BISA masuk. Dokumentasi yang menuntut sesi
 * menjawab semua pertanyaan kecuali itu.
 *
 * ══ Dua cabang, bukan satu daftar ═════════════════════════════════════════
 * Pelanggan yang MEMBELI dan pengguna yang MEMAKAI tidak saling menggantikan;
 * menyatukan keduanya adalah cara termudah membuat daftar isi yang harus
 * dilewati setengahnya oleh setiap pembaca.
 */

import type { Metadata } from "next";

import { DocsShell } from "@/components/docs/docs-shell";
import { Link } from "@/components/ui/app-link";
import { DOC_BRANCHES, docsInBranch, docsPath, type DocBranch } from "@/lib/docs";
import { getRequestI18n } from "@/lib/i18n/server";
import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * Dirender per permintaan, bukan statis: judul & nama cabang mengikuti cookie
 * bahasa, dan halaman statis akan memanggangnya menjadi satu bahasa untuk
 * semua orang.
 */
export const dynamic = "force-dynamic";

const CABANG: Record<DocBranch, { judul: DictionaryKey; ringkas: DictionaryKey }> = {
  pelanggan: { judul: "docs.branchCustomer", ringkas: "docs.branchCustomerDescription" },
  pengguna: { judul: "docs.branchUser", ringkas: "docs.branchUserDescription" },
};

const SEKSI: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ant-margin-sm)",
};

const SEKSI_JUDUL: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--ant-font-size-heading-4)",
  fontWeight: 600,
  color: "var(--ant-color-text)",
};

const SEKSI_RINGKAS: React.CSSProperties = {
  margin: 0,
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  color: "var(--ant-color-text-secondary)",
};

const KARTU: React.CSSProperties = {
  display: "block",
  padding: "var(--ant-padding)",
  borderRadius: "var(--ant-border-radius-lg)",
  border: "1px solid var(--ant-color-border-secondary)",
  background: "var(--ant-color-bg-container)",
  boxShadow: "var(--ant-box-shadow-tertiary)",
  color: "inherit",
};

const KARTU_JUDUL: React.CSSProperties = {
  display: "block",
  fontSize: "var(--ant-font-size-lg)",
  fontWeight: 600,
  color: "var(--ant-color-link)",
};

const KARTU_RINGKAS: React.CSSProperties = {
  display: "block",
  marginTop: "var(--ant-margin-xxs)",
  fontSize: "var(--ant-font-size)",
  lineHeight: 1.6,
  color: "var(--ant-color-text-secondary)",
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestI18n();
  return { title: t("docs.title"), description: t("docs.description") };
}

export default async function DocsIndexPage() {
  const { t } = await getRequestI18n();

  return (
    <DocsShell judul={t("docs.title")} ringkas={t("docs.description")}>
      {DOC_BRANCHES.map((cabang) => {
        const halaman = docsInBranch(cabang);
        if (halaman.length === 0) return null;
        return (
          <section key={cabang} style={SEKSI}>
            <div>
              <h2 style={SEKSI_JUDUL}>{t(CABANG[cabang].judul)}</h2>
              <p style={SEKSI_RINGKAS}>{t(CABANG[cabang].ringkas)}</p>
            </div>
            {halaman.map((page) => (
              <Link key={page.slug} href={docsPath(page.slug)} style={KARTU}>
                <span style={KARTU_JUDUL}>{page.judul}</span>
                <span style={KARTU_RINGKAS}>{page.ringkas}</span>
              </Link>
            ))}
          </section>
        );
      })}
    </DocsShell>
  );
}
