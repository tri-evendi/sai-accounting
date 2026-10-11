/**
 * `/operator/content` — MANAJEMEN ISI HALAMAN PENDARATAN.
 *
 * ══ MASALAH YANG DITUTUPNYA ════════════════════════════════════════════════
 * Sebelum halaman ini, mengubah satu kalimat di halaman jualan — satu typo di
 * hero, satu harga yang disebut salah di FAQ, satu nama modul yang berganti —
 * menuntut: sunting berkas JSON kamus, commit, tinjau, `bun run verify`,
 * `bun run build` (±10 menit di kotak ini), dorong image, lalu tukar kontainer
 * produksi. Untuk satu kata. Akibatnya bukan ketidaknyamanan melainkan kalimat
 * yang dibiarkan salah sampai ada pekerjaan lain yang kebetulan ikut
 * membawanya.
 *
 * ══ YANG DISIMPAN HANYA PENIMPANYA ═════════════════════════════════════════
 * Kamus tetap sumber bawaan; basis data hanya menyimpan kalimat yang SUDAH
 * diganti. Tiga akibat yang membuat bentuk ini dipilih — halaman pendaratan
 * tetap utuh saat `sai_platform` mati, "kembalikan ke semula" tetap operasi
 * yang mungkin, dan `tsc` tetap bisa membuktikan ketiga bahasa lengkap — ada di
 * kepala `lib/site-content.ts`.
 *
 * ══ BAHASA & BAGIAN DI URL, BUKAN DI STATE ═════════════════════════════════
 * `?locale=` + `?section=` lewat form GET biasa: hasilnya alamat yang bisa
 * ditempel ke tiket ("perbaiki kalimat di sini"), tombol Kembali peramban yang
 * benar-benar kembali, dan nol byte JS untuk perpindahan bagian. Pola yang sama
 * dengan saringan daftar tenant.
 *
 * ⚠ Halaman ini TIDAK memakai `getDictionary()` untuk mengambil bawaan apa
 * adanya secara kebetulan: ia memintanya untuk BAHASA YANG SEDANG DISUNTING
 * (bukan bahasa konsol), dan penimpaan `landing.*` di dalam `getDictionary`
 * tidak berlaku di sini sebab jalurnya bukan jalur pemasaran
 * (`isSiteContentPath`). Jadi yang tampil sebagai "bawaan" memang bawaan —
 * bukan nilai tersimpan yang terbaca dua kali.
 */

import { Button, ButtonLink } from "@/components/ui/button";
import {
  ConsoleNotice,
  ConsolePanel,
  CONSOLE_MUTED,
  CONSOLE_PAGE,
} from "@/components/operator/console-ui";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ContentEditor, type ContentEditorRow } from "@/components/operator/content-editor";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { getDictionary, getLocale, getT } from "@/lib/i18n/server";
import { requireOperatorPage } from "@/lib/operator/guard";
import {
  SITE_CONTENT_PREFIX,
  isSiteContentLocale,
  resolveSection,
  sectionOf,
  siteContentDefaults,
  SITE_CONTENT_SECTIONS,
} from "@/lib/site-content";
import { siteContentForOperator } from "@/lib/site-content-store";
import { operatorSaveSiteContent } from "./actions";

export const dynamic = "force-dynamic";

