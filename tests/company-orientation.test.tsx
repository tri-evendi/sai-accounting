/**
 * "Buku siapa yang sedang saya tulis?" — orientasi perusahaan di chrome aplikasi.
 *
 * Sejak #104 setiap PT punya basis datanya sendiri, dan satu kekeliruan menjadi
 * yang paling mahal di seluruh aplikasi: mencatat transaksi ke perusahaan yang
 * salah. Kekeliruan itu TIDAK BERBUNYI saat terjadi — tidak ada galat, tidak
 * ada peringatan — dan baru muncul berbulan-bulan kemudian sebagai neraca yang
 * tidak cocok. Satu-satunya pencegah yang bekerja adalah orientasi yang selalu
 * terlihat, bukan yang harus dicari.
 *
 * Yang dijaga di sini karena itu bukan "komponennya merender sesuatu",
 * melainkan tiga janji yang mudah sekali hilang dalam refactor berikutnya:
 * namanya tampil, tata letak benar-benar mengopernya, dan layar tanpa
 * perusahaan tidak menjadi jalan buntu.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { CompanyIndicator } from "@/components/layout/company-indicator";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";
import en from "@/lib/i18n/dictionaries/en.json";
import zh from "@/lib/i18n/dictionaries/zh.json";

const SRC = join(__dirname, "..", "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

function render(companyName: string | null, dictionary: Dictionary | null = null) {
  const node = <CompanyIndicator companyName={companyName} />;
  return renderToStaticMarkup(
    dictionary ? (
      <LocaleProvider locale="id" dictionary={dictionary}>
        {node}
      </LocaleProvider>
    ) : (
      node
    )
  );
}

describe("penanda perusahaan aktif", () => {
  it("menyebut nama perusahaan yang sedang dibuka", () => {
    expect(render("PT Bumi Baru", id as unknown as Dictionary)).toContain("PT Bumi Baru");
  });

  it("namanya diberi label di ketiga bahasa — bukan teks telanjang", () => {
    // Tanpa label, pembaca layar hanya mendengar sebuah nama dan tidak tahu
    // bahwa ITULAH perusahaan yang sedang ditulisi.
    for (const dictionary of [id, en, zh]) {
      const html = render("PT Bumi Baru", dictionary as unknown as Dictionary);
      expect(html).toContain((dictionary as unknown as Dictionary).navbar.activeCompany);
    }
  });

  it("nama panjang tetap bisa dibaca utuh (title) dan tidak memecah tata letak (truncate)", () => {
    const html = render("PT Perusahaan Dengan Nama Yang Sangat Panjang Sekali", id as unknown as Dictionary);
    expect(html).toContain('title="PT Perusahaan Dengan Nama Yang Sangat Panjang Sekali"');
    expect(html).toContain("truncate");
  });

  it("tanpa perusahaan aktif tidak merender apa pun — bukan menebak nama", () => {
    expect(render(null)).toBe("");
  });
});

describe("orientasi tidak boleh hilang dari chrome", () => {
  it("tata letak dashboard mengoper perusahaan aktif ke top bar", () => {
    // Menghapus prop ini akan lolos tsc bila suatu saat ia dibuat opsional —
    // dan penandanya menghilang tanpa satu pun tes merah.
    expect(read("app/(dashboard)/layout.tsx")).toMatch(/companyName={session\.user\.companyName}/);
  });

  it("top bar merender penandanya", () => {
    expect(read("components/layout/navbar.tsx")).toMatch(/<CompanyIndicator/);
  });

  it("sesi membawa nama perusahaan, jadi penandanya tidak perlu permintaan jaringan", () => {
    // Kalau ini hilang, penandanya masih bisa dibuat — tapi dengan fetch yang
    // membuatnya muncul terlambat, justru pada detik-detik orang mulai mengetik.
    expect(read("lib/auth.ts")).toMatch(/token\.companyName/);
  });
});

describe("layar tanpa perusahaan bukan jalan buntu", () => {
  it("pemilih perusahaan menawarkan jalan keluar di KEDUA cabangnya", () => {
    /*
     * Bukan hanya cabang "tidak punya perusahaan". Cabang normal pun tidak
     * punya chrome apa pun — tanpa tombol keluar, orang yang ternyata masuk
     * sebagai akun yang salah (komputer bersama) hanya bisa membuka buku
     * perusahaan dengan akun orang lain.
     */
    const page = read("app/(auth)/select-company/page.tsx");
    const branches = page.match(/SignedInAs/g) ?? [];
    expect(branches.length).toBeGreaterThanOrEqual(2);
  });

  it("identitasnya ikut ditulis — keluar baru berguna setelah sadar masuk sebagai siapa", () => {
    expect(read("app/(auth)/select-company/company-choices.tsx")).toMatch(
      /auth\.selectCompany\.signedInAs/
    );
  });

  it("jalan keluarnya benar-benar keluar (bukan tautan yang memantul balik)", () => {
    expect(read("app/(auth)/select-company/company-choices.tsx")).toMatch(
      /signOut\(\{\s*callbackUrl:\s*"\/login"\s*\}\)/
    );
  });
});
