/**
 * KEADAAN KOSONG PUNYA PERMUKAAN — dan `flat` tetap pengecualian.
 *
 * ══ Yang dijaga, dan kenapa ia perlu dijaga ════════════════════════════════
 * Blok keadaan-kosong dulu digambar telanjang di atas latar halaman. Yang
 * membuat itu salah bukan selera melainkan percabangan yang dipakai kesebelas
 * halaman daftar:
 *
 *     {rows.length === 0 ? <EmptyState … /> : <Card>…tabel…</Card>}
 *
 * Halaman punya kartu bertepi ketika berisi, dan TIDAK PUNYA APA-APA tepat
 * ketika isinya nol — permukaannya lenyap justru pada keadaan yang paling
 * membingungkan pengguna baru, dan hasilnya terbaca sebagai halaman yang gagal
 * memuat. Permukaannya karena itu pindah ke primitifnya (diukur saat itu: 51
 * pemanggil telanjang, 2 di dalam `CardContent`).
 *
 * Prop `flat` adalah jalan keluar untuk dua pemanggil yang cabang berisinya
 * memakai kartu yang sama. Ia mudah sekali menyebar — "ada prop untuk
 * mematikannya" adalah undangan — dan setiap penyebarannya mengembalikan cacat
 * aslinya satu halaman demi satu halaman, tanpa satu pun galat. Tes ini membuat
 * penyebaran itu tidak bisa sunyi: menambah pemakai `flat` = daftar di bawah
 * harus disunting, dan penyuntingnya wajib menyebut alasannya.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const berkas = sourceFiles(SRC).map((f) => ({
  rel: relative(SRC, f).split(sep).join("/"),
  kode: readFileSync(f, "utf8"),
}));

/**
 * Pemanggil yang SAH memakai `flat`, beserta alasannya.
 *
 * Keduanya sama: `EmptyState` berdiri di dalam `Card` milik pemanggil yang
 * cabang BERISI-nya juga memakai kartu itu, jadi permukaan kedua akan menjadi
 * kartu di dalam kartu — dua tepi berjarak 24px yang tidak menandai apa pun.
 */
const FLAT_TERSAHKAN = [
  // Kartu daftar PT; cabang berisinya kisi "satu pintu per PT" di kartu yang sama.
  "app/(tenant)/(panel)/platform/team/page.tsx",
  // Kartu baris barang; kartunya punya kepala beraksi sendiri ("Tambah baris").
  "app/(dashboard)/t/[tenantSlug]/[companySlug]/delivery-orders/new/delivery-order-form.tsx",
].sort();

describe("keadaan kosong menggambar permukaannya sendiri", () => {
  it("pemindainya memindai yang benar", () => {
    /* Kalau telusurnya rusak (jalur salah, filter kelewat rakus), tes di bawah
       lulus dengan daftar kosong. Ini yang menahan kegagalan diam itu. */
    expect(berkas.length).toBeGreaterThan(400);
    expect(berkas.some((b) => b.rel === "components/ui/empty-state.tsx")).toBe(true);
  });

  it("primitifnya benar-benar menggambar tepi, latar, dan bayangan", () => {
    const kode = berkas.find((b) => b.rel === "components/ui/empty-state.tsx")!.kode;
    for (const token of ["colorBorderSecondary", "colorBgContainer", "boxShadowTertiary"]) {
      expect(kode, `permukaan keadaan-kosong kehilangan ${token}`).toContain(token);
    }
  });

  it("`flat` hanya dipakai pemanggil yang sudah disahkan", () => {
    const pemakai = berkas
      .filter((b) => b.rel !== "components/ui/empty-state.tsx")
      .filter((b) => /<EmptyState[^>]*\bflat\b/.test(b.kode.replace(/\n/g, " ")))
      .map((b) => b.rel)
      .sort();

    expect(
      pemakai,
      "Pemanggil berikut mematikan permukaan keadaan-kosong tanpa terdaftar.\n\n" +
        "`flat` HANYA untuk blok yang sudah berada di dalam `Card` milik pemanggil. " +
        "Keadaan-kosong yang berdiri sendiri di halaman WAJIB punya permukaan — " +
        "tanpa itu halaman kehilangan bentuknya tepat ketika isinya nol, dan " +
        "terbaca sebagai halaman yang gagal memuat. Kalau pemakaian ini memang " +
        "sah, tambahkan berkasnya ke FLAT_TERSAHKAN beserta alasannya."
    ).toEqual(FLAT_TERSAHKAN);
  });
});
