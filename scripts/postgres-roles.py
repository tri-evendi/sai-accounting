#!/usr/bin/env python3
"""
PERAN POSTGRESQL HAK MINIMUM — buat, hibahkan, periksa, alihkan, putar sandi.

Dijalankan di HOST produksi, di sebelah `docker-compose.yml` dan `.env`
(server tidak punya Node/Bun — karena itu Python standar, tanpa dependensi).
Ia berbicara ke PostgreSQL HANYA lewat `docker compose exec -T <pg> psql`
sebagai superuser di soket lokal container, dan setiap SQL dikirim lewat STDIN.

══ TIGA PERAN (Okt 2026) ════════════════════════════════════════════════════
  PG_OWNER_USER  (bawaan `sai_owner`)  NOSUPERUSER CREATEDB — pemilik setiap
                 basis data & objek aplikasi. Dipakai `migrate` dan penyediaan
                 PT (`PROVISION_DATABASE_URL`). Satu-satunya peran yang DDL.
  PG_APP_USER    (bawaan `sai_app`)    DML saja. Dipakai `app-customer`,
                 `app-operator`, `svc-worker`, jalur `interactive` integrator —
                 lewat PgBouncer.
  PG_BACKUP_USER (bawaan `sai_backup`) anggota `sai_app` + `pg_read_all_data`.
                 Dipakai jalur `tenant` integrator (pg_dump tiap buku,
                 pg_dumpall --globals-only, jejak `backup_runs`).
  PG_USER        superuser bootstrap (`sai`) — tetap ada untuk `pg`,
                 PgBouncer (`auth_user` pencari sandi), dan perkakas
                 `job-backup`. Tidak lagi dipegang layanan yang hidup terus.

══ SUBPERINTAH ════════════════════════════════════════════════════════════
  apply        Idempoten. Buat/selaraskan ketiga peran (sandi dari `.env`,
               dibangkitkan bila belum ada), alihkan KEPEMILIKAN setiap basis
               data aplikasi (kendali, platform, setiap PT di registry) ke
               pemilik, hibahkan DML ke aplikasi, setel default privileges.
               Baru SESUDAH basis data selesai, nama & sandi peran ditulis ke
               `.env` (cadangan `.env` dibuat dulu). Tidak menyentuh container.
  check        Hanya membaca. Keluar 1 bila ada objek yang bukan milik pemilik,
               tabel/sekuens yang tak terjangkau aplikasi, atau peran yang
               atributnya menyimpang.
  switch-urls  Tulis ulang URL aplikasi di `.env` (DATABASE_URL,
               CONTROL_DATABASE_URL, PLATFORM_DATABASE_URL,
               COMPANY_DATABASE_URL_TEMPLATE) ke peran aplikasi, tambahkan
               PROVISION_DATABASE_URL (pemilik), lalu buat ulang HANYA layanan
               yang sedang berjalan dan environment-nya berubah.
  rotate R     Putar sandi peran R (`superuser` | `owner` | `app` | `backup`):
               server dulu, lalu `.env`, lalu buat ulang layanan yang
               environment-nya berubah, lalu periksa kesehatan.
  rollback F   Kembalikan `.env` dari cadangan F: sandi setiap peran yang
               berbeda di F dipasang ulang di server, `.env` ditimpa F, layanan
               yang berubah dibuat ulang.

══ ATURAN YANG DIJAGA (tests/postgres-roles-script.test.ts) ════════════════
  • Tidak ada sandi di ARGV proses mana pun (`ps` di host terbaca semua
    pengguna): SQL lewat stdin, sandi dikirim sebagai VERIFIER SCRAM yang
    dihitung di sini — server tidak pernah menerima teks asli, jadi
    `log_statement` pun tidak bisa mencatatnya.
  • Tidak ada nama layanan compose yang ditulis tangan: layanan `pg` dicari
    dari `docker compose config` (image `postgres:*`), dan layanan yang dibuat
    ulang = layanan yang environment-nya BERUBAH menurut `config` sebelum vs
    sesudah. Skrip lama memaku `job-scheduler`/`job-conformance` — layanan yang
    sudah tidak ada — lalu berhenti SESUDAH sandi server diganti: outage.
  • Tidak ada domain yang ditulis tangan: pemeriksaan kesehatan memakai
    `APP_DOMAIN` dari `.env`.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"

# Sama dengan `SAFE_ROLE_NAME` di packages/db/src/server.ts.
ROLE_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
# Sama dengan `NAMA_AMAN` di packages/db/src/server.ts.
DB_NAME = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

ROLES = {
    "owner": ("PG_OWNER_USER", "PG_OWNER_PASSWORD", "sai_owner"),
    "app": ("PG_APP_USER", "PG_APP_PASSWORD", "sai_app"),
    "backup": ("PG_BACKUP_USER", "PG_BACKUP_PASSWORD", "sai_backup"),
}
ROLE_ATTRS = {
    "owner": "LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT",
    "app": "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT",
    "backup": "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT",
}

# Baris yang SAMA PERSIS dengan `APP_ROLE_GRANT_TEMPLATE` di
# packages/db/src/server.ts — dijalankan sesudah `SET ROLE` ke pemilik, jadi
# `ALTER DEFAULT PRIVILEGES` tanpa `FOR ROLE` berlaku untuk pemilik.
APP_ROLE_GRANT_TEMPLATE = [
    'GRANT CONNECT, TEMPORARY ON DATABASE "%DB%" TO "%ROLE%";',
    'GRANT USAGE ON SCHEMA public TO "%ROLE%";',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "%ROLE%";',
    'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "%ROLE%";',
    'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "%ROLE%";',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "%ROLE%";',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "%ROLE%";',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "%ROLE%";',
]

APP_URL_KEYS = ["DATABASE_URL", "CONTROL_DATABASE_URL", "PLATFORM_DATABASE_URL", "COMPANY_DATABASE_URL_TEMPLATE"]


def die(msg: str) -> None:
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(1)


def say(msg: str) -> None:
    print(f"  {msg}", flush=True)


# ── .env ───────────────────────────────────────────────────────────────────

ENV_LINE = re.compile(r"^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$")


def unquote(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def read_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        m = ENV_LINE.match(line)
        if m and not line.lstrip().startswith("#"):
            out[m.group(2)] = unquote(m.group(4))
    return out


def set_env_value(text: str, key: str, value: str) -> str:
    """Ganti nilai `key` (mempertahankan kutip bila ada) atau tambahkan di akhir."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = ENV_LINE.match(line)
        if m and m.group(2) == key and not line.lstrip().startswith("#"):
            raw = m.group(4).strip()
            q = raw[0] if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'" else ""
            lines[i] = f"{m.group(1)}{key}{m.group(3)}{q}{value}{q}"
            return "\n".join(lines) + "\n"
    return "\n".join(lines) + ("\n" if lines else "") + f"{key}={value}\n"


