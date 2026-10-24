/**
 * EDITOR ISI HALAMAN DEPAN — bahasa Indonesia saja di alur biasa.
 *
 * Pemilik merasa diminta mengelola terjemahan: ketiga bahasa berdampingan dan
 * peringatan "terjemahan tertinggal". Yang dijaga di sini:
 *
 *   1. Render bawaan menampilkan isian `id`; English & 中文 ada di DOM (tetap
 *      ikut terkirim apa adanya) tetapi TERLIPAT di `<details>` tertutup.
 *   2. Tidak ada peringatan tertinggal di layar Sunting maupun Tinjau.
 *   3. Lipatan menyebut bila bahasa lain sudah punya draf — draf yang ada
 *      tidak boleh tak terlihat sama sekali.
 *   4. Kemampuan multi-bahasa TIDAK dicabut: fungsi inti & penyimpanannya tetap.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@sai/core/i18n/client";
import { translate, type Dictionary } from "@sai/core/i18n/dictionary";
import id from "@sai/core/i18n/dictionaries/id.json";
import { lockedBehindLocales, SITE_CONTENT_PRIMARY_LOCALE } from "@sai/core/site-content";
import type { Locale } from "@sai/core/i18n/config";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/content",
}));

const { ContentEditor } = await import("@op/components/operator/content-editor");
type Row = Parameters<typeof ContentEditor>[0]["rows"][number];

const dict = id as unknown as Dictionary;
const T = (key: string, values?: Record<string, string | number>) => translate(dict, key, values);

const cell = (defaultValue: string, draft?: string | null) => ({
  defaultValue,
  published: null,
  draft,
  publishedBy: "",
  publishedAt: "",
  draftBy: draft !== undefined ? "vyn" : "",
  draftAt: draft !== undefined ? "24 Okt 2026 10.00" : "",
});

function row(enDraft?: string): Row {
  return {
    key: "landing.heroHeading",
    name: "heroHeading",
    spec: { kind: "label", maxLength: 120 },
    cells: {
      id: cell("Judul Indonesia"),
      en: cell("English heading", enDraft),
      zh: cell("中文标题"),
    } as Row["cells"],
  };
}

function render(r: Row): string {
  return renderToStaticMarkup(
    <LocaleProvider locale="id" dictionary={dict}>
      <ContentEditor
        section="hero"
        rows={[r]}
        showSection={false}
        sectionLabels={{}}
        localeLabels={{ id: "Bahasa Indonesia", en: "English", zh: "中文" } as Record<Locale, string>}
        save={async () => ({ ok: true, message: "" })}
      />
    </LocaleProvider>
  );
}

describe("editor isi — bahasa Indonesia di alur biasa", () => {
  it("bahasa utama adalah `id`", () => {
    expect(SITE_CONTENT_PRIMARY_LOCALE).toBe("id");
  });

  it("render bawaan: isian `id` tampil, en/zh terlipat di <details> TERTUTUP", () => {
    const html = render(row());
    const details = html.indexOf("<details");
    expect(details).toBeGreaterThan(-1);
    // Lipatannya tertutup — tidak ada atribut `open`.
    expect(html.slice(details, html.indexOf(">", details))).not.toContain("open");
    // Isian `id` di LUAR lipatan, sebelum lipatannya.
    const idField = html.indexOf('name="entries.id.heroHeading"');
    expect(idField).toBeGreaterThan(-1);
    expect(idField).toBeLessThan(details);
    // en & zh tetap ada (ikut terkirim apa adanya), tetapi hanya di DALAM lipatan.
    const inside = html.slice(details, html.indexOf("</details>"));
    expect(inside).toContain('name="entries.en.heroHeading"');
    expect(inside).toContain('name="entries.zh.heroHeading"');
    expect(html.slice(0, details)).not.toContain("entries.en.");
    expect(html.slice(0, details)).not.toContain("entries.zh.");
    expect(inside).toContain(T("operator.content.otherLocales"));
  });

  it("tidak ada peringatan 'terjemahan tertinggal' — walau `id` diganti dan en/zh tidak", () => {
    const r = row();
    r.cells.id = { ...r.cells.id, published: "Judul baru" };
    /* Inti masih menganggap en/zh tertinggal — layar sengaja tidak memajangnya. */
    expect(lockedBehindLocales(r.cells)).toEqual(["en", "zh"]);
    const html = render(r);
    expect(html).not.toContain("tertinggal");
    expect(html).not.toContain("belum di");
  });

  it("draf di bahasa lain disebut di ringkasan lipatan", () => {
    const html = render(row("Draft heading"));
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain(T("operator.content.otherLocalesDraft", { locales: "English" }));
  });
});

describe("halaman /content — tanpa jejak 'tertinggal'", () => {
  const page = readFileSync(
    join(__dirname, "..", "apps/operator/src/app/(operator)/content/page.tsx"),
    "utf8"
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("Sunting & Tinjau tidak lagi memakai saringan/panel tertinggal", () => {
    expect(page).not.toContain("lockedBehindLocales(");
    expect(page).not.toContain("operator.content.behind");
    expect(page).not.toContain('"behind"');
  });

  it("Tinjau & Riwayat mendahulukan bahasa Indonesia", () => {
    expect(page).toContain("drafts.sort(");
    expect(page).toContain("[...pub.revisions].sort(");
    expect(page).toContain("PRIMARY_CONTENT_LOCALE");
  });
});
