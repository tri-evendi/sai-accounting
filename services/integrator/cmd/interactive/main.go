// PELARI JALUR `interactive` SISI GO SAJA — untuk mengembangkan dan menguji
// satu jalur.
//
//	go run ./cmd/interactive     # set -a; . ./.env; set +a
//
// Produksi TIDAK menjalankan biner ini. Sejak "1 image = 1 container"
// (22 Okt 2026) image `-integrator` hanya memuat `svc-integrator`
// (`cmd/integrator`), yang menjalankan jalur ini BERSAMA jalur `tenant` di
// satu proses. Seluruh logikanya di `internal/interactivelane`; berkas ini
// hanya pintunya — pintu yang tidak membuka sambungan langsung ke `pg`
// maupun membaca kunci cadangan, yang berguna saat menguji ekspor.
package main

import (
	"context"
	"log"
	"os"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/interactivelane"
)

func main() {
	if err := interactivelane.Run(context.Background(), nil); err != nil {
		log.Printf("[interactive-go] GAGAL: %v", err)
		os.Exit(1)
	}
}
