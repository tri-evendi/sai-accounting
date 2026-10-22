/**
 * Segel & buka bundel serah-terima on-premise: `tar | openssl enc` dan
 * kebalikannya, lewat pipa antar-proses — tanpa berkas tar telanjang di disk.
 * Format sandinya SAMA dengan arsip cadangan (`BUNDLE_CIPHER_ARGS`), jadi di
 * keadaan darurat bundel bisa dibuka tangan:
 *
 *   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -salt -in X.saibundle | tar -x
 *
 * Sandi lewat `-pass env:…` — tidak pernah lewat argv (`ps` membacanya).
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import { BUNDLE_CIPHER_ARGS, PASSPHRASE_ENV } from "../../src/lib/onprem-migration";

/** Nama env yang dipakai HANYA untuk proses anak `openssl`. */
const CHILD_PASS_ENV = "SAI_BUNDLE_PASS_CHILD";

function pipeline(
  first: { cmd: string; args: string[]; cwd?: string },
  second: { cmd: string; args: string[]; cwd?: string },
  passphrase: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, [CHILD_PASS_ENV]: passphrase };
    delete env[PASSPHRASE_ENV];
    const a = spawn(first.cmd, first.args, { cwd: first.cwd, env, stdio: ["ignore", "pipe", "inherit"] });
    const b = spawn(second.cmd, second.args, { cwd: second.cwd, env, stdio: ["pipe", "inherit", "inherit"] });
    a.stdout.pipe(b.stdin);
    let pending = 2;
    const failures: string[] = [];
    const done = (name: string) => (code: number | null, signal: NodeJS.Signals | null) => {
      if (code !== 0) failures.push(`${name} keluar dengan ${signal ? `sinyal ${signal}` : `kode ${code}`}`);
      pending -= 1;
      if (pending > 0) return;
      if (failures.length > 0) reject(new Error(failures.join("; ")));
      else resolve();
    };
    a.on("error", reject);
    b.on("error", reject);
    a.on("close", done(first.cmd));
    b.on("close", done(second.cmd));
  });
}

/** `tar -c` atas `entries` di `dir` → `openssl enc` → `outFile`. */
export function sealBundle(dir: string, entries: string[], outFile: string, passphrase: string): Promise<void> {
  return pipeline(
    { cmd: "tar", args: ["-c", "-f", "-", ...entries], cwd: dir },
    { cmd: "openssl", args: [...BUNDLE_CIPHER_ARGS, "-pass", `env:${CHILD_PASS_ENV}`, "-out", outFile] },
    passphrase
  );
}

/**
 * `openssl enc -d` → `tar -x` ke `dir`. Sandi salah berakhir di sini
 * ("bad decrypt"), SEBELUM basis data mana pun disentuh.
 */
export function openBundle(file: string, dir: string, passphrase: string): Promise<void> {
  return pipeline(
    { cmd: "openssl", args: [...BUNDLE_CIPHER_ARGS, "-d", "-pass", `env:${CHILD_PASS_ENV}`, "-in", file] },
    { cmd: "tar", args: ["-x", "-f", "-", "--no-same-owner", "--no-same-permissions"], cwd: dir },
    passphrase
  );
}

/**
 * Semua berkas di bawah `dir` sebagai jalur relatif ber-`/`. Apa pun yang
 * BUKAN berkas biasa atau direktori (tautan simbolik, perangkat) melempar:
 * tautan di dalam arsip adalah cara klasik menulis ke luar direktori kerja.
 */
export async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const st = await lstat(full);
    if (st.isDirectory()) out.push(...(await listFiles(full, base)));
    else if (st.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
    else throw new Error(`bundel memuat entri yang bukan berkas biasa: ${path.relative(base, full)}`);
  }
  return out.sort();
}

/** Prompt tersembunyi (pola `bootstrap.ts`) — sandi tidak tampil, tidak masuk riwayat shell. */
export function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stream = rl as unknown as { _writeToOutput?: (s: string) => void };
    process.stdout.write(question);
    stream._writeToOutput = () => {
      /* sengaja kosong: jangan gemakan ketikan */
    };
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

export function argValue(argv: readonly string[], flag: string): string | null {
  const i = argv.indexOf(flag);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v !== undefined && !v.startsWith("--") ? v : null;
}
