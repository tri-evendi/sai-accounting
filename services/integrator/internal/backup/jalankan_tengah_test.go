// PENJAGA instans yang gagal DI TENGAH putaran (tahap 4).
//
// Instans yang tidak bisa dicacah sudah gagal sendiri sejak pencacahan. Yang
// dijaga di sini bentuk yang lebih licin: instans yang tercacah, lalu dump-nya
// gagal — servernya mati di tengah jalan, atau perannya bisa membaca buku
// tetapi tidak `pg_authid`. Sebelum ini satu galat begitu menghentikan SELURUH
// putaran, termasuk instans bawaan, tanpa manifest.
package backup

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func cacahTigaInstans(db2, db3 Pendump) *Cacah {
	return &Cacah{
		Basis: []Basis{
			{Nama: "sai_control", Peran: PeranKendali},
			{Nama: "sai_pt_satu", Peran: PeranPerusahaan, CompanyID: idDari(1)},
			{Nama: "sai_pt_dua", Peran: PeranPerusahaan, CompanyID: idDari(2), Instans: "db2"},
			{Nama: "sai_pt_empat", Peran: PeranPerusahaan, CompanyID: idDari(4), Instans: "db2"},
			{Nama: "sai_pt_tiga", Peran: PeranPerusahaan, CompanyID: idDari(3), Instans: "db3"},
		},
		Instans: []InstansTercacah{
			{Kunci: "db2", VersiServer: 17, Pendump: db2},
			{Kunci: "db3", VersiServer: 17, Pendump: db3},
		},
	}
}

func bacaManifest(t *testing.T, akar, putaran string) Manifest {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(akar, putaran, NamaManifest)) //nolint:gosec // t.TempDir()
	if err != nil {
		t.Fatalf("manifest tidak ditulis: %v", err)
	}
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func kunciObjek(m Manifest) map[string]bool {
	out := map[string]bool{}
	for _, o := range m.Objek {
		out[o.Kunci] = true
	}
	return out
}

func TestDumpInstansYangGAGALDiTengahTidakMenghentikanInstansLain(t *testing.T) {
	akar := t.TempDir()
	lama := NamaPutaran("sai", contohSaat().AddDate(0, 0, -90))
	if err := os.MkdirAll(filepath.Join(akar, lama), 0o700); err != nil {
		t.Fatal(err)
	}
	bawaan := &pendumpPalsu{}
	db2 := &pendumpPalsu{gagalPada: "sai_pt_dua"}
	db3 := &pendumpPalsu{}
	o := opsiContoh(t, NewCakram(akar), bawaan)
	o.Cacah = cacahTigaInstans(db2, db3)
	var persen []int
	o.Kemajuan = func(p int) error { persen = append(persen, p); return nil }

	h, err := Jalankan(context.Background(), o)

	var gi *GalatInstans
	if !errors.As(err, &gi) || len(gi.Gagal) != 1 || gi.Gagal[0].Kunci != "db2" {
		t.Fatalf("galat = %v, mau *GalatInstans untuk db2 saja", err)
	}
	if h == nil || h.Status != "error" {
		t.Fatalf("hasil = %+v, mau status error", h)
	}
	// db2 berhenti pada galat pertamanya: sisa buku & globals-nya dilewati.
	if !reflect.DeepEqual(db2.dipanggil, []string{"sai_pt_dua"}) {
		t.Errorf("pendump db2 dipanggil untuk %v", db2.dipanggil)
	}
	// Instans bawaan dan db3 TETAP lengkap.
	if !reflect.DeepEqual(db3.dipanggil, []string{"sai_pt_tiga", "(globals)"}) {
		t.Errorf("pendump db3 dipanggil untuk %v", db3.dipanggil)
	}
	m := bacaManifest(t, akar, h.Manifest.Putaran)
	ada := kunciObjek(m)
	for _, k := range []string{
		"db-sai_control.dump.enc", "db-sai_pt_satu.dump.enc", "globals.sql.enc",
		"instans/db3/db-sai_pt_tiga.dump.enc", "instans/db3/globals.sql.enc", "berkas.tar.gz.enc",
	} {
		if !ada[k] {
			t.Errorf("objek %s hilang dari manifest", k)
		}
	}
	for k := range ada {
		if strings.HasPrefix(k, "instans/db2/") {
			t.Errorf("objek db2 %s disebut padahal dump-nya gagal", k)
		}
	}
	if !reflect.DeepEqual(m.Instans, []InfoInstans{{Kunci: "db3", VersiServer: 17}}) {
		t.Errorf("manifest.instans = %+v", m.Instans)
	}
	if len(m.InstansGagal) != 1 || m.InstansGagal[0].Kunci != "db2" ||
		!reflect.DeepEqual(m.InstansGagal[0].Basis, []string{"sai_pt_dua", "sai_pt_empat"}) ||
		!strings.Contains(m.InstansGagal[0].Sebab, "disengaja") {
		t.Errorf("manifest.instansGagal = %+v", m.InstansGagal)
	}
	// Tidak bertambah dua kali: PT db2 sudah terhitung sebelum gagal.
	if m.PerusahaanTerdaftar != 4 {
		t.Errorf("perusahaanTerdaftar = %d, mau 4", m.PerusahaanTerdaftar)
	}
	if len(persen) == 0 || persen[len(persen)-1] != 100 {
		t.Errorf("kemajuan berhenti di %v", persen)
	}
	if _, err := os.Stat(filepath.Join(akar, lama)); err != nil {
		t.Error("putaran lama DIPANGKAS oleh putaran sebagian")
	}
}

