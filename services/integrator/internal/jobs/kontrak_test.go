// PENJAGA kontrak di sisi Go — yang hanya bisa diperiksa dari dalam Go.
//
// Sisi TypeScript sudah menjaga bahwa kontrak, skema Prisma, dan migration
// menyatakan hal yang sama. Yang TIDAK bisa dilihat dari sana: apakah pohon Go
// benar-benar MEMAKAI kontrak itu, atau punya daftarnya sendiri yang kebetulan
// mirip. Penjaga di berkas ini memeriksa pemakaiannya.
package jobs

import (
	"context"
	"testing"

	"github.com/tri-evendi/sai-accounting/services/integrator/internal/contract"
)

func TestSetiapKindMilikJalurYangMengklaimnya(t *testing.T) {
	// Inti kegagalan senyap yang kontrak ini ada untuk mencegah: `kind` yang
	// diterbitkan tapi tidak diklaim satu jalur pun menumpuk sebagai baris
	// `queued` SELAMANYA — tanpa galat, tanpa pekerja yang mengeluh.
	terdaftar := map[contract.JobKind]int{}
	for lane, kinds := range contract.KindsByLane {
		if _, ada := contract.JobLanes[lane]; !ada {
			t.Errorf("KindsByLane memuat jalur %q yang tidak ada di JobLanes", lane)
		}
		for _, k := range kinds {
			terdaftar[k]++
		}
	}
	for k := range contract.JobKinds {
		switch terdaftar[k] {
		case 1:
		case 0:
			t.Errorf("kind %q tidak diklaim satu jalur pun", k)
		default:
			t.Errorf("kind %q diklaim %d jalur", k, terdaftar[k])
		}
	}
	for lane := range contract.JobLanes {
		if _, ada := contract.KindsByLane[lane]; !ada {
			t.Errorf("jalur %q tidak punya entri di KindsByLane", lane)
		}
	}
}

func TestPintuPostingTunggal(t *testing.T) {
	// Invarian I-2. Kalau ini jatuh, ada dua mesin yang menulis buku besar — dan
	// penyimpangan di antara keduanya tidak memunculkan galat.
	for k, spec := range contract.JobKinds {
		if spec.WritesLedger && spec.Lane != contract.LaneLedger {
			t.Errorf("kind %q menulis buku di jalur %q — hanya jalur ledger boleh", k, spec.Lane)
		}
	}
	if !contract.JobLanes[contract.LaneLedger].SingleInstance {
		t.Error("jalur ledger bukan tunggal-instans — dua proses = dua penulis buku")
	}
}

func TestClaimMenolakJalurPenulisBuku(t *testing.T) {
	// Claim memeriksa WritesLedger SEBELUM menyentuh basis data, jadi penjaga
	// ini berjalan tanpa satu pun koneksi. Yang diuji: pelari Go yang salah
	// dikonfigurasi ke jalur `ledger` GAGAL, bukan diam-diam mengklaim pekerjaan
	// yang memposting.
	// pool nil: tidak pernah terpakai, sebab pemeriksaan I-2 berdiri lebih dulu.
	q := &Queue{}
	if _, err := q.Claim(context.Background(), contract.LaneLedger, "uji"); err == nil {
		t.Fatal("Claim pada jalur ledger tidak menolak")
	}
}

func TestClaimMenolakJalurTakDikenal(t *testing.T) {
	q := &Queue{}
	if _, err := q.Claim(context.Background(), contract.JobLane("tidak-ada"), "uji"); err == nil {
		t.Fatal("Claim pada jalur tak dikenal tidak menolak")
	}
}

func TestPenjagaTipeMenolakNilaiAsing(t *testing.T) {
	if !contract.IsJobKind("tenant.backup") {
		t.Error("tenant.backup tidak dikenal")
	}
	if contract.IsJobKind("tenant.tidak-ada") {
		t.Error("kind karangan dikenal")
	}
	if !contract.IsJobStatus("queued") {
		t.Error("queued tidak dikenal")
	}
	if contract.IsJobStatus("pending") {
		t.Error("status karangan dikenal")
	}
}

func TestJalurTenantDanSchemaTunggalInstans(t *testing.T) {
	// Dua pelari `tenant` = dua dump menulis ke satu kunci objek, dan yang
	// terakhir menang. Dua pelari `schema` = dua migration bertabrakan.
	for _, lane := range []contract.JobLane{contract.LaneTenant, contract.LaneSchema} {
		if !contract.JobLanes[lane].SingleInstance {
			t.Errorf("jalur %q bukan tunggal-instans", lane)
		}
	}
}
