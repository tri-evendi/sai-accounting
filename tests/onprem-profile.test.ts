/**
 * PENJAGA celah on-premise #4 & #7 — profil on-premise.
 *
 * Profil ini punya sifat yang membuatnya membusuk tanpa suara: ia berkas
 * TERPISAH yang hanya memuat selisihnya. Setiap layanan baru di
 * `docker-compose.yml` otomatis ikut ke mesin customer dengan setelan SaaS-nya,
 * dan tidak ada satu pun permukaan di SaaS yang berubah warna karenanya. Yang
 * ketahuan di sana bukan galat, melainkan dua hal yang lebih buruk:
 *
 *   • image ditarik dari tag `latest`, yang berpindah setiap kali CI mendorong —
 *     jadi `up -d` untuk alasan yang sama sekali lain (reboot, ganti disk)
 *     memasang versi yang belum pernah diuji di sana;
 *   • atau `build:` di compose dasar membuat `up` MEMBANGUN image di kotak
 *     customer: sepuluh menit `next build` di mesin tanpa toolchain-nya.
 *
 * Karena itu yang dijaga di sini bukan isi berkasnya, melainkan KELENGKAPANNYA
 * terhadap compose dasar: setiap layanan yang image-nya dibangun SAI harus
 * disebut di profil on-premise — dipatok, atau dinyatakan tidak dipasang.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dasar = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");
const onprem = readFileSync(join(process.cwd(), "docker-compose.onprem.yml"), "utf8");

/** Isi tanpa komentar — komentar di berkas ini MENGUTIP bentuk yang dilarang. */
const onpremKode = onprem
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

/** Blok satu layanan di dalam sebuah berkas compose (berbasis indentasi). */
const blok = (berkas: string, layanan: string): string => {
  const baris = berkas.split("\n");
  const i = baris.findIndex((l) => l === `  ${layanan}:`);
  if (i < 0) return "";
  const akhir = baris.findIndex((l, j) => j > i && /^  \S/.test(l));
  return baris.slice(i, akhir < 0 ? undefined : akhir).join("\n");
};

/** Layanan yang image-nya DIBANGUN SAI — bukan image hulu. */
const layananSai = (): string[] => {
  const baris = dasar.split("\n");
  const hasil: string[] = [];
  let kini = "";
  for (const l of baris) {
    const m = /^  ([a-z][a-z0-9-]*):\s*$/.exec(l);
    if (m) kini = m[1];
    if (kini && l.includes("image: ${SAI_IMAGE")) hasil.push(kini);
  }
  return [...new Set(hasil)];
};

describe("profil on-premise: kelengkapan terhadap compose dasar", () => {
  it("menemukan layanan SAI di compose dasar (penjaga ini tidak boleh kosong)", () => {
    // Tanpa baris ini, perubahan bentuk `image:` membuat tes LOLOS dengan nol
    // layanan yang diperiksa — kegagalan diam yang sudah pernah terjadi di
    // pemindai lain di repo ini.
    expect(layananSai().length).toBeGreaterThanOrEqual(5);
  });

  it("setiap layanan SAI dipatok versinya ATAU dinyatakan tidak dipasang", () => {
    for (const s of layananSai()) {
      const b = blok(onprem, s);
      expect(b, `layanan SAI \`${s}\` tidak disebut di docker-compose.onprem.yml`).not.toBe("");
      const tidakDipasang = b.includes('profiles: ["tidak-dipasang"]');
      if (tidakDipasang) continue;
      expect(b, `\`${s}\` tidak mematok tag — on-premise akan menarik :latest`).toContain(
        "${SAI_TAG:?",
      );
      expect(b, `\`${s}\` boleh membangun image di mesin customer`).toContain(
        "pull_policy: always",
      );
    }
  });

  it("tag wajib itu variabel WAJIB, bukan bawaan yang diam-diam terpakai", () => {
    // `:-` memberi nilai bawaan; `:?` menghentikan compose. Perbedaan satu
    // karakter inilah seluruh isi celah #4.
    expect(onpremKode).not.toMatch(/\$\{SAI_TAG:-/);
    expect(onpremKode).toMatch(/\$\{SAI_TAG:\?[^}]+\}/);
  });

  it("pesan gagalnya menyebutkan apa yang harus disetel", () => {
    // Compose yang berhenti tanpa menyebutkan sebabnya akan dibaca sebagai
    // "pemasangannya rusak", dan jalan keluar yang dicari orang adalah
    // menghapus profilnya.
    expect(onprem).toMatch(/SAI_TAG:\?[^}]*SAI_TAG/);
  });
});

