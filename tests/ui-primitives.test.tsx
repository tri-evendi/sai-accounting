/**
 * Invarian primitif UI (issue #50).
 *
 * Yang dikunci di sini adalah janji-janji yang mudah hilang diam-diam saat
 * seseorang menyunting kelas Tailwind: tinggi target sentuh, ring fokus yang
 * hanya untuk keyboard, badge yang memakai pasangan warna lolos-kontras, dan
 * — yang paling mahal kalau rusak — kaitan ARIA antara isian dan pesan
 * error-nya. Semuanya diuji lewat markup yang benar-benar dirender, bukan
 * dengan membaca string kelas di sumbernya.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Card } from "@/components/ui/card";
import { Input, TextInput } from "@/components/ui/input";
import { NativeSelect, SEARCH_THRESHOLD, Select } from "@/components/ui/select";

/*
 * `Button` dan `Badge` sudah tidak diuji di sini sejak issue #187. Keduanya
 * kini merender komponen Ant Design, sehingga janji-janjinya (tinggi 40px,
 * cincin fokus, pasangan warna yang lolos kontras) tidak lagi berbentuk string
 * kelas yang bisa dicari di markup — mereka datang dari token dan baru muncul
 * setelah AntD menghitung gayanya. Penjaganya pindah, tidak hilang:
 * `tests/ui-controls-antd.test.tsx`, yang mengambil CSS hasil cssinjs dan
 * menghitung rasio kontrasnya.
 */

describe("Card", () => {
  it("meneruskan atribut data-*", () => {
    // Card lama hanya merender {children, className}, sehingga `data-tour`
    // hilang dan dua langkah tur terpandu faktur (lib/tours.ts) tidak pernah
    // menemukan sasarannya.
    expect(
      renderToStaticMarkup(<Card data-tour="faktur-identitas">isi</Card>)
    ).toContain('data-tour="faktur-identitas"');
  });
});

describe("Input", () => {
  it("menghubungkan pesan error ke isiannya dan mengumumkannya", () => {
    const html = renderToStaticMarkup(<Input label="Kurs" error="Wajib diisi" />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    // Sejak #188 kotaknya bergaya error lewat `status` AntD, bukan kelas CVA.
    // Yang diuji tetap hal yang sama: error yang diumumkan HARUS juga terlihat.
    expect(html).toContain("ant-input-status-error");

    // aria-describedby harus menunjuk id yang benar-benar ada di markup —
    // inilah bagian yang dulu tidak pernah dijamin.
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("tanpa error: tidak menandai diri invalid, label tetap tertaut", () => {
    const html = renderToStaticMarkup(<Input label="Nama" />);
    expect(html).not.toContain("aria-invalid");
    const inputId = html.match(/<input[^>]*id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`for="${inputId}"`);
  });

  it("telanjang: satu <input> tanpa pembungkus — syarat FormControl", () => {
    // `FormControl` (Radix Slot) menyalurkan `id`/`aria-*` ke kontrol. Begitu
    // `prefix`/`suffix`/`allowClear` dipasang, AntD menyisipkan affix-wrapper
    // dan atribut itu berpindah ke pembungkusnya.
    const html = renderToStaticMarkup(<TextInput id="nama" aria-invalid />);
    expect(html.startsWith("<input")).toBe(true);
    expect(html).toContain('id="nama"');
    expect(html).toContain("ant-input-status-error");
  });

  it("fieldSize='sm' turun ke ukuran kecil AntD, bawaannya tidak", () => {
    // Bawaan `md` sengaja TIDAK menyebut ukuran: tingginya datang dari token
    // `controlHeight: 40` di AntdProvider (target sentuh MASTER.md), bukan dari
    // prop per komponen yang harus diingat di isian ke-seratus.
    expect(renderToStaticMarkup(<TextInput fieldSize="sm" />)).toContain("ant-input-sm");
    expect(renderToStaticMarkup(<TextInput />)).not.toContain("ant-input-sm");
  });
});

describe("Select", () => {
  it("kini Select AntD, bukan <select> native, dan placeholder-nya tampil", () => {
    const html = renderToStaticMarkup(
      <Select
        label="Mata uang"
        placeholder="Pilih"
        options={[{ value: "IDR", label: "Rupiah" }]}
      />
    );
    expect(html).not.toContain("<select");
    expect(html).toContain("ant-select");
    expect(html).toContain("Pilih");
    // Label tetap tertaut ke kontrolnya — `id` mendarat di <input
    // role="combobox"> di dalam AntD, bukan di div akarnya.
    const inputId = html.match(/<input[^>]*id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`for="${inputId}"`);
  });

  it("kaitan error-nya sama seperti Input", () => {
    const html = renderToStaticMarkup(<Select error="Salah" options={[]} />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("ant-select-status-error");
  });

  it("`name` tetap ikut terkirim saat form disubmit", () => {
    // `Select` AntD bukan kontrol form. Sebelas berkas membaca
    // `new FormData(e.currentTarget)`, dua di antaranya `<form method="get">`
    // di server component — kalau nilainya berhenti terkirim, saringannya diam-
    // diam berhenti menyaring, tanpa satu pun galat.
    const html = renderToStaticMarkup(
      <NativeSelect
        name="status"
        defaultValue="draft"
        options={[{ value: "draft", label: "Draf" }]}
      />
    );
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="status"');
    expect(html).toContain('value="draft"');
  });

  it("tanpa `name`: tidak menambah simpul apa pun", () => {
    const html = renderToStaticMarkup(
      <NativeSelect options={[{ value: "draft", label: "Draf" }]} />
    );
    expect(html).not.toContain('type="hidden"');
  });

  it("pencarian menyala hanya untuk daftar panjang", () => {
    const opsi = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ value: String(i), label: `Akun ${i}` }));

    // Pendek: memunculkan papan tik ponsel untuk memilih satu dari empat adalah
    // langkah tambahan, bukan bantuan.
    expect(renderToStaticMarkup(<NativeSelect options={opsi(4)} />)).not.toContain(
      "ant-select-show-search"
    );
    expect(
      renderToStaticMarkup(<NativeSelect options={opsi(SEARCH_THRESHOLD + 1)} />)
    ).toContain("ant-select-show-search");
    // Ambangnya boleh ditimpa eksplisit.
    expect(
      renderToStaticMarkup(<NativeSelect searchable options={opsi(2)} />)
    ).toContain("ant-select-show-search");
  });

  it("`required` mengumumkan diri walau validasi native sudah tidak ada", () => {
    // `<select required>` dulu ditolak peramban saat kosong. AntD tidak punya
    // kontrol yang bisa divalidasi, jadi yang tersisa adalah pengumuman ke
    // pembaca layar + tanda `*`; penjaga sebenarnya adalah validasi server.
    const html = renderToStaticMarkup(
      <Select label="Kategori" required options={[]} />
    );
    expect(html).toContain('aria-required="true"');
    expect(html).toContain("(wajib)");
  });
});
