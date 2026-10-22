/**
 * Pembaca berkas compose untuk penjaga — YAML sungguhan, dengan tag override
 * Compose (`!reset`, `!override`) dikenali. Tanpa skema ini js-yaml MELEMPAR
 * pada `docker-compose.ha.yml`/`.replika.yml`, dan penjaga yang hanya membaca
 * berkas dasar diam-diam melewatkan override — tempat sebuah rahasia atau
 * `user: root` paling mudah diselipkan.
 *
 * `!reset` dibaca sebagai `null` (nilai dasar dihapus), `!override` sebagai
 * nilainya apa adanya. Anchor & `<<:` diselesaikan js-yaml sendiri.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SCHEMA, load, Type } from "js-yaml";

import { AKAR_REPO } from "./akar-sumber";

export interface ComposeServiceDoc {
  env_file?: unknown;
  environment?: Record<string, unknown> | string[];
  command?: string[] | string;
  entrypoint?: unknown;
  image?: string;
  user?: unknown;
  build?: unknown;
  [k: string]: unknown;
}

export interface ComposeDoc {
  services?: Record<string, ComposeServiceDoc>;
  [k: string]: unknown;
}

const SKEMA_COMPOSE = DEFAULT_SCHEMA.extend(
  (["scalar", "sequence", "mapping"] as const).flatMap((kind) => [
    new Type("!reset", { kind, construct: () => null }),
    new Type("!override", { kind, construct: (d: unknown) => d }),
  ])
);

export function loadCompose(file: string): ComposeDoc {
  return (load(readFileSync(join(AKAR_REPO, file), "utf8"), { schema: SKEMA_COMPOSE }) as ComposeDoc | null) ?? {};
}

/** Setiap berkas `docker-compose*.yml` di akar repo. */
export const COMPOSE_FILES = readdirSync(AKAR_REPO).filter((f) => /^docker-compose(\..+)?\.ya?ml$/.test(f));

/** `environment:` sebagai peta, apa pun bentuknya di berkas (peta atau daftar `K=V`). */
export function envMap(s: ComposeServiceDoc | undefined | null): Record<string, unknown> {
  const e = s?.environment;
  if (!e) return {};
  if (Array.isArray(e)) {
    return Object.fromEntries(
      e.map((x) => {
        const i = x.indexOf("=");
        return i < 0 ? [x, null] : [x.slice(0, i), x.slice(i + 1)];
      })
    );
  }
  return e;
}
