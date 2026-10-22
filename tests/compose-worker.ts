/**
 * Pembaca PERAN `svc-worker` dari `docker-compose.yml` — dipakai bersama
 * penjaga yang dulu membaca badan layanan `job-scheduler`, `job-conformance`,
 * `svc-ledger`, dan `svc-interactive`.
 *
 * Sejak "1 image = 1 container" (22 Okt 2026) keempatnya peran di bawah
 * penyelia `scripts/run-workers.ts`, dan skrip tiap peran adalah pasangan
 * `<peran>` + `<skrip sh>` di `command` layanan itu. Pembaca ini mengurai YAML
 * sungguhan (bukan memotong teks), supaya penjaga yang MENGHITUNG — langkah ×
 * batas, `timeout` di tiap loop — membaca persis string yang akan diserahkan
 * ke `sh -c`, tanpa komentar compose.
 *
 * `$$` TETAP `$$` di sini: itu pelolosan interpolasi compose, bukan YAML.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

import { AKAR_REPO } from "./akar-sumber";

export const WORKER_SERVICE = "svc-worker";
export const WORKER_SUPERVISOR = "scripts/run-workers.ts";

interface ComposeService {
  command?: string[] | string;
  environment?: Record<string, string> | string[];
  [k: string]: unknown;
}

export function composeServices(file = "docker-compose.yml"): Record<string, ComposeService> {
  const doc = load(readFileSync(join(AKAR_REPO, file), "utf8")) as {
    services: Record<string, ComposeService>;
  };
  return doc.services;
}

/** Peta `<peran>` → skrip sh, urut seperti di compose. */
export function workerRoles(file = "docker-compose.yml"): Map<string, string> {
  const svc = composeServices(file)[WORKER_SERVICE];
  if (!svc) throw new Error(`${WORKER_SERVICE} tidak ada di ${file}`);
  const cmd = svc.command;
  if (!Array.isArray(cmd)) throw new Error(`${WORKER_SERVICE}.command bukan daftar`);
  const i = cmd.indexOf(WORKER_SUPERVISOR);
  if (i < 0) throw new Error(`${WORKER_SERVICE}.command tidak menjalankan ${WORKER_SUPERVISOR}`);
  const pasangan = cmd.slice(i + 1);
  if (pasangan.length % 2 !== 0) throw new Error(`${WORKER_SERVICE}.command: pasangan peran ganjil`);
  const peran = new Map<string, string>();
  for (let j = 0; j < pasangan.length; j += 2) peran.set(pasangan[j]!, pasangan[j + 1]!);
  return peran;
}

export function workerRole(nama: string, file = "docker-compose.yml"): string {
  const skrip = workerRoles(file).get(nama);
  if (skrip === undefined) throw new Error(`peran \`${nama}\` tidak ada di ${WORKER_SERVICE}`);
  return skrip;
}

/** Badan TEKS satu layanan (sampai layanan berikutnya), untuk penjaga berbasis teks. */
export function serviceBlock(teks: string, nama: string): string {
  const mulai = teks.indexOf(`\n  ${nama}:\n`);
  if (mulai < 0) return "";
  const sisa = teks.slice(mulai + 1);
  const habis = sisa.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return habis === -1 ? sisa : sisa.slice(0, habis + 1);
}
