/**
 * PAKET WORKSPACE BERDIRI SENDIRI (dok 14 §5 Fase 1)
 *
 * `packages/*` dipakai aplikasi Next DAN skrip `tsx`/`bun`, dan kelak oleh dua
 * aplikasi (`apps/customer`, `apps/operator`). Paket yang mengimpor balik ke
 * `src/` lewat alias `@/` atau path relatif tidak bisa dipindahkan bersama
 * konsumennya: ia diam-diam bergantung pada SATU aplikasi tertentu.
 *
 * Alias `@/` juga tidak diselesaikan `tsx` di semua jalur, dan kegagalannya
 * muncul saat BERJALAN, bukan saat `tsc` (lihat tests/adapter-dari-url.test.ts).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const AKAR = process.cwd();

function berkasTs(dir: string): string[] {
  const keluar: string[] = [];
  const telusuri = (p: string) => {
    for (const e of readdirSync(join(AKAR, p), { withFileTypes: true })) {
      const anak = `${p}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        telusuri(anak);
      } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        keluar.push(anak);
      }
    }
  };
  telusuri(dir);
  return keluar;
}

const tanpaKomentar = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const IMPOR = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

describe("paket workspace tidak bergantung balik pada aplikasi", () => {
  const berkas = berkasTs("packages");

  it("ada berkas untuk diperiksa — penjaga atas tes ini sendiri", () => {
    expect(berkas).toContain("packages/db/src/adapter.ts");
    expect(berkas).toContain("packages/db/src/server.ts");
  });

  it("nol impor `@/…` dan nol impor relatif yang keluar dari paketnya", () => {
    const pelanggar: string[] = [];
    for (const f of berkas) {
      const paket = f.split("/").slice(0, 2).join("/");
      for (const m of tanpaKomentar(readFileSync(join(AKAR, f), "utf8")).matchAll(IMPOR)) {
        const s = m[1];
        if (s.startsWith("@/")) pelanggar.push(`${f} → ${s}`);
        if (s.startsWith(".")) {
          const tujuan = join(f, "..", s);
          if (!tujuan.startsWith(`${paket}/`)) pelanggar.push(`${f} → ${s}`);
        }
      }
    }
    expect(pelanggar).toEqual([]);
  });

  it.each(
    readdirSync(join(AKAR, "packages")).filter((d) => existsSync(join(AKAR, "packages", d, "package.json")))
  )("setiap subpath yang diekspor @sai/%s menunjuk berkas yang ada", (d) => {
    const manifes = JSON.parse(readFileSync(join(AKAR, `packages/${d}/package.json`), "utf8")) as {
      exports: Record<string, string>;
    };
    for (const tujuan of Object.values(manifes.exports)) {
      if (tujuan.endsWith("/*")) {
        /* Pola (`./i18n/dictionaries/*`): direktorinya wajib ada dan berisi. */
        const dir = join(AKAR, `packages/${d}`, tujuan.slice(0, -2));
        expect(existsSync(dir) && readdirSync(dir).length > 0, tujuan).toBe(true);
        continue;
      }
      expect(berkas, tujuan).toContain(join(`packages/${d}`, tujuan));
    }
  });

  it("setiap paket workspace tercantum di `transpilePackages`", () => {
    /* Paket dikirim sebagai SUMBER TS. Tanpa entri ini Next memperlakukannya
       sebagai dependensi pihak ketiga yang sudah dikompilasi. */
    const config = readFileSync(join(AKAR, "next.config.ts"), "utf8");
    for (const d of readdirSync(join(AKAR, "packages")).filter((x) => existsSync(join(AKAR, "packages", x, "package.json")))) {
      const nama = (JSON.parse(readFileSync(join(AKAR, "packages", d, "package.json"), "utf8")) as { name: string }).name;
      expect(config, nama).toContain(`"${nama}"`);
    }
  });

  it("impor `@sai/*` sebuah paket tercantum di `dependencies` manifesnya, dan grafnya tanpa siklus", () => {
    /* Diagram arah dependensi di dok 02 §7 bersandar pada ini. Manifes yang
       tidak jujur tidak gagal di mana pun — bun menautkan seluruh workspace —
       sampai sebuah paket kelak dibangun atau diterbitkan sendiri. */
    const paket = readdirSync(join(AKAR, "packages")).filter((d) => existsSync(join(AKAR, "packages", d, "package.json")));
    const graf = new Map<string, Set<string>>();
    for (const d of paket) {
      const manifes = JSON.parse(readFileSync(join(AKAR, "packages", d, "package.json"), "utf8")) as {
        name: string;
        dependencies?: Record<string, string>;
      };
      const dipakai = new Set<string>();
      for (const f of berkas.filter((b) => b.startsWith(`packages/${d}/`))) {
        for (const m of tanpaKomentar(readFileSync(join(AKAR, f), "utf8")).matchAll(IMPOR)) {
          const nama = /^(@sai\/[a-z-]+)/.exec(m[1])?.[1];
          if (nama && nama !== manifes.name) dipakai.add(nama);
        }
      }
      for (const n of dipakai) expect(Object.keys(manifes.dependencies ?? {}), `${manifes.name} → ${n}`).toContain(n);
      graf.set(manifes.name, dipakai);
    }
    const kunjung = (n: string, jejak: string[]): void => {
      expect(jejak, `siklus: ${[...jejak, n].join(" → ")}`).not.toContain(n);
      for (const m of graf.get(n) ?? []) kunjung(m, [...jejak, n]);
    };
    for (const n of graf.keys()) kunjung(n, []);
  });

  it("Dockerfile menyalin manifes SETIAP paket sebelum `bun install --frozen-lockfile`", () => {
    /* Paket baru tanpa baris COPY di tahap `deps` tidak gagal di `verify`;
       ia gagal di build image CI sesudah merge ke main. */
    const docker = readFileSync(join(AKAR, "Dockerfile"), "utf8");
    const deps = docker.slice(docker.indexOf("AS deps"), docker.indexOf("bun install --frozen-lockfile"));
    const paket = readdirSync(join(AKAR, "packages")).filter((d) =>
      existsSync(join(AKAR, "packages", d, "package.json"))
    );
    expect(paket.length).toBeGreaterThan(0);
    for (const d of paket) expect(deps, d).toContain(`COPY packages/${d}/package.json packages/${d}/`);
  });
});
