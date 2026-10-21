/**
 * PENJAGA celah on-premise #2 & #3 — artefak lisensi dan pintu entitlement.
 *
 * Lisensi punya bentuk kegagalan yang tidak dimiliki kode lain di repo ini: ia
 * dinilai di mesin yang TIDAK BISA KITA LIHAT, oleh berkas yang dikirim lewat
 * surel, dan salahnya baru terdengar sebagai keluhan. Jadi yang diuji di sini
 * bukan "apakah fungsinya jalan" melainkan apa yang terjadi pada setiap bentuk
 * berkas yang salah — dan satu hal yang lebih penting dari semuanya: bahwa
 * lapis baru ini TIDAK mengubah perilaku pemasangan SaaS yang sudah berjalan.
 */
import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LICENCE_PUBLIC_KEY_PEM,
  licencePayloadBytes,
  verifyLicence,
  type Licence,
} from "@sai/core/licence";
import {
  entitlementFromLicence,
  entitlementFromPlan,
  intersectModules,
  moduleLicensed,
  overLimit,
} from "@sai/core/entitlement";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUB = publicKey.export({ type: "spki", format: "pem" }).toString();

const LISENSI: Licence = {
  licenceId: "lic-1",
  customer: "PT Maju Jaya",
  issuedAt: "2026-10-20T00:00:00.000Z",
  supportEndsAt: "2027-10-20T00:00:00.000Z",
  maxCompanies: 3,
  maxUsers: 25,
  modules: ["core_accounting", "manufacturing"],
  maxVersion: "1.4.0",
};

/** Terbitkan berkas seperti `licence:issue` melakukannya. */
const terbitkan = (l: Licence = LISENSI, kunci = privateKey): string => {
  const payload = licencePayloadBytes(l);
  return `${payload.toString("base64url")}.${signBytes(null, payload, kunci).toString("base64url")}`;
};

describe("lisensi: tanda tangan", () => {
  it("berkas yang sah terbaca utuh", () => {
    const v = verifyLicence(terbitkan(), PUB, new Date("2026-10-21"));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.licence).toEqual(LISENSI);
    expect(v.supportExpired).toBe(false);
  });

  it("payload yang diubah satu byte DITOLAK", () => {
    // Inti seluruh mekanismenya: customer yang menaikkan `maxUsers` sendiri.
    const dioplos = { ...LISENSI, maxUsers: 9999 };
    const payload = licencePayloadBytes(dioplos).toString("base64url");
    const sig = terbitkan().split(".")[1]!;
    const v = verifyLicence(`${payload}.${sig}`, PUB);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toMatch(/tanda tangan tidak cocok/);
  });

  it("tanda tangan dari kunci LAIN ditolak", () => {
    const lain = generateKeyPairSync("ed25519").privateKey;
    const v = verifyLicence(terbitkan(LISENSI, lain), PUB);
    expect(v.ok).toBe(false);
  });

  it("bentuk berkas yang rusak ditolak dengan sebab, bukan lemparan", () => {
    for (const buruk of ["", ".", "satu-bagian", "a.b.c", "!!!.!!!", `${"x".repeat(40)}.y`]) {
      const v = verifyLicence(buruk, PUB);
      expect(v.ok, buruk).toBe(false);
    }
  });

  it("payload diurai SETELAH tanda tangan diperiksa", () => {
    /* JSON tak sah yang ditandatangani kunci ASING harus gagal karena tanda
       tangannya — bukan karena JSON-nya. Kalau urutannya terbalik, isi berkas
       pihak lain mulai dipercaya sedikit demi sedikit. */
    const lain = generateKeyPairSync("ed25519").privateKey;
    const sampah = Buffer.from("{bukan json", "utf8");
    const berkas = `${sampah.toString("base64url")}.${signBytes(null, sampah, lain).toString("base64url")}`;
    const v = verifyLicence(berkas, PUB);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.reason).toMatch(/tanda tangan/);
  });
});

