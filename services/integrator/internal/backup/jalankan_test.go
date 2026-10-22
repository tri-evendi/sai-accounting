// PENJAGA satu putaran cadangan — urutan langkah, isi manifest, dan dua hal
// yang WAJIB menggagalkan putaran.
//
// Jalankan() diuji dengan pendump suntikan, bukan dengan `pg_dump` sungguhan.
// Yang dipertukarkan hanya SUMBER byte-nya; enkripsi, sidik jari, pengiriman,
// manifest, dan pemangkasan adalah kode yang sama persis yang berjalan di
// produksi. Alternatifnya — menuntut server PostgreSQL berisi — berarti bagian
// paling menentukan jalur ini tidak pernah dilewati satu tes pun.
package backup

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// pendumpPalsu menuliskan teks yang bisa dikenali per basis data.
type pendumpPalsu struct {
	gagalPada    string
	gagalGlobals bool
	dipanggil    []string
}

func (p *pendumpPalsu) DumpBasis(_ context.Context, nama string, w io.Writer) error {
	p.dipanggil = append(p.dipanggil, nama)
	if nama == p.gagalPada {
		return fmt.Errorf("pg_dump %s gagal (disengaja)", nama)
	}
	_, err := io.WriteString(w, "-- dump "+nama+"\n"+strings.Repeat("x", 3000))
	return err
}

func (p *pendumpPalsu) DumpGlobals(_ context.Context, w io.Writer) error {
	p.dipanggil = append(p.dipanggil, "(globals)")
	if p.gagalGlobals {
		return fmt.Errorf("pg_dumpall: permission denied for table pg_authid (disengaja)")
	}
	_, err := io.WriteString(w, "CREATE ROLE sai;\n")
	return err
}

func idDari(n int32) *int32 { return &n }

func cacahContoh() *Cacah {
	return &Cacah{Basis: []Basis{
		{Nama: "sai_control", Peran: PeranKendali},
		{Nama: "sai_platform", Peran: PeranPlatform},
		{Nama: "sai_pt_satu", Peran: PeranPerusahaan, CompanyID: idDari(1)},
		{Nama: "sai_pt_dua", Peran: PeranPerusahaan, CompanyID: idDari(2)},
	}}
}

func opsiContoh(t *testing.T, tujuan Tujuan, pd Pendump) Opsi {
	t.Helper()
	dirData := t.TempDir()
	for _, sub := range []string{"documents", "audit"} {
		if err := os.MkdirAll(filepath.Join(dirData, sub), 0o700); err != nil {
			t.Fatalf("siapkan %s: %v", sub, err)
		}
		if err := os.WriteFile(filepath.Join(dirData, sub, "isi.txt"), []byte(sub), 0o600); err != nil {
			t.Fatalf("tulis %s: %v", sub, err)
		}
	}
	return Opsi{
		Prefix:      "sai",
		Kunci:       sandiUji,
		Perkakas:    pd,
		Tujuan:      tujuan,
		Cacah:       cacahContoh(),
		NamaKendali: "sai_control",
		VersiServer: 17,
		VersiKlien:  17,
		RetensiHari: 30,
		DirKerja:    t.TempDir(),
		DirData:     dirData,
		Saat:        time.Date(2026, 10, 20, 11, 45, 0, 0, time.UTC),
	}
}

func TestSetiapBasisDataPunyaObjekDumpnyaSENDIRI(t *testing.T) {
	// Inti celah #5: `pg_dumpall` berarti satu tenant tidak bisa dipulihkan
	// tanpa menyentuh tenant lain.
	akar := t.TempDir()
	h, err := Jalankan(context.Background(), opsiContoh(t, NewCakram(akar), &pendumpPalsu{}))
	if err != nil {
		t.Fatalf("Jalankan: %v", err)
	}

	perBasis := map[string]Objek{}
	for _, o := range h.Manifest.Objek {
		if o.Jenis == JenisBasis {
			perBasis[o.Basis] = o
		}
	}
	for _, mau := range []string{"sai_control", "sai_platform", "sai_pt_satu", "sai_pt_dua"} {
		o, ada := perBasis[mau]
		if !ada {
			t.Fatalf("%s tidak punya objek dumpnya sendiri", mau)
		}
		if o.Bytes <= 0 || o.SHA256 == "" {
			t.Errorf("%s: bytes=%d sha=%q", mau, o.Bytes, o.SHA256)
		}
		berkas := filepath.Join(akar, h.Manifest.Putaran, o.Kunci)
		if _, err := os.Stat(berkas); err != nil {
			t.Errorf("objek %s tidak ada di tujuan: %v", o.Kunci, err)
		}
	}

	// Peran & hak akses WAJIB ada: tanpanya pemasangan yang dipulihkan berisi
	// data lengkap yang tidak bisa dimasuki siapa pun.
	var adaGlobals, adaBerkas bool
	for _, o := range h.Manifest.Objek {
		switch o.Jenis {
		case JenisGlobals:
			adaGlobals = true
		case JenisBerkas:
			adaBerkas = true
		case JenisBasis:
		}
	}
	if !adaGlobals {
		t.Error("tidak ada objek globals")
	}
	if !adaBerkas {
		t.Error("tidak ada objek berkas (documents/audit)")
	}
}