def backup_env(label: str) -> Path:
    dest = ROOT / f".env.sebelum-{label}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(ENV_FILE, dest)
    os.chmod(dest, 0o600)
    say(f"cadangan .env → {dest.name}")
    return dest


def write_env(text: str) -> None:
    tmp = ENV_FILE.with_name(".env.baru-tmp")
    tmp.write_text(text)
    os.chmod(tmp, 0o600)
    os.replace(tmp, ENV_FILE)


def new_password() -> str:
    # Alfanumerik: aman di URL tanpa pengodean, dan tanpa karakter yang
    # ditafsirkan Compose (`$`) atau shell.
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(48))


# ── SCRAM ──────────────────────────────────────────────────────────────────


def scram_verifier(password: str, iterations: int = 4096) -> str:
    """Verifier SCRAM-SHA-256 dalam bentuk `pg_authid.rolpassword` (RFC 5802/7677).

    `ALTER ROLE … PASSWORD '<verifier>'` menyimpannya apa adanya; server tidak
    pernah melihat sandi aslinya.
    """
    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    return f"SCRAM-SHA-256${iterations}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}"


# ── docker compose ─────────────────────────────────────────────────────────


def compose(args: list[str], stdin: str | None = None, env_file: Path | None = None, check: bool = True) -> str:
    """`docker compose …` — ARGV TIDAK PERNAH memuat rahasia; rahasia hanya lewat `stdin`."""
    cmd = ["docker", "compose"]
    if env_file is not None:
        cmd += ["--env-file", str(env_file)]
    cmd += args
    r = subprocess.run(cmd, cwd=ROOT, input=stdin, text=True, capture_output=True)
    if check and r.returncode != 0:
        # stderr compose tidak memuat nilai env; stdout `config` bisa — tidak dicetak.
        die(f"`docker compose {args[0]}` gagal (kode {r.returncode}):\n{r.stderr.strip()}")
    return r.stdout