describe("profil on-premise: profil penyebaran dinyatakan (celah #1)", () => {
  it("setiap layanan SAI yang terpasang menyatakan `APP_DEPLOY_PROFILE: onprem`", () => {
    // Lewat `environment:` (yang menimpa `env_file:`), bukan diserahkan ke
    // `.env` customer: satu baris yang lupa disalin membuat pemasangan
    // melaporkan penagihannya rusak selamanya.
    for (const s of layananSai()) {
      const b = blok(onprem, s);
      if (b.includes('profiles: ["tidak-dipasang"]')) continue;
      expect(b, `\`${s}\` tidak menyatakan profil penyebaran`).toContain(
        "APP_DEPLOY_PROFILE: onprem",
      );
    }
  });

  it("SaaS tidak menyatakan profil apa pun — bawaannya `saas`", () => {
    expect(dasar).not.toContain("APP_DEPLOY_PROFILE");
  });
});

describe("profil on-premise: jaringan (celah #7)", () => {
  it("jaringan Traefik TIDAK external di customer", () => {
    // Di SaaS ini jaringan bersama (`external: true`) dan compose GAGAL
    // memvalidasi bila jaringannya tidak ada — `up` berhenti sebelum satu
    // container pun start.
    expect(dasar).toMatch(/external:\s*true/);
    expect(blok(onprem.replace(/^services:/m, "  __services:"), "traefik")).toContain(
      "external: false",
    );
  });

  it("konsol operator tidak dipasang", () => {
    expect(blok(onprem, "app-operator"), "`app-operator` masih terpasang di on-premise").toContain(
      'profiles: ["tidak-dipasang"]',
    );
  });

  it("tidak ada lagi `db` (MariaDB) untuk dipagari — ia dicabut dari compose dasar (#636)", () => {
    expect(onprem).not.toMatch(/^ {2}db:$/m);
  });
});

describe("profil on-premise: berkas lisensi hanya-baca (09 §7, 06 §3.7)", () => {
  /* Pembacanya `app-customer`; jalur `schedule` hari ini langkah di putaran
     peran `scheduler` di `svc-worker`. Tanpa mount, aplikasi tetap start —
     dengan entitlement tersempit, selamanya, dan tanpa satu pun galat yang
     menyebut sebabnya. */
  const PEMBACA = ["app-customer", "svc-worker"];

  it.each(PEMBACA)("`%s` menyetel LICENCE_FILE dan me-mount direktorinya `:ro`", (s) => {
    const b = blok(onpremKode, s);
    expect(b, `\`${s}\` tanpa LICENCE_FILE`).toContain("LICENCE_FILE: /etc/sai/licence.sai");
    expect(b, `\`${s}\` tanpa mount lisensi hanya-baca`).toMatch(
      /- \$\{SAI_LICENCE_DIR:-[^}]+\}:\/etc\/sai:ro\s*$/m,
    );
  });

  it("tidak ada mount /etc/sai yang bisa ditulis, di layanan mana pun", () => {
    // Penulis berkas lisensi satu: penanda SAI di mesin luring.
    const mount = onpremKode.split("\n").filter((l) => l.includes(":/etc/sai"));
    expect(mount.length).toBeGreaterThanOrEqual(PEMBACA.length);
    for (const l of mount) expect(l.trim(), `mount lisensi tanpa :ro → ${l}`).toMatch(/:ro$/);
  });

  it("yang di-mount DIREKTORI, bukan berkas — lisensi baru terbaca tanpa restart", () => {
    /* Bind-mount satu berkas mematok inode: lisensi yang ditukar `mv` tidak
       terlihat di container, sementara pembacanya sengaja membaca ulang tiap
       60 detik justru supaya pembaruan lisensi tidak menuntut restart. */
    expect(onpremKode).not.toMatch(/:\/etc\/sai\/licence\.sai(:ro)?\s*$/m);
  });

  it("jalur di compose = jalur bawaan pembacanya", () => {
    const sumber = readFileSync(join(process.cwd(), "src/lib/entitlement-source.ts"), "utf8");
    expect(sumber).toContain('"/etc/sai/licence.sai"');
  });
});