/** "Penagihan/platform tidak terjangkau" — kalimat jujur, bukan galat. */
function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default async function OperatorContentPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; section?: string; q?: string }>;
}) {
  await requireOperatorPage();
  const t = await getT();
  const params = await searchParams;

  /* Bahasa yang disunting: `?locale=` bila sah, kalau tidak bahasa KONSOL —
     operator yang konsolnya berbahasa Indonesia hampir selalu sedang menyunting
     kalimat Indonesia, dan bawaan yang salah berarti suntingan pertama mendarat
     di bahasa yang tidak dibaca siapa pun. */
  const locale: Locale = isSiteContentLocale(params.locale) ? params.locale : await getLocale();
  const section = resolveSection(params.section);
  /*
   * PENCARIAN LINTAS BAGIAN — jawaban atas pertanyaan yang sebenarnya dibawa
   * orang ke layar ini: *"di mana kalimat yang berbunyi … ?"*.
   *
   * Tanpa ini, memperbaiki satu typo menuntut menebak bagiannya lebih dulu dari
   * 13 pilihan, dan nama kunci seperti `mockJournalMemoTwo` tidak bisa ditebak
   * siapa pun. Dicari di DUA tempat sekaligus — nama kunci DAN kalimat
   * bawaannya — sebab operator datang dari salah satunya: dari tangkapan layar
   * (ia tahu kalimatnya) atau dari laporan/jejak audit (ia tahu kuncinya).
   */
  const cari = params.q?.trim().toLowerCase() ?? "";

  const [dictionary, stored] = await Promise.all([
    getDictionary(locale),
    siteContentForOperator(locale),
  ]);

  const defaults = siteContentDefaults(dictionary);
  const overrides = new Map((stored ?? []).map((row) => [row.key, row]));

  const rows: ContentEditorRow[] = [];
  for (const [key, fallback] of defaults) {
    /* Saat mencari, BAGIAN diabaikan: hasil yang disaring dua kali adalah hasil
       yang menyembunyikan apa yang baru saja diminta orangnya. */
    if (cari) {
      const cocok =
        key.toLowerCase().includes(cari) || fallback.toLowerCase().includes(cari);
      if (!cocok) continue;
    } else if (sectionOf(key).id !== section.id) {
      continue;
    }
    const row = overrides.get(key);
    rows.push({
      name: key.slice(SITE_CONTENT_PREFIX.length),
      fallback,
      value: row?.value ?? "",
      updatedBy: row?.updatedBy ?? "",
      /* `Date` diformat DI SERVER: ia tidak perlu menyeberang ke client, dan
         `Intl` di peramban akan memakai zona waktu pengunjung — dua jawaban
         berbeda untuk satu peristiwa yang sama. */
      updatedAt: row ? formatDateTime(row.updatedAt) : "",
    });
  }

  /* Berapa banyak kunci yang diganti PER BAGIAN — supaya pemilih bagian
     menyebutkan di mana suntingan sudah ada, bukan hanya nama bagiannya. */
  const gantiPerBagian = new Map<string, number>();
  for (const key of overrides.keys()) {
    if (!defaults.has(key)) continue;
    const id = sectionOf(key).id;
    gantiPerBagian.set(id, (gantiPerBagian.get(id) ?? 0) + 1);
  }

  const sectionOptions = SITE_CONTENT_SECTIONS.filter(
    /* Penampung terakhir hanya ditawarkan bila ia memang memuat sesuatu —
       bagian kosong di dalam pemilih adalah pilihan yang membuang satu klik.
       Bagian lain selalu ditawarkan: ia kosong hanya kalau kamusnya kosong. */
    (s) => s.id !== "other" || gantiPerBagian.has("other") || rows.length > 0
  ).map((s) => {
    const changed = gantiPerBagian.get(s.id) ?? 0;
    const label = t(s.labelKey);
    return {
      value: s.id,
      label: changed > 0 ? `${label} (${changed})` : label,
    };
  });

  return (
    <div>
      <PageHeader
        title={t("operator.content.heading")}
        description={t("operator.content.description")}
        actions={
          <ButtonLink href="/operator/audit" variant="outline" size="sm">
            {t("operator.nav.audit")}
          </ButtonLink>
        }
      />

      <div style={CONSOLE_PAGE}>
        {/* Saringan dalam panelnya sendiri: di halaman ini ia bukan pelengkap
            satu tabel melainkan PEMILIH — bahasa & bagian mana yang sedang
            disunting — dan editor di bawahnya berganti isi seluruhnya
            karenanya. Dua wilayah, dua permukaan. */}
        <ConsolePanel>
        <form
          method="get"
          action="/operator/content"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "var(--ant-margin-sm)",
          }}
        >
          <div style={{ width: "100%", maxWidth: 192 }}>
            <Select
              name="locale"
              label={t("operator.content.localeLabel")}
              defaultValue={locale}
              /* Nama bahasa DALAM BAHASANYA SENDIRI (`LOCALE_LABELS`) — sama
                 dengan pengalih bahasa aplikasi. Satu-satunya daftar nama
                 bahasa di repo ini, jadi tidak ada versi kedua yang bisa
                 menyimpang. */
              options={LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
            />
          </div>
          <div style={{ width: "100%", maxWidth: 280 }}>
            <Select
              name="section"
              label={t("operator.content.sectionLabel")}
              defaultValue={section.id}
              options={sectionOptions}
            />
          </div>
          <div style={{ width: "100%", maxWidth: 320 }}>
            <Input
              name="q"
              label={t("operator.content.searchLabel")}
              placeholder={t("operator.content.searchPlaceholder")}
              aria-label={t("operator.content.searchPlaceholder")}
              defaultValue={cari}
            />
          </div>
          {/* Tombol kirim form GET — `variant="outline"`, sama dengan saringan
              daftar tenant: ia membaca ulang, tidak menulis apa pun (MASTER.md
              §Aksi utama per layar). Aksi utama halaman ini adalah "Simpan" di
              dalam editor, yang berdiri di formulir terpisah. */}
          <Button type="submit" variant="outline">
            {t("operator.tenants.filter")}
          </Button>
        </form>
        </ConsolePanel>

        {stored === null && <ConsoleNotice>{t("operator.content.unavailable")}</ConsoleNotice>}

        {/* Saat mencari, katakan BERAPA yang cocok — daftar hasil tanpa jumlah
            membuat orang menebak apakah ia sudah melihat semuanya. Nol hasil
            dijawab kalimat, bukan editor kosong yang terbaca seperti rusak. */}
        {cari && (
          <p style={CONSOLE_MUTED}>
            {rows.length === 0
              ? t("operator.content.searchEmpty", { q: cari })
              : t("operator.content.searchFound", { count: rows.length, q: cari })}
          </p>
        )}

        {/* `ContentEditor` menyusun formulirnya sendiri; ia dibungkus panel di
            sini supaya isian suntingan berdiri di atas permukaan yang sama
            dengan pemilih di atasnya. */}
        <ConsolePanel>
        <ContentEditor
          /* `key` memaksa editor dibangun ULANG saat bahasa/bagian berganti:
             tanpa itu react-hook-form mempertahankan `defaultValues` dari
             render pertama, dan isian akan memperlihatkan nilai bagian
             SEBELUMNYA di bawah label bagian yang baru. */
          key={`${locale}:${section.id}:${cari}`}
          locale={locale}
          section={section.id}
          rows={rows}
          save={operatorSaveSiteContent}
        />
        </ConsolePanel>
      </div>
    </div>
  );
}
