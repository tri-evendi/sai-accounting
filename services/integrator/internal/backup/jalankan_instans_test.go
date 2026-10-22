// PENJAGA putaran cadangan per instans (tahap 4).
//
// Dua janji: pemasangan satu server tidak melihat satu nama objek pun berubah,
// dan instans tambahan yang gagal tidak menghentikan cadangan instans lain —
// tapi juga tidak pernah membuat putarannya terbaca berhasil.
package backup

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestTanpaInstansNamaObjekDanManifestSAMADenganSebelumTahap4(t *testing.T) {
	/* Runbook pemulihan di PRODUCTION.md dan `prove-backup-restore` menyebut
	   nama-nama ini apa adanya. */
	akar := t.TempDir()
	h, err := Jalankan(context.Background(), opsiContoh(t, NewCakram(akar), &pendumpPalsu{}))
	if err != nil {
		t.Fatalf("Jalankan: %v", err)
	}
	var kunci []string
	for _, o := range h.Manifest.Objek {
		kunci = append(kunci, o.Kunci)
	}
	mau := []string{
		"db-sai_control.dump.enc", "db-sai_platform.dump.enc",
		"db-sai_pt_satu.dump.enc", "db-sai_pt_dua.dump.enc",
		"globals.sql.enc", "berkas.tar.gz.enc",
	}
	if !reflect.DeepEqual(kunci, mau) {
		t.Errorf("kunci objek = %v\nmau %v", kunci, mau)
	}
	b, err := os.ReadFile(filepath.Join(akar, h.Manifest.Putaran, NamaManifest)) //nolint:gosec // t.TempDir()
	if err != nil {
		t.Fatal(err)
	}
	// Bidang tahap 4 TIDAK ditulis sama sekali tanpa instans tambahan.
	if strings.Contains(string(b), `"instans`) {
		t.Errorf("manifest satu server memuat bidang instans:\n%s", b)
	}
}

// contohSaat sama dengan `Saat` di opsiContoh.
func contohSaat() time.Time { return time.Date(2026, 10, 20, 11, 45, 0, 0, time.UTC) }

func cacahDuaInstans(db2 Pendump) *Cacah {
	return &Cacah{
		Basis: []Basis{
			{Nama: "sai_control", Peran: PeranKendali},
			{Nama: "sai_pt_satu", Peran: PeranPerusahaan, CompanyID: idDari(1)},
			// Salinan lama di server bawaan — `other`, tanpa companyId.
			{Nama: "sai_pt_dua", Peran: PeranLain},
			{Nama: "sai_pt_dua", Peran: PeranPerusahaan, CompanyID: idDari(2), Instans: "db2"},
		},
		Instans: []InstansTercacah{{Kunci: "db2", VersiServer: 17, Pendump: db2}},
	}
}

func TestInstansTambahanDidumpDENGANPendumpnyaSendiriDiBawahSubdirektori(t *testing.T) {
	akar := t.TempDir()
	bawaan, db2 := &pendumpPalsu{}, &pendumpPalsu{}
	o := opsiContoh(t, NewCakram(akar), bawaan)
	o.Cacah = cacahDuaInstans(db2)
	h, err := Jalankan(context.Background(), o)
	if err != nil {
		t.Fatalf("Jalankan: %v", err)
	}

	// Server yang BENAR yang dipanggil — tidak pernah bawaan untuk db2.
	if !reflect.DeepEqual(db2.dipanggil, []string{"sai_pt_dua", "(globals)"}) {
		t.Errorf("pendump db2 dipanggil untuk %v", db2.dipanggil)
	}
	if !reflect.DeepEqual(bawaan.dipanggil, []string{"sai_control", "sai_pt_satu", "sai_pt_dua", "(globals)"}) {
		t.Errorf("pendump bawaan dipanggil untuk %v", bawaan.dipanggil)
	}

	perKunci := map[string]Objek{}
	for _, ob := range h.Manifest.Objek {
		perKunci[ob.Kunci] = ob
		if _, err := os.Stat(filepath.Join(akar, h.Manifest.Putaran, ob.Kunci)); err != nil {
			t.Errorf("objek %s tidak ada di tujuan: %v", ob.Kunci, err)
		}
		if _, err := os.Stat(filepath.Join(akar, h.Manifest.Putaran, ob.Kunci+".sha256")); err != nil {
			t.Errorf("sidik %s tidak ada: %v", ob.Kunci, err)
		}
	}
	for _, k := range []string{
		"db-sai_pt_dua.dump.enc", "instans/db2/db-sai_pt_dua.dump.enc",
		"globals.sql.enc", "instans/db2/globals.sql.enc",
	} {
		if _, ada := perKunci[k]; !ada {
			t.Errorf("objek %s tidak ada di manifest", k)
		}
	}
	if g := perKunci["instans/db2/globals.sql.enc"]; g.Instans != "db2" || g.Jenis != JenisGlobals {
		t.Errorf("globals db2 = %+v", g)
	}

	// "Pulihkan PT 2" menunjuk buku di db2, bukan salinan lama di bawaan.
	p := h.Manifest.BasisPerusahaan(2)
	if p == nil || p.Kunci != "instans/db2/db-sai_pt_dua.dump.enc" || p.Instans != "db2" {
		t.Errorf("objek PT 2 = %+v", p)
	}
	if !reflect.DeepEqual(h.Manifest.Instans, []InfoInstans{{Kunci: "db2", VersiServer: 17}}) {
		t.Errorf("manifest.instans = %+v", h.Manifest.Instans)
	}
	if h.Manifest.PerusahaanTerdaftar != 2 {
		t.Errorf("perusahaanTerdaftar = %d", h.Manifest.PerusahaanTerdaftar)
	}
	if h.Status != "local" {
		t.Errorf("status = %q", h.Status)
	}
}