func TestManifestMenJAWABPulihkanPTIniSaja(t *testing.T) {
	h, err := Jalankan(context.Background(), opsiContoh(t, NewCakram(t.TempDir()), &pendumpPalsu{}))
	if err != nil {
		t.Fatalf("Jalankan: %v", err)
	}
	o := h.Manifest.BasisPerusahaan(2)
	if o == nil {
		t.Fatal("manifest tidak bisa menunjuk objek milik perusahaan 2")
	}
	if o.Basis != "sai_pt_dua" {
		t.Errorf("objek perusahaan 2 = %q", o.Basis)
	}
	if h.Manifest.BasisPerusahaan(99) != nil {
		t.Error("perusahaan yang tidak ada malah dapat objek")
	}
	if h.Manifest.PerusahaanTerdaftar != 2 {
		t.Errorf("perusahaanTerdaftar = %d, mau 2", h.Manifest.PerusahaanTerdaftar)
	}
}

func TestManifestDITULISSEBAGAIOBJEKDanBisaDibacaTanpaKunci(t *testing.T) {
	/* Pada hari pemulihan, basis data kendali bisa PERSIS yang hilang — dan
	   baris riwayat yang menjelaskan di mana dump setiap PT berada hilang
	   bersamanya. */
	akar := t.TempDir()
	h, err := Jalankan(context.Background(), opsiContoh(t, NewCakram(akar), &pendumpPalsu{}))
	if err != nil {
		t.Fatalf("Jalankan: %v", err)
	}
	b, err := os.ReadFile(filepath.Join(akar, h.Manifest.Putaran, NamaManifest)) //nolint:gosec // t.TempDir()
	if err != nil {
		t.Fatalf("manifest tidak ada di tujuan: %v", err)
	}
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("manifest bukan JSON yang sah: %v", err)
	}
	if len(m.Objek) != len(h.Manifest.Objek) {
		t.Errorf("manifest tersimpan memuat %d objek, hasilnya %d", len(m.Objek), len(h.Manifest.Objek))
	}
	// Prosedur pemulihannya disebut APA ADANYA, supaya tidak perlu ditebak dari
	// nama berkas.
	if !strings.Contains(m.Enkripsi, "aes-256-cbc") || !strings.Contains(m.Enkripsi, "200000") {
		t.Errorf("manifest tidak menyebut format enkripsinya: %q", m.Enkripsi)
	}
	// Dan ia TIDAK memuat isi buku maupun sandinya.
	if strings.Contains(string(b), sandiUji) {
		t.Error("manifest memuat kunci enkripsi")
	}
}

func TestBasisDataTerdaftarYangHILANGMenggagalkanPutaran(t *testing.T) {
	/* Bukan peringatan: cadangan yang kehilangan satu PT adalah cadangan yang
	   GAGAL untuk customer itu, dan putaran yang melaporkan `ok` atas keadaan
	   itu adalah tepat bentuk kegagalan yang §6 menyuruh dibuktikan hilang. */
	akar := t.TempDir()
	o := opsiContoh(t, NewCakram(akar), &pendumpPalsu{})
	o.Cacah.Hilang = []string{"sai_pt_tiga"}
	_, err := Jalankan(context.Background(), o)
	if err == nil {
		t.Fatal("putaran dengan basis data terdaftar yang hilang malah berhasil")
	}
	if !strings.Contains(err.Error(), "sai_pt_tiga") {
		t.Errorf("pesan galat tidak menyebut yang hilang: %v", err)
	}
	// Dan ia berhenti SEBELUM satu objek pun dikirim.
	entri, _ := os.ReadDir(akar)
	if len(entri) != 0 {
		t.Errorf("tujuan tidak kosong: %v", entri)
	}
}

