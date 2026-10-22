// DIBANGKITKAN DARI `contract/db-instances.yaml` — JANGAN DISUNTING TANGAN.
//
// Jalankan `bun run contract:gen` setelah mengubah kontraknya, dan commit
// hasilnya bersama perubahan itu. `bun run contract:gen -- --cek` gagal bila
// berkas ini basi, dan penjaga `tests/contract-db-instances.test.ts` memanggilnya.
//
// Kontrak instans basis data versi 1.

package contract

// DBInstanceDefaultLabel: label instans bawaan, yang tidak punya baris
// `db_instances`. Berbentuk kunci, dan karena itu ditolak eksplisit sebagai
// kunci baris.
const DBInstanceDefaultLabel = "default"

// DBInstanceKeyPattern: bentuk `db_instances.key` (CHECK kendali 0009).
const DBInstanceKeyPattern = `^[a-z][a-z0-9_]{0,31}$`

// DBInstanceURLEnvPattern: bentuk `db_instances.url_env_var` (CHECK kendali 0009).
const DBInstanceURLEnvPattern = `^COMPANY_[A-Z0-9_]+_DATABASE_URL_TEMPLATE$`

// Nama env var yang disarankan = prefix + KUNCI (huruf besar) + suffix.
const (
	DBInstanceURLEnvPrefix = "COMPANY_"
	DBInstanceURLEnvSuffix = "_DATABASE_URL_TEMPLATE"
)

// BackupInstanceObjectPrefix: direktori objek instans tambahan di dalam
// putaran cadangan.
const BackupInstanceObjectPrefix = "instans/"