describe("lisensi: payload yang salah terbit", () => {
  const tolak = (ubah: Record<string, unknown>, pola: RegExp) => {
    const payload = Buffer.from(JSON.stringify({ ...LISENSI, ...ubah }), "utf8");
    const berkas = `${payload.toString("base64url")}.${signBytes(null, payload, privateKey).toString("base64url")}`;
    const v = verifyLicence(berkas, PUB);
    expect(v.ok, JSON.stringify(ubah)).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(pola);
  };

  it("menolak `modules` daftar kosong", () => {
    // Lisensi yang tidak mengizinkan satu modul pun = aplikasi kosong. Hampir
    // pasti salah terbit, dan menolaknya di sini lebih murah daripada customer
    // yang membuka layar tanpa apa pun.
    tolak({ modules: [] }, /daftar kosong/);
  });

  it("menolak batas negatif atau bukan bilangan bulat", () => {
    tolak({ maxUsers: -1 }, /maxUsers/);
    tolak({ maxCompanies: 1.5 }, /maxCompanies/);
  });

  it("menolak tanggal yang tidak terbaca", () => {
    tolak({ issuedAt: "kemarin" }, /issuedAt/);
    tolak({ supportEndsAt: "segera" }, /supportEndsAt/);
  });

  it("menerima dukungan tanpa batas waktu (`null`)", () => {
    const v = verifyLicence(terbitkan({ ...LISENSI, supportEndsAt: null }), PUB);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.supportExpired).toBe(false);
  });
});

describe("lisensi: dukungan berakhir TIDAK mematikan apa pun", () => {
  it("lisensi lewat masa dukungan tetap `ok`, hanya ditandai", () => {
    /* Doktrin produk, bukan detail: data milik customer, dan catatan pajaknya
       wajib disimpan bertahun-tahun. "Bayar atau kehilangan akses ke
       pembukuanmu sendiri" bukan hubungan dagang yang pantas ditawarkan. */
    const v = verifyLicence(terbitkan(), PUB, new Date("2028-01-01"));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.supportExpired).toBe(true);
    expect(v.licence.modules).toEqual(["core_accounting", "manufacturing"]);
  });

  it("tidak ada fungsi di modul lisensi yang bisa dipakai memblokir", () => {
    const src = readFileSync(join(process.cwd(), "packages/core/src/licence.ts"), "utf8");
    const kode = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    for (const kata of ["throw new Error", "process.exit", "blocked", "denied"]) {
      // `verifyLicence` MENGEMBALIKAN vonis; ia tidak pernah melempar maupun
      // keluar, supaya tidak satu pun pemanggil bisa menjadikannya pemadaman.
      expect(kode, `memuat ${kata}`).not.toContain(kata);
    }
  });
});

describe("lisensi: kunci publik ditanam, gagal-tertutup sebelum ditanam", () => {
  it("selama placeholder, TIDAK ada lisensi yang sah", () => {
    expect(LICENCE_PUBLIC_KEY_PEM).toBe("BELUM-DISETEL");
    const v = verifyLicence(terbitkan());
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/belum ditanam/);
  });

  it("kunci publik TIDAK dibaca dari environment", () => {
    /* Kunci publik dari env berarti siapa pun yang bisa menyetel env di mesin
       itu bisa menukarnya dengan kuncinya sendiri — dan seluruh tanda tangan
       jadi hiasan. */
    const src = readFileSync(join(process.cwd(), "packages/core/src/licence.ts"), "utf8");
    const kode = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    expect(kode).not.toContain("process.env");
  });

  it("kunci PRIVAT tidak pernah disebut di kode aplikasi", () => {
    const src = readFileSync(join(process.cwd(), "packages/core/src/licence.ts"), "utf8");
    expect(src).not.toContain("createPrivateKey");
    expect(src).not.toContain("PRIVATE KEY");
  });
});

describe("entitlement: satu bentuk, dua sumber", () => {
  it("sumber SaaS selalu `all` — paket membawa BATAS, bukan daftar modul", () => {
    const e = entitlementFromPlan({ maxCompanies: 2, maxUsers: 10 });
    expect(e.source).toBe("saas");
    expect(e.modules).toBe("all");
    expect(e.maxCompanies).toBe(2);
  });

  it("sumber lisensi membawa daftar modulnya", () => {
    const e = entitlementFromLicence(LISENSI);
    expect(e.source).toBe("licence");
    expect(e.modules).toEqual(["core_accounting", "manufacturing"]);
    expect(e.supportEndsAt).toBe("2027-10-20T00:00:00.000Z");
  });
});

