// PELARI JALUR `tenant` SAJA — untuk mengembangkan dan menguji satu jalur.
//
//	go run ./cmd/tenant     # set -a; . ./.env; set +a — butuh CONTROL_DATABASE_DIRECT_URL
//
// Produksi TIDAK menjalankan biner ini. Sejak "1 image = 1 container"
// (22 Okt 2026) image `-integrator` hanya memuat `svc-integrator`
// (`cmd/integrator`), yang menjalankan jalur ini BERSAMA jalur `interactive`
// sisi Go di satu proses. Seluruh logikanya di `internal/tenantlane`; berkas
// ini hanya pintunya, supaya pengembang bisa menjalankan cadangan tanpa ikut
// menguras antrean ekspor.
//
// ══ TIDAK ADA `.env` DI SINI ═══════════════════════════════════════════════
// Lingkungannya datang dari `env_file:` di compose, bukan dari pustaka dotenv
// di dalam biner. Satu pustaka lebih sedikit di image yang seharusnya berisi
// satu biner statis — dan saat mengembangkan, `set -a; . ./.env; set +a` sudah
// cukup.
package main

import (
	"context"
	"log"
	"os"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/tenantlane"
)

func main() {
	if err := tenantlane.Run(context.Background(), nil); err != nil {
		log.Printf("[tenant] GAGAL: %v", err)
		os.Exit(1)
	}
}
