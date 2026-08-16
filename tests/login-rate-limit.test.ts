/**
 * Pembatas laju MASUK + pembaca alamat klien — issue #372.
 *
 * Dua sifat dijaga di sini, dan keduanya sifat yang hilang tanpa gejala:
 *
 *  1. **Alamat klien dibaca dari KANAN.** Delapan permukaan pelanggan dulu
 *     memakai `x-forwarded-for.split(",")[0]` — entri paling kiri, yang bisa
 *     diketik klien. Akibatnya bukan teoretis: pembatas laju per-IP yang
 *     kuncinya bisa diketik pemanggil tidak membatasi apa pun, sebab satu
 *     header acak per permintaan membuat setiap permintaan tampak datang dari
 *     alamat baru.
 *  2. **Masuk dibatasi per-IP DAN per-pengenal**, dengan penghitung yang
 *     selamat dari restart.
 *
 * Butir 1 dijaga sebagai sapuan sumber (idiom `tests/no-public-uploads.test.ts`):
 * yang dijaga bukan satu berkas melainkan sifat seluruh direktori. Butir 2
 * sebagian sapuan, sebagian uji nilai — batas sebenarnya menuntut basis data,
 * tetapi KEBIJAKANNYA (urutan, kelonggaran relatif) bisa dikunci di sini.
 */
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { clientIpFrom } from "@/lib/client-ip";
import { PERSISTENT_RATE_LIMITS } from "@/lib/rate-limit-persistent";

const SRC = path.join(process.cwd(), "src");

/** Satu-satunya berkas yang boleh menyentuh header proxy mentah. */
const ALLOWED = new Set([path.join(SRC, "lib", "client-ip.ts")]);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;
      found.push(...(await sourceFiles(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const headersOf = (map: Record<string, string>) => ({
  get: (name: string) => map[name.toLowerCase()] ?? null,
});

describe("pembaca alamat klien tunggal (#372)", () => {
  it("tidak ada berkas lain di src/ yang membaca x-forwarded-for sendiri", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      if (ALLOWED.has(file)) continue;
      if (stripComments(await readFile(file, "utf8")).includes("x-forwarded-for")) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(
      offenders,
      "Alamat klien dibaca lewat `clientIpFrom` (lib/client-ip.ts) — entri ke-N " +
        "dari KANAN. Membaca headernya sendiri hampir selalu berarti mengambil " +
        "entri paling kiri, yaitu nilai yang dikirim klien: kunci pembatas laju " +
        "yang bisa dipilih penyerang, dan alamat palsu di jejak audit."
    ).toEqual([]);
  });

  it("entri kiriman klien tidak pernah terbaca, berapa pun banyaknya", () => {
    const oneProxy = { OPERATOR_TRUSTED_PROXY_HOPS: "1" };
    // Penyerang menaruh alamat pilihannya di depan; Traefik menambahkan yang
    // sebenarnya di ujung kanan.
    const spoofed = headersOf({
      "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.7",
    });
    expect(clientIpFrom(spoofed, oneProxy)).toBe("198.51.100.7");
  });

  it("rantai lebih pendek dari topologi → null, bukan tebakan", () => {
    const twoProxies = { OPERATOR_TRUSTED_PROXY_HOPS: "2" };
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "198.51.100.7" }), twoProxies)).toBeNull();
  });
});

describe("kebijakan pembatas laju masuk (#372)", () => {
  it("per-IP ada, dan lebih longgar daripada per-pengenal", () => {
    const { loginIp, loginIdentifier } = PERSISTENT_RATE_LIMITS;
    expect(loginIp.maxAttempts).toBeGreaterThan(loginIdentifier.maxAttempts);
    // Satu kantor di balik NAT adalah SATU alamat: batas per-IP seketat
    // per-akun akan mengunci seluruh kantor karena satu orang salah ketik.
    expect(loginIp.maxAttempts).toBeGreaterThanOrEqual(25);
  });

  it("per-pengenal tidak melonggar dari yang digantikannya", () => {
    // Angka `RATE_LIMITS.login` lama: 10 per 15 menit. Yang berubah ketahanannya,
    // bukan seberapa ketat.
    expect(PERSISTENT_RATE_LIMITS.loginIdentifier).toEqual({
      windowMs: 15 * 60 * 1000,
      maxAttempts: 10,
    });
  });

  it("jalur masuk memakai penghitung PERSISTEN, bukan yang di memori", async () => {
    const auth = stripComments(await readFile(path.join(SRC, "lib", "auth.ts"), "utf8"));
    expect(auth).toContain("checkPersistentRateLimit");
    expect(auth).toContain("login:ip:");
    expect(auth).toContain("login:id:");
    expect(auth).not.toContain("checkRateLimit(");
  });

  it("IP diperiksa LEBIH DULU dan yang ditolak langsung pulang", async () => {
    const auth = stripComments(await readFile(path.join(SRC, "lib", "auth.ts"), "utf8"));
    const ipAt = auth.indexOf("login:ip:");
    const idAt = auth.indexOf("login:id:");
    expect(ipAt).toBeGreaterThan(-1);
    // Kalau urutannya terbalik, penyerang dari alamat yang SUDAH diblokir tetap
    // bisa membakar jatah milik akun korban sampai akun itu ikut terkunci.
    expect(ipAt).toBeLessThan(idAt);
    expect(auth.slice(ipAt, idAt)).toContain("throw new Error");
  });

  it("kedua penolakan berbunyi SAMA — sebabnya bukan urusan penyerang", async () => {
    const auth = await readFile(path.join(SRC, "lib", "auth.ts"), "utf8");
    const messages = [...auth.matchAll(/throw new Error\("Too many login attempts[^"]*"\)/g)];
    expect(messages).toHaveLength(2);
    expect(messages[0][0]).toBe(messages[1][0]);
  });
});
