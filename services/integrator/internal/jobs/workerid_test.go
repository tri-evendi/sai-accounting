package jobs

import (
	"strings"
	"testing"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/buildinfo"
)

// Identitas pekerja membawa stempel build (`jobs.claimed_by`) — konsol membaca
// build pelari Go dari sana, sebab pohon ini tidak boleh menulis tabel lain.
func TestWorkerIDMembawaStempelBuild(t *testing.T) {
	id := WorkerID("tenant")
	if !strings.HasPrefix(id, "tenant@") {
		t.Fatalf("kepala identitas hilang: %q", id)
	}
	want := " " + buildinfo.Service + " " + buildinfo.Get().Label()
	if !strings.HasSuffix(id, want) {
		t.Fatalf("identitas %q tidak berakhir dengan stempel %q", id, want)
	}
	if len(id) > buildinfo.IdentityMax {
		t.Fatalf("identitas %d karakter melampaui claimed_by VARCHAR(%d)", len(id), buildinfo.IdentityMax)
	}
	// Stabil antar-panggilan: perpanjangan lease mencocokkan `claimed_by = $2`.
	if WorkerID("tenant") != id {
		t.Fatal("WorkerID berubah antar-panggilan — lease akan hilang")
	}
}
