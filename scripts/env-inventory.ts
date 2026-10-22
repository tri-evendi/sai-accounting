/**
 * `bun run env:inventory` — tabel env × layanan, dibangun dari kode.
 *
 * Kolom "compose" membaca daftar izin `environment:` di `docker-compose.yml`:
 *   ✓ dibaca kode DAN disediakan · ✗ dibaca kode tapi TIDAK disediakan ·
 *   + disediakan tanpa pembaca yang terlihat (mis. dibaca pustaka).
 * Penjaganya `tests/compose-env-allowlist.test.ts`; skrip ini hanya untuk
 * dibaca manusia (PR, runbook). Tidak menyentuh basis data atau container.
 *
 * `--md` mencetak tabel markdown; tanpa bendera, satu baris per layanan.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

import { inventory, REPO, serviceSurfaces } from "./lib/env-inventory";

interface Svc {
  command?: string[];
  environment?: Record<string, unknown>;
}
const compose = load(readFileSync(join(REPO, "docker-compose.yml"), "utf8")) as { services: Record<string, Svc> };
const workerCmd = compose.services["svc-worker"]?.command ?? [];

const rows = serviceSurfaces(workerCmd).map((s) => ({
  service: s.service,
  reads: inventory(s).reads,
  provided: new Set(Object.keys(compose.services[s.service]?.environment ?? {})),
}));

if (process.argv.includes("--md")) {
  const allNames = [...new Set(rows.flatMap((h) => [...h.reads.keys(), ...h.provided]))].sort();
  console.log(`| env | ${rows.map((h) => h.service).join(" | ")} |`);
  console.log(`|---|${rows.map(() => ":-:").join("|")}|`);
  for (const n of allNames) {
    const cells = rows.map((h) => {
      const r = h.reads.has(n);
      const p = h.provided.has(n);
      return r && p ? "✓" : r ? "✗" : p ? "+" : "";
    });
    console.log(`| \`${n}\` | ${cells.join(" | ")} |`);
  }
} else {
  for (const h of rows) {
    console.log(`${h.service} (${h.reads.size} dibaca):`);
    for (const [n, f] of [...h.reads].sort()) {
      console.log(`  ${h.provided.has(n) ? "✓" : "✗"} ${n.padEnd(36)} ${f}`);
    }
  }
}
