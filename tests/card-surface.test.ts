/**
 * Penjaga PERMUKAAN KARTU — satu resep, bukan keluarga kedua.
 *
 * ══ APA YANG SEBENARNYA DIJAGA ═════════════════════════════════════════════
 * Issue #266 menjawab keluhan "dominan putih-hitam dengan **outline saja**"
 * dengan menambahkan ANGKAT pada `ui/card.tsx` (`boxShadowTertiary`) — jenjang
 * yang dikerjakan di perender karena lapisan token buntu. Jawaban itu hanya
 * berlaku untuk kotak yang benar-benar dirender oleh `Card`.
 *
 * Diukur Okt 2026: **17 blok gaya** di luar `ui/card.tsx` menggambar resep yang
 * sama persis — `colorBgContainer` + `colorBorderSecondary` + `borderRadiusLG`
 * — dan **9 di antaranya tanpa angkat**. Semuanya benar sendiri-sendiri;
 * berdampingan di satu layar, yang sembilan itu duduk lebih "rata" daripada
 * kartu di sebelahnya tanpa ada satu baris pun yang bisa ditunjuk sebagai
 * salah.
 *
 * ══ DUA ATURAN, SEBAB TERNYATA MASALAHNYA DUA ══════════════════════════════
 * Memeriksanya satu per satu memperlihatkan bahwa "tambahkan bayangan" adalah
 * jawaban yang BENAR untuk sebagian dan SALAH untuk sisanya:
 *
 *  1. **Kotak yang berdiri di atas latar halaman = kartu.** Ia memikul satu
 *     wilayah isi, dan pemisahnya harus sama dengan pemisah kartu lain di
 *     layar yang sama: tepi + angkat.
 *
 *  2. **Kotak yang bersarang DI DALAM kartu bukan kartu kedua.** Memberinya
 *     `colorBgContainer` berarti ia sewarna persis dengan induknya, sehingga
 *     yang memisahkan tinggal garis — "outline saja" dalam bentuk kecil, di
 *     dalam wilayah yang sudah bergaris. Yang benar `fillQuaternary`: memisah
 *     dengan BIDANG tanpa menambah garis. (Pola yang sama dipakai kisi fakta
 *     di `/operator/tenants/[id]`.)
 *
 * Penjaga di bawah menegakkan (1) dan mencatat (2) sebagai keputusan yang sudah
 * diambil di dua tempat — ia tidak bisa memeriksa "apakah induknya kartu" dari
 * teks, jadi yang dijaga adalah bentuk yang BISA diperiksa, dan sisanya ditulis.
 */
import { describe, expect, it } from "vitest";
import { akarSumber } from "./akar-sumber";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function berkasTsx(dir: string): string[] {
  const out: string[] = [];
  for (const nama of readdirSync(dir)) {
    const jalur = join(dir, nama);
    if (statSync(jalur).isDirectory()) out.push(...berkasTsx(jalur));
    else if (nama.endsWith(".tsx")) out.push(jalur);
  }
  return out;
}

