/**
 * PENJAGA kesepadanan TIGA daftar image: compose · Dockerfile · matriks publish.
 *
 * ══ KENAPA BERKAS INI ADA ══════════════════════════════════════════════════
 * `docker-compose.yml` merujuk `sai-accounting-integrator` untuk `svc-tenant`
 * (kini `svc-integrator`) sejak tahap 1b, dan `Dockerfile` punya target `integrator` sejak hari yang
 * sama — tetapi matriks di `publish-image.yml` tidak. Image itu karena itu
 * **tidak pernah diterbitkan**, dan `docker compose pull svc-tenant` gagal
 * dengan `manifest unknown`.
 *
 * Satu layanan di compose yang mustahil digelar, selama berhari-hari, tanpa
 * satu baris merah di mana pun. Yang akhirnya menangkapnya pemeriksaan manual
 * menjelang gelar pertama — dan "ketemu saat mau deploy" adalah tempat paling
 * mahal untuk menemukannya, sebab di sanalah ia menghentikan rilis alih-alih
 * satu PR.
 *
 * ══ KENAPA TIGA DAFTAR, BUKAN DUA ═════════════════════════════════════════
 * Ketiganya bisa menyimpang dalam tiga arah, dan masing-masing punya
 * kegagalannya sendiri:
 *
 * | Menyimpang | Akibatnya |
 * |---|---|
 * | compose → publish | image dirujuk, tak pernah dibangun → `manifest unknown` saat gelar |
 * | publish → Dockerfile | jalan publish GAGAL: `target` yang tidak ada di Dockerfile |
 * | Dockerfile → publish | target yang dibangun lokal lalu membasi di registry (alasan `backup` masuk matriks) |
 *
 * Yang ketiga TIDAK ditegakkan di sini — ia keputusan, bukan kekeliruan: tahap
 * bangun antara (`deps`, `builder`, `go-build`) memang tidak punya image
 * terbitan. Yang ditegakkan dua arah pertama.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const compose = readFileSync(join(AKAR_REPO, "docker-compose.yml"), "utf8");
const dockerfile = readFileSync(join(AKAR_REPO, "Dockerfile"), "utf8");
const publish = readFileSync(join(AKAR_REPO, ".github/workflows/publish-image.yml"), "utf8");

/** Baris tanpa komentar — penjaga yang MENGHITUNG tidak boleh membaca komentar. */
function tanpaKomentarYaml(teks: string): string {
  return teks
    .split("\n")
    .filter((b) => !b.trim().startsWith("#"))
    .join("\n");
}

/**
 * Sufiks image yang DIRUJUK compose, diturunkan dari teksnya.
 *
 * `${SAI_IMAGE:-ghcr.io/tri-evendi/sai-accounting}-integrator:${SAI_TAG:-latest}`
 * → `-integrator`. Image utama (tanpa sufiks) → `""`.
 */
function sufiksDiCompose(): Set<string> {
  const hasil = new Set<string>();
  for (const m of tanpaKomentarYaml(compose).matchAll(
    /image:\s*\$\{SAI_IMAGE:-[^}]+\}(-[a-z0-9-]+)?:\$\{SAI_TAG/g
  )) {
    hasil.add(m[1] ?? "");
  }
  return hasil;
}

/**
 * `{ target, suffix }` dari matriks publish — termasuk PENDAMPING
 * (`companion_target` + `companion_suffix`) yang dibangun di job yang sama
 * dengan target utamanya. Sejak 22 Okt 2026 `backup` terbit sebagai pendamping
 * `migrator`, supaya lapisan bawahnya berbagi digest (lihat komentar matriks);
 * pembaca yang hanya mengenal `target:` akan melaporkan `-backup` sebagai
 * image yang tak pernah terbit.
 */
function targetDiPublish(): { target: string; suffix: string }[] {
  const bersih = tanpaKomentarYaml(publish);
  const hasil: { target: string; suffix: string }[] = [];
  const re = /-\s*target:\s*([a-z0-9-]+)\s*\n\s*suffix:\s*"([^"]*)"/g;
  for (const m of bersih.matchAll(re)) hasil.push({ target: m[1], suffix: m[2] });
  const pendamping = /companion_target:\s*([a-z0-9-]+)\s*\n\s*companion_suffix:\s*"([^"]*)"/g;
  for (const m of bersih.matchAll(pendamping)) hasil.push({ target: m[1], suffix: m[2] });
  return hasil;
}

/** Setiap layanan compose (tanpa komentar) → badannya. */
function semuaLayanan(): Record<string, string> {
  const hasil: Record<string, string> = {};
  let nama: string | null = null;
  for (const b of tanpaKomentarYaml(compose).split("\n")) {
    const m = /^ {2}([a-z][a-z0-9-]*):$/.exec(b);
    if (m) {
      nama = m[1]!;
      hasil[nama] = "";
      continue;
    }
    if (/^\S/.test(b)) nama = null;
    if (nama) hasil[nama] += b + "\n";
  }
  return hasil;
}

/** Nama tahap `FROM ... AS <nama>` di Dockerfile. */
function tahapDockerfile(): Set<string> {
  const hasil = new Set<string>();
  for (const m of dockerfile.matchAll(/^FROM\s+\S+(?:\s+\S+)*?\s+AS\s+([a-z0-9-]+)/gim)) {
    hasil.add(m[1]);
  }
  return hasil;
}

