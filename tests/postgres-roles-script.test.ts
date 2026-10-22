/**
 * PENJAGA STATIS perkakas sandi PostgreSQL (`scripts/rotate-postgres-password.sh`
 * + `scripts/postgres-roles.py`) — gaya shellcheck: dibaca sebagai teks, tidak
 * pernah dijalankan (ia menyentuh produksi).
 *
 * Tiga cacat yang SUDAH terjadi pada versi pertamanya (sesi 22 Okt 2026, tidak
 * pernah masuk repo), masing-masing kini satu aturan:
 *
 *   1. Sandi di ARGV — `psql -v pw=<baru>`, `python3 - <lama> <baru>`,
 *      `grep -F <lama>`. Argv terbaca setiap pengguna host lewat `ps`.
 *      → rahasia hanya lewat stdin; argv `docker compose` dirakit di satu
 *        fungsi dan tidak pernah memuat nama variabel rahasia.
 *   2. Nama layanan ditulis tangan (`job-scheduler`, `job-conformance`) yang
 *      sudah tidak ada → `compose up` gagal SESUDAH sandi server diganti →
 *      setiap koneksi baru ditolak. → tidak satu nama layanan compose pun
 *      ditulis di skrip; daftarnya diturunkan dari `docker compose config`.
 *   3. Domain dipaku tangan (`app.sai-indonesia.com`, bukan domain produksi).
 *      → domain hanya dari `APP_DOMAIN` di `.env`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AKAR_REPO } from "./akar-sumber";
import { COMPOSE_FILES, loadCompose } from "./compose-yaml";

const baca = (p: string) => readFileSync(join(AKAR_REPO, p), "utf8");
const SH = baca("scripts/rotate-postgres-password.sh");
const PY = baca("scripts/postgres-roles.py");

/** Kode tanpa komentar `#` (shell & Python). */
const kodeSh = SH.split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
/**
 * Python tanpa komentar dan tanpa docstring. Docstring = `"""` pertama berkas
 * atau tepat sesudah baris `def …:`; blok SQL ber-`f"""` tetap utuh.
 */
const kodePy = PY.replace(/^(#![^\n]*\n)?"""[\s\S]*?"""/, "")
  .replace(/(\):[^\n]*\n\s*)"""[\s\S]*?"""/g, "$1")
  .split("\n")
  .map((l) => l.replace(/\s+#.*$/, ""))
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

const SEMUA_LAYANAN = [...new Set(COMPOSE_FILES.flatMap((f) => Object.keys(loadCompose(f).services ?? {})))];

describe("perkakas sandi PostgreSQL — penjaga statis", () => {
  it("nama lama yang Indonesia tidak hidup lagi di repo; skrip baru berbahasa Inggris (Nomenklatur)", () => {
    expect(existsSync(join(AKAR_REPO, "scripts/putar-sandi-postgres.sh"))).toBe(false);
    expect(kodeSh).toMatch(/exec python3 scripts\/postgres-roles\.py rotate "\$1"/);
  });

  it("shell: tidak ada variabel selain argumen posisi — tidak ada sandi yang bisa sampai ke argv", () => {
    const variabel = [...kodeSh.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*|\d)/g)].map((m) => m[1]);
    expect(variabel.filter((v) => !/^\d$/.test(v!))).toEqual([]);
    expect(kodeSh).not.toMatch(/\bpsql\b|\bgrep\b|PGPASSWORD|-v\s+pw=/);
  });

  it("python: satu-satunya `subprocess.run`, dan rahasianya lewat `input=`", () => {
    const panggil = [...kodePy.matchAll(/subprocess\.(run|Popen|call|check_output|check_call)\(/g)];
    expect(panggil).toHaveLength(1);
    expect(kodePy).toMatch(/subprocess\.run\(cmd, cwd=ROOT, input=stdin, text=True, capture_output=True\)/);
    expect(kodePy).not.toMatch(/os\.system|shell=True|PGPASSWORD|-v pw=|"-e"/);
  });

  it("python: argv `docker compose` tidak pernah memuat sandi, verifier, atau SQL", () => {
    /* Setiap pemanggilan compose([...]) — daftar argumennya diperiksa. */
    for (const m of kodePy.matchAll(/compose\(\s*(\[[^\]]*\]|args)/g)) {
      expect(m[1], m[0]).not.toMatch(/password|passwd|verifier|secret|new_pw|old\b|sql/i);
    }
    /* SQL selalu lewat stdin. */
    expect(kodePy).toMatch(/return compose\(args, stdin=sql\)/);
    expect(kodePy).toMatch(/PASSWORD '\{scram_verifier\(/);
    /* Tidak ada `ALTER ROLE … PASSWORD` dengan sandi teks asli. */
    expect(kodePy).not.toMatch(/PASSWORD '\{(password|new_pw|old)\b/);
  });

  it("tidak ada nama layanan compose yang ditulis tangan", () => {
    expect(SEMUA_LAYANAN.length).toBeGreaterThan(5);
    const pelanggar: string[] = [];
    for (const nama of SEMUA_LAYANAN) {
      /* Literal string Python (`"x"`/`'x'`); nama di dalam teks pesan untuk manusia bukan perintah. */
      const kutip = new RegExp(`["']${nama.replace(/-/g, "\\-")}["']`);
      if (kutip.test(kodePy)) pelanggar.push(`postgres-roles.py: ${nama}`);
      if (new RegExp(`(^|\\s)${nama}(\\s|$)`, "m").test(kodeSh)) pelanggar.push(`rotate-postgres-password.sh: ${nama}`);
    }
    expect(pelanggar).toEqual([]);
    /* Yang menggantikannya: layanan pg dari image, layanan yang dibuat ulang dari diff config. */
    expect(kodePy).toMatch(/startswith\("postgres:"\)/);
    expect(kodePy).toMatch(/changed_services\(before, after\)/);
    expect(kodePy).toMatch(/s != pg\.service/);
  });

  it("tidak ada domain yang ditulis tangan — hanya `APP_DOMAIN` dari `.env`", () => {
    const domain = /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|id|net|org|io|dev|app)\b/i;
    expect(kodePy.replace(/\b[\w.]+\.(py|ts|sh|md|yml)\b/g, "")).not.toMatch(domain);
    expect(kodeSh).not.toMatch(domain);
    expect(kodePy).toMatch(/env\.get\("APP_DOMAIN"\)/);
  });

  it("urutan: dampak dihitung → server → .env → layanan", () => {
    const f = /def apply_env_change[\s\S]*?\n\ndef /.exec(kodePy)?.[0] ?? "";
    const i = (s: string) => f.indexOf(s);
    expect(i("changed_services(")).toBeGreaterThan(-1);
    expect(i("changed_services(")).toBeLessThan(i("ALTER ROLE"));
    expect(i("ALTER ROLE")).toBeLessThan(i("write_env("));
    expect(i("write_env(")).toBeLessThan(i('compose(["up"'));
  });

  it("rotasi berhenti SEBELUM server bila sandi lama masih tersisa di `.env` baru", () => {
    const f = /def cmd_rotate[\s\S]*?\n\ndef /.exec(kodePy)?.[0] ?? "";
    expect(f.indexOf("sandi lama masih muncul")).toBeGreaterThan(-1);
    expect(f.indexOf("sandi lama masih muncul")).toBeLessThan(f.indexOf("apply_env_change("));
  });
});
