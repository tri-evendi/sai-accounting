/**
 * Primitif ISIAN di atas Ant Design (issue #188) — invarian yang tidak boleh
 * hilang saat kulitnya berganti.
 *
 * `Input` dan `Select` dijaga di `ui-primitives.test.tsx` bersama primitif
 * kendali; berkas ini memegang empat sisanya. Yang diuji bukan rupa AntD-nya
 * (itu urusan AntD), melainkan janji-janji aplikasi ini yang justru paling
 * mudah menguap dalam sebuah penggantian pustaka:
 *
 *  • isian TELANJANG tetap satu kontrol, syarat `FormControl` (Radix `Slot`)
 *    yang menyalurkan `id`/`aria-*` ke anak tunggalnya — MASTER.md §Konvensi
 *    Form aturan 4;
 *  • `aria-invalid` yang DISUNTIK `FormControl` juga menyalakan gaya error;
 *    kalau hanya prop `invalid` yang dibaca, isian yang ditolak validasi
 *    diumumkan ke pembaca layar tapi garisnya tetap netral;
 *  • tombol lihat-sandi terjangkau papan ketik — implementasi manual sebelum
 *    #188 memasang `tabIndex={-1}`, sehingga ia hanya ada untuk tetikus.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PasswordField, PasswordInput } from "@/components/ui/password-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ServerSearchableSelect } from "@/components/ui/server-searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";

/** Komponen berpencarian memanggil `useT`; tanpa provider ia berteriak di console. */
function renderInId(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider locale="id" dictionary={id as Dictionary}>
      {node}
    </LocaleProvider>
  );
}

describe("Textarea", () => {
  it("telanjang: satu <textarea>, tanpa pembungkus", () => {
    const html = renderToStaticMarkup(<Textarea id="catatan" rows={3} />);
    expect(html.startsWith("<textarea")).toBe(true);
    expect(html).toContain('id="catatan"');
  });

  it("aria-invalid dari FormControl menyalakan gaya error AntD", () => {
    // Versi Tailwind memakai selektor `aria-[invalid=true]:`; AntD memakai prop
    // `status`, jadi atributnya harus dibaca di JavaScript — bukan diserahkan
    // ke CSS yang tidak ada lagi.
    expect(renderToStaticMarkup(<Textarea aria-invalid />)).toContain(
      "ant-input-status-error"
    );
    expect(renderToStaticMarkup(<Textarea />)).not.toContain("ant-input-status-error");
  });
});

describe("PasswordInput", () => {
  it("tombol lihat-sandi terjangkau papan ketik dan mengumumkan keadaannya", () => {
    const html = renderToStaticMarkup(<PasswordField id="sandi" />);
    expect(html).toContain('role="button"');
    // Inilah kenaikan aksesibilitas dari #188: dulu `tabIndex={-1}`.
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("aria-pressed");
    expect(html).toContain("aria-label");
  });

  it("tetap type=password sampai tombolnya ditekan", () => {
    expect(renderToStaticMarkup(<PasswordField />)).toContain('type="password"');
  });

  it("pesan error terhubung ke isiannya dan diumumkan", () => {
    const html = renderToStaticMarkup(
      <PasswordInput label="Sandi" error="Terlalu pendek" />
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("ant-input-status-error");

    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("label tertaut ke isian, bukan ke pembungkus affix AntD", () => {
    const html = renderToStaticMarkup(<PasswordInput label="Sandi" />);
    const inputId = html.match(/<input[^>]*id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`for="${inputId}"`);
  });
});

describe("SearchableSelect", () => {
  it("bisa dicari, dan pilihan yang sudah ada bisa dikosongkan", () => {
    const options = [{ value: "1", label: "PT Alfa", description: "Jakarta" }];
    const kosong = renderInId(
      <SearchableSelect
        options={options}
        value={null}
        onChange={() => {}}
        label="Pelanggan"
        placeholder="Pilih pelanggan"
      />
    );
    expect(kosong).toContain("ant-select-show-search");
    expect(kosong).toContain("Pilih pelanggan");

    // Tombol × hanya muncul saat ada yang bisa dikosongkan — sama seperti
    // versi cmdk sebelumnya, yang menyembunyikannya saat `value` null.
    const terisi = renderInId(
      <SearchableSelect options={options} value="1" onChange={() => {}} />
    );
    expect(terisi).toContain("ant-select-allow-clear");
    expect(terisi).toContain("PT Alfa");
  });

  it("value null berarti placeholder, bukan pilihan bernama 'null'", () => {
    // `null` adalah "belum dipilih" bagi pemanggil; bagi AntD ia nilai yang sah
    // dan hanya `undefined` yang memunculkan placeholder.
    const html = renderInId(
      <SearchableSelect options={[]} value={null} onChange={() => {}} placeholder="Pilih" />
    );
    expect(html).toContain("ant-select-placeholder");
    expect(html).not.toContain("null");
  });
});

describe("ServerSearchableSelect", () => {
  it("label pilihan awal tampil sebelum halaman hasil pertama dimuat", () => {
    // Server yang menyaring: daftarnya masih kosong saat render pertama, jadi
    // AntD tidak punya opsi yang cocok dengan `value` — tanpa `labelRender`,
    // pemicunya akan menampilkan id mentah.
    const html = renderInId(
      <ServerSearchableSelect
        fetchUrl="/api/invoices?picker=1"
        value="42"
        initialOption={{ value: "42", label: "INV-2026-0042", hint: "PT Alfa" }}
        onChange={() => {}}
      />
    );
    expect(html).toContain("INV-2026-0042");
    expect(html).not.toContain(">42<");
  });
});