describe("entitlement: lisensi hanya MENYEMPITKAN", () => {
  const aktif = ["core_accounting", "inventory", "manufacturing"];

  it("SaaS (`all`) mengembalikan daftar aktif APA ADANYA", () => {
    // Bukti bahwa lapis ini tidak mengubah perilaku SaaS. Kalau tes ini jatuh,
    // celah on-premise sedang dibayar dengan risiko di sisi yang sudah jalan.
    const e = entitlementFromPlan({ maxCompanies: 1, maxUsers: 3 });
    expect(intersectModules(e, aktif)).toBe(aktif);
  });

  it("lisensi memotong yang tidak dicakup", () => {
    const e = entitlementFromLicence(LISENSI);
    expect(intersectModules(e, aktif)).toEqual(["core_accounting", "manufacturing"]);
  });

  it("TIDAK PERNAH menambah modul yang tidak aktif di perusahaan", () => {
    /* Lisensi berarti "boleh dipakai", bukan "menyala". Pemasangan yang
       lisensinya memuat manufaktur tetap harus menyalakannya sendiri — kalau
       lisensi bisa menyalakan, satu berkas baru akan mengubah menu dan bagan
       akun perusahaan tanpa seorang pun memutuskannya. */
    const e = entitlementFromLicence(LISENSI);
    const hasil = intersectModules(e, ["core_accounting"]);
    expect(hasil).toEqual(["core_accounting"]);
    expect(hasil).not.toContain("manufacturing");
  });

  it("hasilnya selalu subset dari yang aktif", () => {
    const e = entitlementFromLicence({ ...LISENSI, modules: ["core_accounting", "payroll"] });
    for (const m of intersectModules(e, aktif)) expect(aktif).toContain(m);
  });
});

describe("entitlement: batas dilaporkan, bukan memblokir", () => {
  it("melewati batas terbaca sebagai fakta", () => {
    const e = entitlementFromLicence(LISENSI);
    expect(overLimit(e, { companies: 4, users: 10 })).toEqual({ companies: true, users: false });
    expect(overLimit(e, { companies: 3, users: 25 })).toEqual({ companies: false, users: false });
  });

  it("`moduleLicensed` menjawab per modul", () => {
    const e = entitlementFromLicence(LISENSI);
    expect(moduleLicensed(e, "manufacturing")).toBe(true);
    expect(moduleLicensed(e, "payroll")).toBe(false);
    expect(moduleLicensed(entitlementFromPlan({ maxCompanies: 1, maxUsers: 1 }), "payroll")).toBe(
      true
    );
  });

  it("modul entitlement MURNI — tanpa Prisma, IO, atau `next/*`", () => {
    const src = readFileSync(join(process.cwd(), "packages/core/src/entitlement.ts"), "utf8");
    // Komentarnya sendiri MENYEBUT larangan ini, jadi yang diperiksa kodenya.
    const kode = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    for (const t of ["@sai/db", "node:fs", "next/", "server-only", "process.env"]) {
      expect(kode, `menyentuh ${t}`).not.toContain(t);
    }
  });
});

describe("entitlement: sambungan IO di jalur panas", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/entitlement-source.ts"), "utf8");

  it("TIDAK membaca basis data penagihan (doktrin #137)", () => {
    // Lapis ini dibaca pada setiap pemeriksaan izin. Satu query ke
    // `sai_platform` di sini berarti penagihan yang mati = login yang mati.
    expect(src).not.toContain("platform-db");
    expect(src).not.toContain("platformDb");
  });

  it("hasil verifikasi TIDAK disimpan ke basis data", () => {
    /* Rancangan §8: menyimpan hasilnya sebagai baris memindahkan kewenangan
       lisensi dari tanda tangan ke baris yang bisa ditulis. */
    const kode = src.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
    for (const tulis of ["create(", "upsert(", "update(", "createMany("]) {
      expect(kode, `menulis ke DB: ${tulis}`).not.toContain(tulis);
    }
  });

  it("berkas lisensi yang hilang/rusak menyempit — tidak membuka, tidak mematikan", () => {
    expect(src).toContain("cadanganTersempit");
    expect(src).toMatch(/modules: \[CORE_MODULE\]/);
    expect(src).toMatch(/Pembukuan tetap terbuka/);
  });
});

describe("entitlement: diiris di SATU titik", () => {
  const authz = readFileSync(join(process.cwd(), "src/lib/authz-effective.ts"), "utf8");

  it("irisannya ada di sumber himpunan modul, bukan di tiap penjaga", () => {
    expect(authz).toContain("intersectModules");
    expect(authz.match(/intersectModules\(/g) ?? []).toHaveLength(1);
  });

  it("jalur SaaS meneruskan nilai mentah tanpa diurai ulang", () => {
    // Jalan keluar lebih awal inilah yang membuat SaaS identik dengan sebelum
    // lapis ini ada.
    expect(authz).toMatch(/if \(entitlement\.modules === "all"\) return mentah;/);
  });

  it("`parseEnabledModules` tetap otoritas arti nilai kosong", () => {
    expect(authz).toContain("parseEnabledModules(mentah)");
  });
});