func TestInstansGAGALTidakMenghentikanInstansLainTapiPutarannyaError(t *testing.T) {
	akar := t.TempDir()
	// Putaran lama yang TIDAK boleh dipangkas oleh putaran sebagian.
	lama := NamaPutaran("sai", contohSaat().AddDate(0, 0, -90))
	if err := os.MkdirAll(filepath.Join(akar, lama), 0o700); err != nil {
		t.Fatal(err)
	}

	bawaan := &pendumpPalsu{}
	o := opsiContoh(t, NewCakram(akar), bawaan)
	o.Cacah = &Cacah{
		Basis: []Basis{
			{Nama: "sai_control", Peran: PeranKendali},
			{Nama: "sai_pt_satu", Peran: PeranPerusahaan, CompanyID: idDari(1)},
		},
		Gagal: []InstansGagal{{
			Kunci: "db2", Sebab: "COMPANY_DB2_DATABASE_URL_TEMPLATE tidak diset",
			Basis: []string{"sai_pt_dua"},
		}},
	}
	h, err := Jalankan(context.Background(), o)

	var gi *GalatInstans
	if !errors.As(err, &gi) {
		t.Fatalf("galat = %v, mau *GalatInstans", err)
	}
	if !strings.Contains(err.Error(), "sai_pt_dua") || !strings.Contains(err.Error(), "db2") {
		t.Errorf("pesan tidak menyebut instans & PT-nya: %v", err)
	}
	if h == nil {
		t.Fatal("hasil sebagian tidak dipulangkan — jejaknya tidak bisa menyebut putarannya")
	}
	if h.Status != "error" {
		t.Errorf("status = %q, mau error", h.Status)
	}
	// Instans bawaan TETAP dicadangkan.
	if len(bawaan.dipanggil) == 0 {
		t.Error("instans bawaan tidak dicadangkan")
	}
	b, err := os.ReadFile(filepath.Join(akar, h.Manifest.Putaran, NamaManifest)) //nolint:gosec // t.TempDir()
	if err != nil {
		t.Fatalf("manifest putaran sebagian tidak ditulis: %v", err)
	}
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if len(m.InstansGagal) != 1 || m.InstansGagal[0].Kunci != "db2" {
		t.Errorf("manifest.instansGagal = %+v", m.InstansGagal)
	}
	// PT di instans gagal tetap dihitung terdaftar — angkanya tidak boleh
	// menyusut diam-diam.
	if m.PerusahaanTerdaftar != 2 {
		t.Errorf("perusahaanTerdaftar = %d, mau 2", m.PerusahaanTerdaftar)
	}
	if _, err := os.Stat(filepath.Join(akar, lama)); err != nil {
		t.Error("putaran lama DIPANGKAS oleh putaran sebagian")
	}
}

func TestServerInstansLebihBaruDaripadaPgDumpGagalSendiri(t *testing.T) {
	bawaan, db2 := &pendumpPalsu{}, &pendumpPalsu{}
	o := opsiContoh(t, NewCakram(t.TempDir()), bawaan)
	o.Cacah = cacahDuaInstans(db2)
	o.Cacah.Instans[0].VersiServer = 18
	h, err := Jalankan(context.Background(), o)
	var gi *GalatInstans
	if !errors.As(err, &gi) || len(gi.Gagal) != 1 || gi.Gagal[0].Kunci != "db2" {
		t.Fatalf("galat = %v", err)
	}
	if !reflect.DeepEqual(gi.Gagal[0].Basis, []string{"sai_pt_dua"}) {
		t.Errorf("PT terdampak = %v", gi.Gagal[0].Basis)
	}
	if len(db2.dipanggil) != 0 {
		t.Errorf("pg_dump tetap dijalankan terhadap server yang lebih baru: %v", db2.dipanggil)
	}
	if h == nil || h.Status != "error" {
		t.Errorf("hasil = %+v", h)
	}
}

func TestBasisDariInstansYangTidakTercacahDITOLAK(t *testing.T) {
	// Kesalahan pemrograman, bukan keadaan operasional: basis yang menunjuk
	// instans tanpa pendump tidak boleh jatuh ke pendump bawaan.
	bawaan := &pendumpPalsu{}
	o := opsiContoh(t, NewCakram(t.TempDir()), bawaan)
	o.Cacah = &Cacah{Basis: []Basis{
		{Nama: "sai_control", Peran: PeranKendali},
		{Nama: "sai_pt_dua", Peran: PeranPerusahaan, CompanyID: idDari(2), Instans: "db2"},
	}}
	if _, err := Jalankan(context.Background(), o); err == nil {
		t.Fatal("basis instans tanpa pendump diterima")
	}
	if len(bawaan.dipanggil) != 0 {
		t.Errorf("pendump bawaan dipanggil: %v", bawaan.dipanggil)
	}
}