func TestGlobalsInstansYangDITOLAKMenandaiInstansItuSaja(t *testing.T) {
	// Bentuk yang terukur: peran pemilik NOSUPERUSER mendump bukunya, lalu
	// `pg_dumpall --globals-only` ditolak `pg_authid`.
	akar := t.TempDir()
	bawaan, db2, db3 := &pendumpPalsu{}, &pendumpPalsu{gagalGlobals: true}, &pendumpPalsu{}
	o := opsiContoh(t, NewCakram(akar), bawaan)
	o.Cacah = cacahTigaInstans(db2, db3)

	h, err := Jalankan(context.Background(), o)
	var gi *GalatInstans
	if !errors.As(err, &gi) || len(gi.Gagal) != 1 || gi.Gagal[0].Kunci != "db2" ||
		!strings.Contains(gi.Gagal[0].Sebab, "pg_authid") {
		t.Fatalf("galat = %v", err)
	}
	m := bacaManifest(t, akar, h.Manifest.Putaran)
	ada := kunciObjek(m)
	// Buku db2 yang sudah terkirim tetap disebut — mereka ada dan utuh.
	if !ada["instans/db2/db-sai_pt_dua.dump.enc"] || ada["instans/db2/globals.sql.enc"] {
		t.Errorf("objek = %v", ada)
	}
	if !ada["instans/db3/globals.sql.enc"] || !ada["globals.sql.enc"] {
		t.Errorf("globals instans lain hilang: %v", ada)
	}
	if len(m.Instans) != 1 || m.Instans[0].Kunci != "db3" {
		t.Errorf("manifest.instans = %+v", m.Instans)
	}
}

func TestDumpInstansBAWAANYangGagalTetapMenghentikanPutaran(t *testing.T) {
	// Perilaku sebelum tahap 4, apa adanya: tidak ada "putaran sebagian"
	// untuk server bawaan — ia memegang basis data kendali.
	bawaan := &pendumpPalsu{gagalPada: "sai_pt_satu"}
	o := opsiContoh(t, NewCakram(t.TempDir()), bawaan)
	o.Cacah = cacahTigaInstans(&pendumpPalsu{}, &pendumpPalsu{})
	h, err := Jalankan(context.Background(), o)
	var gi *GalatInstans
	if err == nil || errors.As(err, &gi) || h != nil {
		t.Fatalf("galat = %v / hasil %+v, mau galat putaran penuh", err, h)
	}
}

// tujuanGagalPada menolak menyimpan kunci yang memuat potongan tertentu.
type tujuanGagalPada struct {
	Tujuan
	potongan string
}

func (t tujuanGagalPada) Simpan(ctx context.Context, kunci string, r io.Reader) error {
	if strings.Contains(kunci, t.potongan) {
		return errors.New("S3: 503 SlowDown (disengaja)")
	}
	return t.Tujuan.Simpan(ctx, kunci, r)
}

func TestGagalTUJUANPadaObjekInstansTetapMenghentikanPutaran(t *testing.T) {
	// Tujuan bukan milik satu instans: S3 yang menolak satu objek akan
	// menolak yang berikutnya juga, dan "putaran sebagian" atas keadaan itu
	// menyembunyikan sebabnya.
	tujuan := tujuanGagalPada{Tujuan: NewCakram(t.TempDir()), potongan: "instans/db3/"}
	o := opsiContoh(t, tujuan, &pendumpPalsu{})
	o.Cacah = cacahTigaInstans(&pendumpPalsu{}, &pendumpPalsu{})
	h, err := Jalankan(context.Background(), o)
	var gi *GalatInstans
	if err == nil || errors.As(err, &gi) || h != nil {
		t.Fatalf("galat = %v / hasil %+v, mau galat putaran penuh", err, h)
	}
	if !strings.Contains(err.Error(), "SlowDown") {
		t.Errorf("sebab hilang: %v", err)
	}
}

func TestPembatalanDiTengahInstansTidakMenjadiPutaranSebagian(t *testing.T) {
	// SIGTERM di tengah dump instans tambahan menghentikan putaran — bukan
	// menandai instans itu gagal lalu berlanjut ke instans berikutnya.
	ctx, batal := context.WithCancel(context.Background())
	db2 := &pendumpBatal{batal: batal}
	o := opsiContoh(t, NewCakram(t.TempDir()), &pendumpPalsu{})
	o.Cacah = cacahTigaInstans(db2, &pendumpPalsu{})
	h, err := Jalankan(ctx, o)
	var gi *GalatInstans
	if err == nil || errors.As(err, &gi) || h != nil {
		t.Fatalf("galat = %v / hasil %+v, mau galat putaran penuh", err, h)
	}
}

// pendumpBatal membatalkan konteks putaran lalu gagal — seperti `pg_dump`
// yang dibunuh `exec.CommandContext` saat SIGTERM.
type pendumpBatal struct{ batal context.CancelFunc }

func (p *pendumpBatal) DumpBasis(_ context.Context, _ string, _ io.Writer) error {
	p.batal()
	return errors.New("signal: killed")
}

func (p *pendumpBatal) DumpGlobals(_ context.Context, _ io.Writer) error {
	return errors.New("tidak boleh dipanggil")
}
