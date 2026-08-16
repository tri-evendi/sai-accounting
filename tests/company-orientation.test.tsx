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
import { visibleNavHrefs } from "@/lib/nav";
import { ROLES } from "@/lib/constants";
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

  it("nama panjang tetap bisa dibaca utuh (title) dan tidak memecah tata letak (elipsis)", () => {
    /*
     * Sejak issue #193 chrome aplikasi tidak lagi memakai Tailwind, jadi yang
     * dicari bukan lagi kelas `truncate` melainkan tiga properti yang DULU
     * dirakitnya. Ketiganya harus ada bersama-sama: `text-overflow` tanpa
     * `overflow: hidden` tidak memotong apa pun, dan tanpa `white-space:
     * nowrap` namanya membungkus ke baris kedua dan menaikkan tinggi bilah.
     */
    const html = render("PT Perusahaan Dengan Nama Yang Sangat Panjang Sekali", id as unknown as Dictionary);
    expect(html).toContain('title="PT Perusahaan Dengan Nama Yang Sangat Panjang Sekali"');
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("white-space:nowrap");
  });

  it("tanpa perusahaan aktif tidak merender apa pun — bukan menebak nama", () => {
    expect(render(null)).toBe("");
  });
});

describe("penanda menjadi jalan berpindah — hanya bila ada yang lain", () => {
  it("satu perusahaan: teks biasa, bukan tautan yang memantul balik", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="id" dictionary={id as unknown as Dictionary}>
        <CompanyIndicator companyName="PT Satu" companyCount={1} />
      </LocaleProvider>
    );
    expect(html).not.toContain("<a ");
    expect(html).toContain("PT Satu");
  });

  it("lebih dari satu: tautan ke pemilih perusahaan", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="id" dictionary={id as unknown as Dictionary}>
        <CompanyIndicator companyName="PT Satu" companyCount={2} />
      </LocaleProvider>
    );
    expect(html).toContain('href="/select-company"');
    // Namanya saja tidak memberi tahu bahwa ia bisa ditekan.
    expect(html).toContain((id as unknown as Dictionary).auth.selectCompany.switchLabel);
  });

  it("tanpa informasi jumlah, tidak menawarkan apa pun", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="id" dictionary={id as unknown as Dictionary}>
        <CompanyIndicator companyName="PT Satu" />
      </LocaleProvider>
    );
    expect(html).not.toContain("<a ");
  });
});

describe("menu & palet menawarkan pemilih dengan syarat yang SAMA", () => {
  const user = { role: ROLES.MANAGING_DIRECTOR as string, accountantMode: null };

  it("satu perusahaan: tidak muncul di menu (maka juga tidak di palet)", () => {
    expect(visibleNavHrefs({ ...user, companyCount: 1 })).not.toContain("/select-company");
  });

  it("dua perusahaan: muncul", () => {
    expect(visibleNavHrefs({ ...user, companyCount: 2 })).toContain("/select-company");
  });

  it("jumlahnya tidak diketahui: disembunyikan, bukan ditawarkan spekulatif", () => {
    expect(visibleNavHrefs(user)).not.toContain("/select-company");
  });
});

describe("orientasi tidak boleh hilang dari chrome", () => {
  it("tata letak dashboard mengoper perusahaan aktif ke top bar", () => {
    // Menghapus prop ini akan lolos tsc bila suatu saat ia dibuat opsional —
    // dan penandanya menghilang tanpa satu pun tes merah.
    expect(read("app/(app)/(dashboard)/layout.tsx")).toMatch(/companyName={session\.user\.companyName}/);
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
    const page = read("app/(app)/(auth)/select-company/page.tsx");
    const branches = page.match(/SignedInAs/g) ?? [];
    expect(branches.length).toBeGreaterThanOrEqual(2);
  });

  /*
   * `SignedInAs` pindah ke `components/auth/` di issue #172: `/platform` —
   * pendaratan pasca-masuk yang juga berdiri tanpa chrome — membutuhkan janji
   * yang sama persis, dan dua salinan janji "ada jalan keluar" adalah cara
   * salah satunya diam-diam hilang.
   */
  it("identitasnya ikut ditulis — keluar baru berguna setelah sadar masuk sebagai siapa", () => {
    expect(read("components/auth/signed-in-as.tsx")).toMatch(
      /auth\.selectCompany\.signedInAs/
    );
  });

  it("jalan keluarnya benar-benar keluar (bukan tautan yang memantul balik)", () => {
    expect(read("components/auth/signed-in-as.tsx")).toMatch(
      /signOut\(\{\s*callbackUrl:\s*"\/login"\s*\}\)/
    );
  });

  it("dan pendaratan pasca-masuk memakai komponen yang sama (issue #172)", () => {
    /*
     * DI KERANGKANYA, bukan di halamannya. Sejak permukaan `/platform` dipecah
     * menjadi rute-rute sendiri (ringkasan, tim, tagihan, paket, privasi),
     * menaruh jalan keluar di salah satu halaman berarti empat halaman lain
     * tidak punya — dan yang paling mungkin dibuka orang dari bookmark justru
     * bukan pendaratannya. Kerangka menjaminnya untuk seluruh permukaan
     * sekaligus, dan hanya ada satu tempat yang bisa lupa.
     */
    /*
     * ⚠ Bentuk jaminannya BERGESER, isinya tidak. Kepala panel dulu memajang
     * `SignedInAs` + pengalih bahasa + pengalih tema sebagai kendali lepas;
     * kini keempatnya satu `UserMenu` — komponen yang SAMA dengan bilah atas
     * dasbor, jadi identitas & jalan keluar tidak lagi punya dua bentuk di dua
     * kulit. Yang dijaga tetap sama: kerangkanya, bukan halamannya, yang
     * menjaminnya untuk seluruh permukaan sekaligus.
     */
    expect(read("components/tenant/platform-shell.tsx")).toContain("<UserMenu ");
    expect(read("app/(app)/(tenant)/(panel)/layout.tsx")).toMatch(/userName=\{user\.name/);
  });
});
