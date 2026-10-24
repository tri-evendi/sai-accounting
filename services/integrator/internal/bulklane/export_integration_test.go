package bulklane

import (
	"archive/zip"
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/db"
	"github.com/tri-evendi/sai-accounting/services/integrator/internal/jobs"
)

// UJI INTEGRASI handler ekspor tenant atas basis data SUNGGUHAN (sekali-pakai):
//
//	TENANT_EXPORT_TEST_TENANT_ID=<id> CONTROL_DATABASE_URL=… COMPANY_DATABASE_URL_TEMPLATE=… \
//	  go test ./internal/bulklane/ -run Integrasi
//
// Yang dibuktikan, di luar paritas isi (`bun run parity:tenant-export`):
// handler membaca `tenant_id` pekerjaan, menulis ZIP lewat
// `document.WriteResultStream` ke `<akar>/tenant-data_export-<id>/ekspor-…zip`
// tanpa `.partial` tertinggal, melaporkan kemajuan naik sampai 100, dan
// MENOLAK bekerja selama kontrak menyatakan pelaksananya bukan Go.
func TestIntegrasiHandlerEksporTenant(t *testing.T) {
	raw := os.Getenv("TENANT_EXPORT_TEST_TENANT_ID")
	if raw == "" {
		t.Skip("TENANT_EXPORT_TEST_TENANT_ID tidak diset — uji integrasi dilewati")
	}
	id, err := strconv.Atoi(raw)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	kolam, err := db.Kendali(ctx, 2)
	if err != nil {
		t.Fatal(err)
	}
	defer kolam.Close()

	tenantID := int32(id)
	akar := t.TempDir()
	var kemajuan []int
	jc := jobs.Ctx{
		Ctx:      ctx,
		Job:      &jobs.Job{ID: 777, Kind: contract.KindTenantDataExport, TenantID: &tenantID},
		Payload:  []byte(`{}`),
		Progress: func(p int) error { kemajuan = append(kemajuan, p); return nil },
	}

	// Pelaksana bukan Go → gagal yang terbaca, tanpa berkas.
	if _, err := handlerEkspor(kolam, akar, "data/documents", func() bool { return false })(jc); err == nil ||
		!strings.Contains(err.Error(), "bukan Go") {
		t.Fatalf("runner node harus menolak, dapat %v", err)
	}
	if entri, _ := os.ReadDir(akar); len(entri) != 0 {
		t.Fatalf("runner node meninggalkan berkas: %v", entri)
	}

	ref, err := handlerEkspor(kolam, akar, "data/documents", func() bool { return true })(jc)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(*ref, "tenant-data_export-777/ekspor-") || !strings.HasSuffix(*ref, ".zip") {
		t.Fatalf("result_ref %q", *ref)
	}
	berkas := filepath.Join(akar, *ref)
	info, err := os.Stat(berkas)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v, mau 0600", info.Mode().Perm())
	}
	if sisa, _ := filepath.Glob(filepath.Join(akar, "*", "*.partial")); len(sisa) > 0 {
		t.Fatalf(".partial tertinggal: %v", sisa)
	}
	r, err := zip.OpenReader(berkas)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	ada := map[string]bool{}
	for _, f := range r.File {
		ada[f.Name] = true
	}
	if !ada["tenant.json"] || !ada["BACA-SAYA.txt"] {
		t.Fatalf("entri pengantar hilang: %d entri", len(r.File))
	}
	if len(kemajuan) == 0 || kemajuan[len(kemajuan)-1] != 100 {
		t.Fatalf("kemajuan %v", kemajuan)
	}
	t.Logf("%s: %d entri, %d byte, kemajuan %v", *ref, len(r.File), info.Size(), kemajuan)
}
