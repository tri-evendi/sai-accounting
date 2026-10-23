package tenantlane

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/buildinfo"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/conformance"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/registry"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/trail"
)

// MuatanKesesuaian: bentuk muatan `tenant.conformance` yang diterbitkan
// `scripts/check-data-conformance.ts` ketika `runner: go`. Semua medan
// opsional.
type MuatanKesesuaian struct {
	// AmbangPenampung: teks `--ambang-penampung=<persen>` APA ADANYA dari
	// argumen Node, dibaca di sini dengan `Number()` JS (`conformance.Threshold`)
	// — bukan angka yang sudah diurai, supaya satu nilai tidak diurai dua kali
	// dengan dua aturan.
	AmbangPenampung *string `json:"ambangPenampung,omitempty"`
	// Detail: `--detail` — seluruh baris di log, bukan tiga contoh.
	Detail bool `json:"detail,omitempty"`
}

// GoRunsConformance: apakah Go pelaksana sapuan menurut kontrak hari ini.
func GoRunsConformance() bool {
	return contract.KindRunners[contract.KindTenantConformance] == contract.RunnerGo
}

// handlerKesesuaian menjalankan satu putaran sapuan kesesuaian SELURUH buku.
//
// Temuan BUKAN kegagalan pekerjaan: pemeriksanya bekerja persis sebagaimana
// mestinya. Pekerjaan gagal hanya bila registry tak terbaca (padanan Node yang
// keluar sebelum menyapu — tanpa jejak, sebab kendali yang tak terbaca juga
// tak bisa ditulisi). Buku yang gagal diperiksa dicatat di jejak sebagai
// `error`, sama dengan Node.
func handlerKesesuaian(kolam *pgxpool.Pool) jobs.Handler {
	return func(c jobs.Ctx) (*string, error) {
		if !GoRunsConformance() {
			log.Printf("[tenant] pelaksana `%s` adalah %s (contract/kinds.yaml → runner) — "+
				"pekerjaan ini diselesaikan TANPA menyapu; yang menyapu peran `conformance` di svc-worker.",
				contract.KindTenantConformance, contract.KindRunners[contract.KindTenantConformance])
			return nil, nil
		}
		var m MuatanKesesuaian
		if len(c.Payload) > 0 && string(c.Payload) != "null" {
			if err := json.Unmarshal(c.Payload, &m); err != nil {
				return nil, fmt.Errorf("muatan %s tak terbaca: %w", contract.KindTenantConformance, err)
			}
		}
		_, err := SweepAndRecord(c.Ctx, kolam, m, func(s string) { log.Printf("[kesesuaian] %s", s) })
		return nil, err
	}
}

// SweepAndRecord: satu putaran penuh — registry, sapuan, jejak. Pulang nil
// HANYA bila registry tak terbaca; temuan dan buku yang gagal ada di hasil.
func SweepAndRecord(ctx context.Context, kolam *pgxpool.Pool, m MuatanKesesuaian, cetak func(string)) (*conformance.Result, error) {
	mulai := time.Now().UTC()
	companies, err := registry.ListAll(ctx, kolam)
	if err != nil {
		return nil, err
	}
	ambang := conformance.Threshold(m.AmbangPenampung)
	serentak := conformance.Concurrency(os.Getenv("CONFORMANCE_CONCURRENCY"), cetak)
	hasil := conformance.Sweep(ctx, companies, conformance.OpenAndCheck(ambang), serentak, m.Detail)
	for _, b := range hasil.Lines {
		cetak(b)
	}

	b := buildinfo.Get()
	details, err := conformance.TrailDetails(hasil, b.Label(), buildinfo.Service)
	if err != nil {
		return &hasil, fmt.Errorf("rakit jejak kesesuaian: %w", err)
	}
	// Ditelan, dengan sengaja — lihat `trail.RekamKesesuaian`.
	if err := trail.RekamKesesuaian(ctx, kolam, trail.PutaranKesesuaian{
		MulaiPada: mulai, SelesaiPada: time.Now().UTC(),
		Status: hasil.Status, CompaniesChecked: hasil.CompaniesChecked,
		CompaniesFailed: hasil.CompaniesFailed, FindingCount: hasil.FindingCount,
		Details: details,
	}); err != nil {
		cetak(fmt.Sprintf("⚠ jejak putaran tidak tercatat (%v). Pemeriksaannya sendiri TIDAK terpengaruh — lihat hasil di atas.", err))
	}
	return &hasil, nil
}