func TestKlienLebihTuaDaripadaServerMenggagalkanPutaran(t *testing.T) {
	/* Bentuknya sudah terukur sekali di repo ini, dan ia terjadi pada cadangan
	   PERTAMA sesudah server dinaikkan — waktu terburuk yang mungkin. */
	o := opsiContoh(t, NewCakram(t.TempDir()), &pendumpPalsu{})
	o.VersiKlien = 15
	o.VersiServer = 17
	_, err := Jalankan(context.Background(), o)
	if err == nil {
		t.Fatal("klien 15 terhadap server 17 malah diterima")
	}
	if !strings.Contains(err.Error(), "server version mismatch") {
		t.Errorf("pesan galat tidak menyebut bentuk kegagalannya: %v", err)
	}
}

func TestSandiKosongMenggagalkanSebelumDumpPertama(t *testing.T) {
	pd := &pendumpPalsu{}
	o := opsiContoh(t, NewCakram(t.TempDir()), pd)
	o.Kunci = ""
	if _, err := Jalankan(context.Background(), o); err == nil {
		t.Fatal("sandi kosong diterima")
	}
	if len(pd.dipanggil) != 0 {
		t.Errorf("dump sudah dijalankan padahal sandinya kosong: %v", pd.dipanggil)
	}
}

func TestSatuDumpYangGagalMenGAGALKANPutaran(t *testing.T) {
	/* Putaran yang melanjutkan setelah satu basis data gagal akan mengirim
	   manifest yang terlihat lengkap tanpa objek itu. Manifest yang ada berarti
	   putarannya LENGKAP — itu janji yang tidak boleh bisa dilanggar. */
	akar := t.TempDir()
	o := opsiContoh(t, NewCakram(akar), &pendumpPalsu{gagalPada: "sai_pt_satu"})
	_, err := Jalankan(context.Background(), o)
	if err == nil {
		t.Fatal("putaran dengan satu dump gagal malah berhasil")
	}
	// Manifest TIDAK boleh ada — ia ditulis paling akhir, dan itulah gunanya.
	putaran := NamaPutaran("sai", o.Saat)
	if _, err := os.Stat(filepath.Join(akar, putaran, NamaManifest)); err == nil {
		t.Error("manifest terkirim padahal putarannya gagal")
	}
}

func TestBerkasMentahTidakDitinggalkanDiDirektoriKerja(t *testing.T) {
	/* Berkas mentah adalah plaintext seluruh pembukuan. Ia dibuang segera
	   setelah disandikan, dan direktori kerjanya dibersihkan di akhir putaran. */
	o := opsiContoh(t, NewCakram(t.TempDir()), &pendumpPalsu{})
	if _, err := Jalankan(context.Background(), o); err != nil {
		t.Fatalf("Jalankan: %v", err)
	}
	var tertinggal []string
	_ = filepath.Walk(o.DirKerja, func(j string, info os.FileInfo, err error) error {
		if err == nil && info != nil && !info.IsDir() {
			tertinggal = append(tertinggal, j)
		}
		return nil
	})
	if len(tertinggal) > 0 {
		t.Errorf("berkas tertinggal di direktori kerja: %v", tertinggal)
	}
}

func TestStatusMembedakanLuarMesinDariCakramYangSama(t *testing.T) {
	/* `ok` berarti ada salinan DI LUAR mesin ini. Satu kata ini yang menentukan
	   apakah permukaan kesehatan berkata benar. */
	h, err := Jalankan(context.Background(), opsiContoh(t, NewCakram(t.TempDir()), &pendumpPalsu{}))
	if err != nil {
		t.Fatalf("Jalankan: %v", err)
	}
	if h.Status != "local" {
		t.Errorf("tujuan cakram menghasilkan status %q, mau \"local\"", h.Status)
	}
}

func TestKemajuanDilaporkanSampaiSeratus(t *testing.T) {
	var persen []int
	o := opsiContoh(t, NewCakram(t.TempDir()), &pendumpPalsu{})
	o.Kemajuan = func(p int) error { persen = append(persen, p); return nil }
	if _, err := Jalankan(context.Background(), o); err != nil {
		t.Fatalf("Jalankan: %v", err)
	}
	if len(persen) == 0 {
		t.Fatal("kemajuan tidak pernah dilaporkan")
	}
	if akhir := persen[len(persen)-1]; akhir != 100 {
		t.Errorf("kemajuan berakhir di %d%%, mau 100%%", akhir)
	}
	if !sort.IntsAreSorted(persen) {
		t.Errorf("kemajuan tidak monoton: %v", persen)
	}
}