def compose_config(env_file: Path | None = None) -> dict:
    return json.loads(compose(["config", "--format", "json"], env_file=env_file))


def pg_service(cfg: dict) -> str:
    cands = [n for n, s in cfg.get("services", {}).items() if str(s.get("image", "")).startswith("postgres:")]
    if len(cands) != 1:
        die(f"tidak bisa menentukan layanan PostgreSQL dari compose (kandidat: {cands})")
    return cands[0]


def running_services() -> set[str]:
    return set(compose(["ps", "--services", "--status", "running"]).split())


def changed_services(before: dict, after: dict) -> list[str]:
    """Layanan yang environment-nya BERBEDA — mereka yang memegang nilai yang berubah."""
    out = []
    for name, svc in after.get("services", {}).items():
        old = before.get("services", {}).get(name, {})
        if (svc.get("environment") or {}) != (old.get("environment") or {}):
            out.append(name)
    return sorted(out)


class Pg:
    def __init__(self, service: str, superuser: str):
        self.service = service
        self.superuser = superuser

    def run(self, sql: str, db: str = "postgres", tuples: bool = False) -> str:
        args = ["exec", "-T", self.service, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", self.superuser, "-d", db]
        if tuples:
            args += ["-At", "-F", "\t"]
        return compose(args, stdin=sql)

    def rows(self, sql: str, db: str = "postgres") -> list[list[str]]:
        out = self.run(sql, db=db, tuples=True)
        return [line.split("\t") for line in out.splitlines() if line.strip()]


def ident(name: str, kind: str = "role") -> str:
    pat = ROLE_NAME if kind == "role" else DB_NAME
    if not pat.match(name):
        die(f"nama {kind} tidak sah: {name!r}")
    return f'"{name}"'


# ── konteks bersama ────────────────────────────────────────────────────────


def load_context() -> tuple[str, dict[str, str], dict, Pg]:
    if not ENV_FILE.exists():
        die(f".env tidak ada di {ROOT}")
    text = ENV_FILE.read_text()
    env = read_env(text)
    cfg = compose_config()
    superuser = env.get("PG_USER") or "sai"
    ident(superuser)
    return text, env, cfg, Pg(pg_service(cfg), superuser)


def role_names(env: dict[str, str]) -> dict[str, str]:
    names = {k: env.get(u) or default for k, (u, _p, default) in ROLES.items()}
    for n in names.values():
        ident(n)
    su = env.get("PG_USER") or "sai"
    if su in names.values() or len(set(names.values())) != 3:
        die(f"nama peran bertabrakan: {names} / superuser {su}")
    return names


def db_from_url(raw: str | None) -> str | None:
    if not raw:
        return None
    name = urllib.parse.urlsplit(raw).path.lstrip("/") or None
    return name


def app_databases(env: dict[str, str], pg: Pg) -> tuple[list[str], list[str]]:
    """(basis data yang digarap, catatan). Sumbernya REGISTRY, bukan `pg_database`."""
    control = db_from_url(env.get("CONTROL_DATABASE_URL")) or "sai_control"
    platform = db_from_url(env.get("PLATFORM_DATABASE_URL"))
    first = env.get("DB_NAME") or db_from_url(env.get("DATABASE_URL"))
    notes: list[str] = []
    registry = pg.rows("SELECT database_name, COALESCE(db_instance_key, '') FROM companies ORDER BY id;", db=control)
    books = []
    for name, instance in registry:
        if instance:
            notes.append(f"{name}: instans `{instance}` — digarap di server instans itu, bukan di sini")
            continue
        books.append(name)
    wanted = [control] + ([platform] if platform else []) + ([first] if first else []) + books
    existing = {r[0] for r in pg.rows("SELECT datname FROM pg_database WHERE NOT datistemplate;")}
    out = []
    for d in dict.fromkeys(wanted):
        ident(d, "database")
        if d in existing:
            out.append(d)
        else:
            notes.append(f"{d}: terdaftar tetapi tidak ada di server — dilewati")
    stray = sorted(existing - set(out) - {"postgres"})
    if stray:
        notes.append("tidak terdaftar (TIDAK disentuh): " + ", ".join(stray))
    return out, notes


# ── apply ──────────────────────────────────────────────────────────────────


def ownership_sql(owner: str) -> str:
    """Alihkan setiap objek di `public` ke pemilik — kecuali milik ekstensi dan
    sekuens milik kolom (ikut tabelnya). `REASSIGN OWNED BY` tidak bisa dipakai:
    superuser bootstrap memiliki katalog sistem, dan PostgreSQL menolaknya."""
    o = owner
    return f"""
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS obj, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND c.relowner <> '{o}'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                          AND (d.deptype = 'e' OR (c.relkind = 'S' AND d.deptype IN ('a', 'i'))))
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO "{o}"',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                     WHEN 'f' THEN 'FOREIGN TABLE' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
      r.obj);
  END LOOP;
  FOR r IN
    SELECT t.oid::regtype AS typ
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typowner <> '{o}'::regrole
       AND t.typtype IN ('e', 'd', 'r')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO "{o}"', r.typ);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proowner <> '{o}'::regrole
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO "{o}"', r.fn);
  END LOOP;
END $$;
"""


def grant_sql(db: str, app: str) -> str:
    return "\n".join(line.replace("%DB%", db).replace("%ROLE%", app) for line in APP_ROLE_GRANT_TEMPLATE)


def cmd_apply() -> None:
    text, env, _cfg, pg = load_context()
    names = role_names(env)
    passwords = {k: env.get(p) or "" for k, (_u, p, _d) in ROLES.items()}
    generated = [k for k, v in passwords.items() if not v]
    for k in generated:
        passwords[k] = new_password()

    print("1/4 peran")
    stmts = []
    for k, name in names.items():
        q = ident(name)
        stmts.append(
            f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{name}') "
            f"THEN CREATE ROLE {q}; END IF; END $$;"
        )
        stmts.append(f"ALTER ROLE {q} WITH {ROLE_ATTRS[k]} PASSWORD '{scram_verifier(passwords[k])}';")
    stmts.append(f"GRANT {ident(names['app'])} TO {ident(names['backup'])};")
    stmts.append(f"GRANT pg_read_all_data TO {ident(names['backup'])};")
    pg.run("\n".join(stmts))
    for k, name in names.items():
        say(f"{name} ({k}) ✓{' — sandi BARU dibangkitkan' if k in generated else ''}")

    print("2/4 basis data")
    dbs, notes = app_databases(env, pg)
    for n in notes:
        say(f"⚠ {n}")
    owner, app, su = names["owner"], names["app"], pg.superuser
    for db in dbs:
        pg.run(f"ALTER DATABASE {ident(db, 'database')} OWNER TO {ident(owner)};")
        # Satu transaksi per buku; `lock_timeout` supaya ALTER … OWNER yang
        # menunggu kunci tabel sibuk GAGAL cepat, bukan menahan antrean aplikasi.
        sql = "\n".join(
            [
                "BEGIN;",
                "SET LOCAL lock_timeout = '5s';",
                ownership_sql(owner),
                f"SET LOCAL ROLE {ident(owner)};",
                grant_sql(db, app),
                "RESET ROLE;",
                # Objek yang masih dibuat superuser (mis. `migrate` sebelum
                # dialihkan ke pemilik) juga langsung terbaca aplikasi.
                f"ALTER DEFAULT PRIVILEGES FOR ROLE {ident(su)} IN SCHEMA public "
                f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {ident(app)};",
                f"ALTER DEFAULT PRIVILEGES FOR ROLE {ident(su)} IN SCHEMA public "
                f"GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO {ident(app)};",
                f"ALTER DEFAULT PRIVILEGES FOR ROLE {ident(su)} IN SCHEMA public "
                f"GRANT EXECUTE ON FUNCTIONS TO {ident(app)};",
                "COMMIT;",
            ]
        )
        pg.run(sql, db=db)
        say(f"{db} ✓")

    print("3/4 pemeriksaan")
    problems = check_problems(pg, names, dbs)
    if problems:
        for p in problems:
            say(f"✗ {p}")
        die("basis data belum sesuai — .env TIDAK ditulis. Perbaiki lalu jalankan ulang (idempoten).")
    say("semua basis data milik pemilik, semua tabel terjangkau aplikasi ✓")

    print("4/4 .env")
    missing = [
        (key, val)
        for k, (u, p, _d) in ROLES.items()
        for key, val in ((u, names[k]), (p, passwords[k]))
        if env.get(key) != val
    ]
    if missing:
        backup_env("hak-minimum")
        new = text
        for key, val in missing:
            new = set_env_value(new, key, val)
        write_env(new)
        say("ditulis: " + ", ".join(k for k, _ in missing))
        say("⚠ sejak sekarang `migrate`, pagar `svc-worker`, dan jalur `tenant` memakai peran baru")
        say("  pada `run`/`up` BERIKUTNYA. URL aplikasi BELUM diubah — lihat `switch-urls`.")
    else:
        say(".env sudah memuat nama & sandi ketiga peran")


# ── check ──────────────────────────────────────────────────────────────────


def check_problems(pg: Pg, names: dict[str, str], dbs: list[str]) -> list[str]:
    out = []
    owner, app, backup = names["owner"], names["app"], names["backup"]
    roles = {
        r[0]: r[1:]
        for r in pg.rows(
            "SELECT rolname, rolsuper::text, rolcreatedb::text, rolcreaterole::text, rolcanlogin::text "
            f"FROM pg_roles WHERE rolname IN ('{owner}', '{app}', '{backup}');"
        )
    }
    want = {owner: ["false", "true", "false", "true"], app: ["false", "false", "false", "true"],
            backup: ["false", "false", "false", "true"]}
    for name, attrs in want.items():
        if name not in roles:
            out.append(f"peran {name} tidak ada")
        elif roles[name] != attrs:
            out.append(f"peran {name}: atribut super/createdb/createrole/login = {roles[name]}, diharapkan {attrs}")
    if any(n not in roles for n in want):
        # Kueri di bawah memakai `'<peran>'::regrole`, yang MELEMPAR untuk peran
        # yang belum ada — laporkan dulu yang ini.
        return out
    member = pg.rows(
        f"SELECT pg_has_role('{backup}', '{app}', 'USAGE')::text, "
        f"pg_has_role('{backup}', 'pg_read_all_data', 'USAGE')::text;"
    )
    if member and member[0] != ["true", "true"]:
        out.append(f"{backup} bukan anggota {app} + pg_read_all_data")
    for db in dbs:
        dbowner = pg.rows(f"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '{db}';")
        if not dbowner or dbowner[0][0] != owner:
            out.append(f"{db}: pemilik basis data {dbowner[0][0] if dbowner else '?'}, bukan {owner}")
        rows = pg.rows(
            f"""
SELECT 'bukan milik pemilik: ' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S') AND pg_get_userbyid(c.relowner) <> '{owner}'
UNION ALL
SELECT 'aplikasi tak berhak DML: ' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
   AND NOT has_table_privilege('{app}', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
UNION ALL
SELECT 'aplikasi tak berhak sekuens: ' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'S'
   -- CASE, bukan AND: perencana boleh menilai predikat dalam urutan apa pun,
   -- dan has_sequence_privilege MELEMPAR untuk relasi yang bukan sekuens
   -- (`"pg_statistic" is not a sequence` — terjadi di produksi 22 Okt 2026).
   AND CASE WHEN c.relkind = 'S' THEN NOT has_sequence_privilege('{app}', c.oid, 'USAGE') ELSE false END
UNION ALL
SELECT 'skema di luar public: ' || nspname FROM pg_namespace
 WHERE nspname NOT IN ('public', 'information_schema') AND nspname NOT LIKE 'pg\\_%'
UNION ALL
SELECT 'default privileges pemilik belum disetel' WHERE NOT EXISTS (
  SELECT 1 FROM pg_default_acl a JOIN pg_namespace n ON n.oid = a.defaclnamespace
   WHERE n.nspname = 'public' AND a.defaclrole = '{owner}'::regrole AND a.defaclobjtype = 'r');
""",
            db=db,
        )
        out += [f"{db}: {r[0]}" for r in rows]
    return out


def cmd_check() -> None:
    _text, env, _cfg, pg = load_context()
    names = role_names(env)
    dbs, notes = app_databases(env, pg)
    for n in notes:
        say(f"⚠ {n}")
    problems = check_problems(pg, names, dbs)
    for p in problems:
        say(f"✗ {p}")
    if problems:
        sys.exit(1)
    say(f"✓ {len(dbs)} basis data: milik {names['owner']}, terjangkau {names['app']}; peran sesuai")


# ── perubahan .env + pembuatan ulang layanan ───────────────────────────────


def apply_env_change(old_text: str, new_text: str, label: str, set_passwords: dict[str, str], pg: Pg) -> None:
    """Urutan yang TIDAK boleh dibalik: hitung dampak → server → .env → layanan.

    `set_passwords` = {peran: sandi} yang dipasang di server SEBELUM `.env`
    ditulis. Container yang dibuat ulang lebih dulu akan naik dengan sandi
    yang belum berlaku.
    """
    tmp = ENV_FILE.with_name(".env.rencana-tmp")
    tmp.write_text(new_text)
    os.chmod(tmp, 0o600)
    try:
        before = compose_config()
        after = compose_config(env_file=tmp)
    finally:
        tmp.unlink(missing_ok=True)
    changed = changed_services(before, after)
    running = running_services()
    # Layanan PostgreSQL sendiri TIDAK PERNAH dibuat ulang di sini: `POSTGRES_PASSWORD`
    # hanya berlaku saat inisialisasi direktori data, dan membuat ulang `pg` =
    # me-restart basis data setiap layanan. Sandinya sudah diganti lewat ALTER ROLE.
    recreate = [s for s in changed if s in running and s != pg.service]
    say("layanan yang environment-nya berubah: " + (", ".join(changed) or "(tidak ada)"))
    say("yang sedang berjalan & akan dibuat ulang: " + (", ".join(recreate) or "(tidak ada)"))

    for role, password in set_passwords.items():
        pg.run(f"ALTER ROLE {ident(role)} PASSWORD '{scram_verifier(password)}';")
        say(f"server: sandi {role} ✓")

    backup = backup_env(label)
    write_env(new_text)
    say(".env ✓")

    if recreate:
        # Nama layanan berasal dari `docker compose config`, bukan dari teks skrip.
        compose(["up", "-d", "--no-deps", *recreate])
        say("dibuat ulang ✓")
    health(read_env(new_text))
    print(f"\n  Bila ada yang tidak sehat: python3 scripts/postgres-roles.py rollback {backup.name}")


def health(env: dict[str, str]) -> None:
    domain = (env.get("APP_DOMAIN") or "").strip()
    if not domain:
        say("⚠ APP_DOMAIN kosong di .env — pemeriksaan kesehatan publik dilewati")
        return
    url = f"https://{domain}/api/health"
    for attempt in range(12):
        time.sleep(5)
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                body = json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            if attempt == 11:
                say(f"✗ {url}: {e}")
            continue
        for k, v in body.items():
            say(f"   {k} = {v.get('status') if isinstance(v, dict) else v}")
        return


def rewrite_userinfo(raw: str, user: str, password: str) -> str:
    u = urllib.parse.urlsplit(raw)
    host = u.hostname or ""
    netloc = f"{urllib.parse.quote(user, safe='')}:{urllib.parse.quote(password, safe='')}@{host}"
    if u.port:
        netloc += f":{u.port}"
    return urllib.parse.urlunsplit((u.scheme, netloc, u.path, u.query, u.fragment))


def cmd_switch_urls() -> None:
    text, env, _cfg, pg = load_context()
    names = role_names(env)
    for k, (u, p, _d) in ROLES.items():
        if not env.get(u) or not env.get(p):
            die(f"{u}/{p} belum ada di .env — jalankan `apply` dulu")
    dbs, _notes = app_databases(env, pg)
    problems = check_problems(pg, names, dbs)
    if problems:
        for p in problems:
            say(f"✗ {p}")
        die("`check` belum bersih — URL TIDAK dialihkan")
    new = text
    for key in APP_URL_KEYS:
        if env.get(key):
            new = set_env_value(new, key, rewrite_userinfo(env[key], env["PG_APP_USER"], env["PG_APP_PASSWORD"]))
            say(f"{key} → {env['PG_APP_USER']}")
    control = env.get("CONTROL_DATABASE_URL")
    if not control:
        die("CONTROL_DATABASE_URL kosong di .env")
    provision = rewrite_userinfo(control, env["PG_OWNER_USER"], env["PG_OWNER_PASSWORD"])
    new = set_env_value(new, "PROVISION_DATABASE_URL", provision)
    say(f"PROVISION_DATABASE_URL → {env['PG_OWNER_USER']} (host yang sama dengan CONTROL_DATABASE_URL)")
    apply_env_change(text, new, "alih-url", {}, pg)


def cmd_rotate(which: str) -> None:
    text, env, _cfg, pg = load_context()
    if which == "superuser":
        user_key, pass_key, role = "PG_USER", "PG_PASSWORD", pg.superuser
    elif which in ROLES:
        user_key, pass_key, default = ROLES[which]
        role = env.get(user_key) or default
    else:
        die("peran: superuser | owner | app | backup")
    ident(role)
    old = env.get(pass_key) or ""
    if not old:
        die(f"{pass_key} kosong di .env — tidak ada yang diputar")
    new_pw = new_password()

    new = set_env_value(text, pass_key, new_pw)
    # Setiap URL yang memakai peran ini dengan sandi lama.
    for key, val in read_env(text).items():
        if "://" not in val:
            continue
        u = urllib.parse.urlsplit(val)
        if urllib.parse.unquote(u.username or "") == role and urllib.parse.unquote(u.password or "") == old:
            new = set_env_value(new, key, rewrite_userinfo(val, role, new_pw))
            say(f"{key} ikut diganti")
    # Sandi lama yang masih tersisa = URL yang tidak dikenali (pengodean lain,
    # kutip ganjil). Berhenti SEBELUM server disentuh, tidak menebak.
    for form in {old, urllib.parse.quote(old, safe="")}:
        if form in new:
            die("sandi lama masih muncul di .env sesudah penggantian — berhenti, server TIDAK disentuh.")
    apply_env_change(text, new, f"putar-sandi-{which}", {role: new_pw}, pg)


def cmd_rollback(backup_name: str) -> None:
    text, env, _cfg, pg = load_context()
    path = (ROOT / backup_name).resolve()
    if path.parent != ROOT or not path.name.startswith(".env.sebelum-") or not path.exists():
        die(f"bukan cadangan .env yang dikenal: {backup_name}")
    old_text = path.read_text()
    old_env = read_env(old_text)
    restore: dict[str, str] = {}
    pairs = [("PG_USER", "PG_PASSWORD", pg.superuser)] + [(u, p, d) for (u, p, d) in ROLES.values()]
    for user_key, pass_key, default in pairs:
        if old_env.get(pass_key) and old_env.get(pass_key) != env.get(pass_key):
            restore[old_env.get(user_key) or default] = old_env[pass_key]
    apply_env_change(text, old_text, "rollback", restore, pg)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cmd, rest = sys.argv[1], sys.argv[2:]
    if cmd == "apply":
        cmd_apply()
    elif cmd == "check":
        cmd_check()
    elif cmd == "switch-urls":
        cmd_switch_urls()
    elif cmd == "rotate" and len(rest) == 1:
        cmd_rotate(rest[0])
    elif cmd == "rollback" and len(rest) == 1:
        cmd_rollback(rest[0])
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
