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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

describe("Button", () => {
  it("default-nya primary, setinggi 40px (target sentuh MASTER.md)", () => {
    const html = renderToStaticMarkup(<Button>Simpan</Button>);
    expect(html).toContain("bg-primary");
    expect(html).toContain("h-10");
    expect(html).toContain("cursor-pointer");
  });

  it("ring fokus hanya untuk keyboard — tidak ada `focus:` gaya lama", () => {
    const html = renderToStaticMarkup(<Button>Simpan</Button>);
    expect(html).toContain("focus-visible:ring-2");
    // `focus:ring` menyala juga saat diklik mouse; itu yang ditinggalkan.
    expect(html).not.toMatch(/[^-]focus:ring/);
  });

  it("alias shadcn menghasilkan kelas identik dengan nama domain", () => {
    // Kalau keduanya sempat menyimpang, tombol hapus di satu halaman bisa
    // berbeda warna dari halaman lain tanpa ada yang sadar.
    expect(renderToStaticMarkup(<Button variant="destructive">x</Button>)).toBe(
      renderToStaticMarkup(<Button variant="danger">x</Button>)
    );
    expect(renderToStaticMarkup(<Button variant="default">x</Button>)).toBe(
      renderToStaticMarkup(<Button variant="primary">x</Button>)
    );
  });
});

describe("Badge", () => {
  it("memakai pasangan soft/strong, bukan pola /10 yang gagal kontras", () => {
    const html = renderToStaticMarkup(<Badge variant="success">Lunas</Badge>);
    expect(html).toContain("bg-success-soft");
    expect(html).toContain("text-success-strong");
  });

  it("isinya tetap kata — warna tidak pernah jadi satu-satunya penanda", () => {
    expect(renderToStaticMarkup(<Badge variant="danger">Jatuh Tempo</Badge>)).toContain(
      "Jatuh Tempo"
    );
  });
});

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
    expect(html).toContain("border-destructive");

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
});

describe("Select", () => {
  it("tetap <select> native, dengan placeholder dan opsinya", () => {
    const html = renderToStaticMarkup(
      <Select
        label="Mata uang"
        placeholder="Pilih"
        options={[{ value: "IDR", label: "Rupiah" }]}
      />
    );
    expect(html).toContain("<select");
    expect(html).toContain('value="IDR"');
    expect(html).toContain("Pilih");
  });

  it("kaitan error-nya sama seperti Input", () => {
    const html = renderToStaticMarkup(
      <Select error="Salah" options={[]} />
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
  });

  it("tingginya sama dengan Input — keduanya berbagi fieldVariants", () => {
    expect(renderToStaticMarkup(<Input />)).toContain("h-10");
    expect(renderToStaticMarkup(<Select options={[]} />)).toContain("h-10");
  });
});
