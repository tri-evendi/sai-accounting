/**
 * Batas server/client — penjaga kelas kesalahan yang **tidak terlihat oleh
 * `tsc` maupun ESLint**, dan baru muncul saat `next build` (~99 menit di mesin
 * ini, di dalam `docker compose up --build -d`, alias saat deploy berjalan).
 *
 * Kejadian nyata (2026-07-26): `components/ui/learn-more.tsx` adalah server
 * component yang memanggil `getT()` dari `lib/i18n/server.ts` (`server-only` +
 * `next/headers`). Komponen itu juga dipakai DI DALAM dua form client, jadi
 * bundler menarik modul server ke bundel browser dan build gagal dengan
 * "You're importing a module that depends on next/headers". Typecheck hijau,
 * lint hijau, 1087 tes hijau — build tetap gagal.
 *
 * Penjaga ini menelusuri graf impor: dari setiap komponen client (`"use
 * client"`), tidak boleh ada jalur yang sampai ke modul `server-only`.
 *
 * Dua hal yang SENGAJA tidak dihitung sebagai jalur:
 *  • `import type { … }` — dihapus saat kompilasi, tidak pernah jadi impor
 *    runtime, jadi aman (mis. `period-manager.tsx` mengimpor tipe dari
 *    `period-close.ts`).
 *  • Berkas `"use server"` (server action) — memang dirancang untuk diimpor
 *    komponen client; bundler menggantinya dengan stub RPC, bukan kode modul
 *    (mis. `user-menu.tsx` → `lib/i18n/actions.ts`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, normalize } from "node:path";

const SRC = join(__dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = new Map<string, string>(
  sourceFiles(SRC).map((f) => [f, readFileSync(f, "utf8")])
);

/** Direktif hanya berlaku bila berada di kepala berkas. */
const head = (code: string) => code.slice(0, 200);
const isClient = (code: string) => head(code).includes('"use client"');
const isServerAction = (code: string) => head(code).includes('"use server"');

/** `import type ...` dihapus saat kompilasi — bukan impor runtime. */
const RUNTIME_IMPORT = /^\s*import\s+(?!type\s)(?:[^;]*?\s+from\s+)?"([^"]+)"/gm;

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

function runtimeImports(file: string): string[] {
  const code = files.get(file) ?? "";
  const out: string[] = [];
  for (const match of code.matchAll(RUNTIME_IMPORT)) {
    const target = resolve(match[1], file);
    if (target) out.push(target);
  }
  return out;
}

const serverOnly = new Set(
  [...files].
    filter(
      ([, code]) =>
        (/^\s*import\s+"server-only"/m.test(code) ||
          /^\s*import\s+.*from\s+"next\/headers"/m.test(code)) &&
        !isServerAction(code)
    )
    .map(([file]) => file)
);

/** Jalur impor runtime pertama dari `root` ke sebuah modul server-only. */
function pathToServerOnly(root: string): string[] | null {
  const seen = new Set<string>();
  const stack: Array<[string, string[]]> = [[root, [root]]];
  while (stack.length) {
    const [current, path] = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (current !== root && serverOnly.has(current)) return path;
    for (const next of runtimeImports(current)) {
      const code = files.get(next) ?? "";
      if (isServerAction(code)) continue; // stub RPC, bukan kode modul
      if (!isClient(code) || next === current) stack.push([next, [...path, next]]);
    }
  }
  return null;
}

const rel = (p: string) => p.slice(SRC.length + 1);

describe("batas server/client", () => {
  const clientFiles = [...files]
    .filter(([, code]) => isClient(code))
    .map(([file]) => file);

  it("menemukan komponen client untuk diperiksa", () => {
    expect(clientFiles.length).toBeGreaterThan(50);
  });

  it("menemukan modul server-only untuk dijaga", () => {
    expect(serverOnly.size).toBeGreaterThan(0);
  });

  it("tidak ada komponen client yang menarik modul server-only", () => {
    const offenders = clientFiles
      .map((file) => ({ file, path: pathToServerOnly(file) }))
      .filter((entry): entry is { file: string; path: string[] } => entry.path !== null)
      .map(({ path }) => path.map(rel).join("\n     -> "));

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : "Komponen client menarik modul `server-only` ke bundel browser — " +
            "`next build` akan GAGAL, meski `tsc` dan lint hijau. Pakai `useT()` " +
            "(lib/i18n/client) di sisi client, bukan `getT()` (lib/i18n/server); " +
            "atau terima teksnya lewat prop dari server component induknya.\n\n  " +
            offenders.join("\n\n  ")
    ).toEqual([]);
  });
});