describe("setiap image yang DIRUJUK compose punya target yang menerbitkannya", () => {
  it("tak ada sufiks di compose yang absen dari matriks publish", () => {
    /*
     * Ini penjaga yang akan menangkap celah `-integrator` seandainya ia ada
     * lebih dulu. Yang dijaga SIFATNYA — "dirujuk tapi tidak diterbitkan" —
     * bukan daftar nama yang kebetulan benar hari ini: menambah layanan baru ke
     * compose dengan image baru akan merahkan ini sampai matriksnya menyusul.
     */
    const diterbitkan = new Set(targetDiPublish().map((t) => t.suffix));
    const yatim = [...sufiksDiCompose()].filter((s) => !diterbitkan.has(s)).sort();
    expect(
      yatim,
      "Sufiks image berikut dirujuk `docker-compose.yml` tetapi TIDAK ada di " +
        "matriks `publish-image.yml`. `docker compose pull` atas layanan yang " +
        "memakainya akan gagal `manifest unknown` — tambahkan `- target: <x>` " +
        "beserta `suffix:`-nya."
    ).toEqual([]);
  });

  it("compose sungguh merujuk lima image, dan `-integrator` salah satunya", () => {
    /* Pencacah, bukan larangan: ia merah ketika image berubah jumlahnya, dan
       daftar di sini harus ikut. Tanpa angkanya, penjaga di atas bisa hijau
       karena regexnya berhenti menemukan apa pun. */
    expect([...sufiksDiCompose()].sort()).toEqual([
      "",
      "-backup",
      "-integrator",
      "-migrator",
      "-operator",
    ]);
  });
});

describe("setiap target di matriks publish BISA dibangun", () => {
  it("tak ada `target:` yang absen dari Dockerfile", () => {
    /* Target yang tidak ada di Dockerfile membuat jalan publish GAGAL — dan ia
       gagal pada `main`, sesudah merge, yaitu titik paling buruk. */
    const tahap = tahapDockerfile();
    const hilang = targetDiPublish()
      .map((t) => t.target)
      .filter((t) => !tahap.has(t))
      .sort();
    expect(hilang, "target matriks yang tidak punya `FROM ... AS` di Dockerfile").toEqual([]);
  });

  it("tiap target punya sufiks yang UNIK", () => {
    /* Dua target dengan sufiks sama saling menimpa di registry: yang kedua
       menang, dan yang pertama lenyap tanpa galat. */
    const sufiks = targetDiPublish().map((t) => t.suffix);
    expect(new Set(sufiks).size).toBe(sufiks.length);
  });

  it("matriksnya memuat LIMA target", () => {
    expect(targetDiPublish().map((t) => t.target).sort()).toEqual([
      "backup",
      "integrator",
      "migrator",
      "runner",
      "runner-operator",
    ]);
  });
});

describe("layanan yang memakai image non-utama ikut daftar `pull`/`up`", () => {
  const produksi = readFileSync(join(AKAR_REPO, "PRODUCTION.md"), "utf8");

  it("`svc-worker` dan `svc-integrator` disebut runbook", () => {
    /*
     * Keduanya tidak melayani satu pun permintaan HTTP, jadi yang tidak ikut
     * `up` TIDAK terlihat di mana pun: ia hanya berhenti bekerja. Gerbang image
     * di atas memastikan ia BISA ditarik; baris ini memastikan ada yang
     * menariknya. (Sampai 22 Okt 2026 keduanya enam layanan; 1 image = 1
     * container.)
     */
    for (const svc of ["svc-worker", "svc-integrator"]) {
      expect(produksi, `${svc} di runbook`).toContain(svc);
    }
  });

  it("satu image = satu layanan yang BERJALAN", () => {
    /*
     * Keputusan pemilik 22 Okt 2026. Yang dihitung layanan yang naik dengan
     * `docker compose up -d` — `job-backup` di belakang profil `perkakas`
     * (perkakas `run --rm`) tidak termasuk. Layanan kedua untuk image yang
     * sama adalah jalan pulang ke empat container `-migrator`, dan ia lolos
     * setiap penjaga lain di berkas ini.
     */
    const layanan = Object.entries(semuaLayanan()).filter(
      ([, badan]) => !/^\s*profiles:/m.test(badan)
    );
    const perImage = new Map<string, string[]>();
    for (const [nama, badan] of layanan) {
      const m = /image:\s*\$\{SAI_IMAGE:-[^}]+\}(-[a-z0-9-]+)?:\$\{SAI_TAG/.exec(badan);
      if (!m) continue;
      const sufiks = m[1] ?? "";
      perImage.set(sufiks, [...(perImage.get(sufiks) ?? []), nama]);
    }
    /* `migrate` sekali-jalan, bukan container yang berjalan terus. */
    const berjalan = [...perImage].map(([s, n]) => [s, n.filter((x) => x !== "migrate")] as const);
    const ganda = berjalan.filter(([, n]) => n.length > 1).map(([s, n]) => `${s || "(utama)"}: ${n.join(", ")}`);
    expect(ganda, "image yang menjalankan lebih dari satu layanan").toEqual([]);
    expect(perImage.get("-migrator")).toEqual(expect.arrayContaining(["svc-worker"]));
    expect(perImage.get("-integrator")).toEqual(["svc-integrator"]);
  });

  it("jumlah image yang diterbitkan disebut runbook dengan BENAR", () => {
    /*
     * Runbook menyuruh "tunggu sampai setiap publish hijau" dan menyebut
     * jumlahnya. Angka yang tertinggal membuat orang menunggu empat image lalu
     * menggelar dengan yang kelima belum ada — yaitu persis kegagalan yang
     * penjaga berkas ini ada untuk mencegah.
     */
    const jumlah = targetDiPublish().length;
    expect(produksi, `runbook harus menyebut ${jumlah} image`).toMatch(
      new RegExp(`${jumlah}\\s+image`, "i")
    );
  });
});