/** Objek gaya: `const X = {…}`, `style={{…}}`, `return {…}`. */
function blokGaya(src: string): string[] {
  const out: string[] = [];
  const awal = /(const \w+(?:: React\.CSSProperties)? = \{|style=\{\{|return \{)/g;
  let m: RegExpExecArray | null;
  while ((m = awal.exec(src)) !== null) {
    let depth = 0;
    let j = m.index + m[0].length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth += 1;
      else if (src[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(m.index, j + 1));
  }
  return out;
}

const BG = /(background|backgroundColor):\s*(token\.colorBgContainer|"var\(--ant-color-bg-container\)")/;
const TEPI = /border:\s*[`"].*?(colorBorderSecondary|color-border-secondary)/;
const RADIUS = /borderRadius:\s*(token\.borderRadiusLG|"var\(--ant-border-radius-lg\)")/;

/**
 * Yang BOLEH memakai resep kartu tanpa angkatnya.
 *
 * Daftar sempit dan beralasan. Satu entri hari ini — kalau ia memanjang,
 * aturannya yang salah, bukan daftarnya yang kurang.
 */
const DIIZINKAN: ReadonlyArray<{ berkas: string; alasan: string }> = [
  {
    berkas: "src/components/docs/docs-figures.tsx",
    alasan:
      "Kotak-kotaknya BENTUK di dalam sebuah gambar, bukan wilayah isi: tiga sampai " +
      "lima berjajar menyusun satu diagram. Memberi lima bentuk itu bayangan tidak " +
      "membuat diagramnya lebih terbaca; ia membuatnya terbaca sebagai tumpukan kartu.",
  },
];

describe("resep kartu selalu membawa angkatnya", () => {
  const berkas = akarSumber()
    .flatMap((d) => berkasTsx(d))
    .filter((f) => !f.endsWith(join("packages", "ui", "src", "components", "card.tsx")));

  it("sapuannya benar-benar membaca banyak berkas", () => {
    expect(berkas.length).toBeGreaterThan(200);
  });

  it("pendeteksinya mengenali resepnya — dibuktikan, bukan diandaikan", () => {
    const contoh = `const X: React.CSSProperties = {
      padding: "var(--ant-padding)",
      borderRadius: "var(--ant-border-radius-lg)",
      border: "1px solid var(--ant-color-border-secondary)",
      background: "var(--ant-color-bg-container)",
    };`;
    const blok = blokGaya(contoh);
    expect(blok).toHaveLength(1);
    expect(BG.test(blok[0]) && TEPI.test(blok[0]) && RADIUS.test(blok[0])).toBe(true);
    expect(blok[0].includes("boxShadow")).toBe(false);
  });

  it("tidak ada permukaan kartu tanpa `boxShadow` di luar daftar-izin", () => {
    const izin = new Set(DIIZINKAN.map((d) => d.berkas));
    const pelanggar: string[] = [];
    for (const jalur of berkas) {
      const relatif = jalur.replace(`${ROOT}/`, "");
      if (izin.has(relatif)) continue;
      for (const blok of blokGaya(readFileSync(jalur, "utf8"))) {
        if (BG.test(blok) && TEPI.test(blok) && RADIUS.test(blok) && !blok.includes("boxShadow")) {
          pelanggar.push(relatif);
          break;
        }
      }
    }
    expect(
      pelanggar,
      pelanggar.length === 0
        ? ""
        : "Resep kartu tanpa angkatnya:\n\n  " +
            pelanggar.join("\n  ") +
            "\n\nKalau kotak itu BERDIRI di atas latar halaman, tambahkan " +
            '`boxShadow: "var(--ant-box-shadow-tertiary)"` — jenjang #266, nilai yang ' +
            "sama dengan `ui/card.tsx`.\nKalau ia BERSARANG di dalam kartu, resepnya " +
            "yang salah: `colorBgContainer` membuatnya sewarna induknya sehingga hanya " +
            "garis yang memisahkan. Pakai `colorFillQuaternary` tanpa tepi.\nKalau ia " +
            "bagian dari GAMBAR, tambahkan berkasnya ke DIIZINKAN beserta alasannya."
    ).toEqual([]);
  });

  it("daftar-izinnya tidak basi — entri yang sudah patuh harus dicabut", () => {
    for (const { berkas: relatif } of DIIZINKAN) {
      const src = readFileSync(join(ROOT, relatif), "utf8");
      const masih = blokGaya(src).some(
        (b) => BG.test(b) && TEPI.test(b) && RADIUS.test(b) && !b.includes("boxShadow")
      );
      expect(masih, `${relatif} sudah patuh — cabut dari DIIZINKAN`).toBe(true);
    }
  });

  it("daftar-izinnya tetap pendek", () => {
    expect(DIIZINKAN.length).toBeLessThanOrEqual(3);
  });
});

describe("kotak bersarang memakai isian, bukan permukaan kedua", () => {
  /*
   * Dua tempat yang keputusannya sudah diambil, dijaga agar tidak dibalik
   * diam-diam. Bukan sapuan: "apakah induknya kartu" tidak bisa dibaca dari
   * teks satu berkas, jadi yang dijaga adalah dua kasus yang SUDAH diperiksa
   * ke pemanggilnya.
   */
  it("rantai dokumen (di dalam Card) memakai `fillQuaternary`", () => {
    const src = readFileSync(
      join(SRC, "components", "shared", "document-chain-timeline.tsx"),
      "utf8"
    );
    expect(src).toContain("var(--ant-color-fill-quaternary)");
    expect(src).not.toContain("var(--ant-color-bg-container)");
  });

  it("kelompok isian pemasok (di dalam Card) memakai `colorFillQuaternary`", () => {
    const src = readFileSync(
      join(SRC, "app", "(app)", "(dashboard)", "t", "[tenantSlug]", "[companySlug]",
        "suppliers", "[id]", "transaction-form.tsx"),
      "utf8"
    );
    expect(src).toContain("token.colorFillQuaternary");
  });
});
