package backup

import (
	"context"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Peran sebuah basis data dalam pemasangan ini.
type Peran string

const (
	PeranKendali    Peran = "control"
	PeranPlatform   Peran = "platform"
	PeranPerusahaan Peran = "company"
	PeranLain       Peran = "other"
)

// Basis adalah satu basis data yang akan punya OBJEK DUMPNYA SENDIRI.
type Basis struct {
	Nama  string
	Peran Peran
	// CompanyID hanya terisi untuk PeranPerusahaan, dan itulah yang membuat
	// "pulihkan data PT ini saja" bisa dijawab tanpa menebak nama basis data.
	CompanyID *int32
}

// Cacah adalah hasil pencacahan: apa yang akan didump, dan apa yang HILANG.
type Cacah struct {
	Basis []Basis
	// Hilang adalah basis data yang TERDAFTAR di registry tapi tidak ada di
	// server. Ia bukan peringatan: cadangan yang kehilangan satu PT adalah
	// cadangan yang gagal untuk customer itu saja — dan itulah bentuk kegagalan
	// yang paling mudah tidak terlihat.
	Hilang []string
}

// ══ DUA SUMBER, DAN URUTANNYA MENENTUKAN ═══════════════════════════════════
//
// Yang DIDUMP datang dari `pg_database`, bukan dari registry. Daftar yang
// diturunkan dari registry akan melewatkan apa pun yang ada di server tapi
// tidak terdaftar — termasuk basis data yang sedang diadopsi, dan `sai_platform`
// yang memang tidak punya baris registry. Itu bentuk "hampir semua" yang sama
// yang membuat `--all-databases` dipilih di `scripts/backup.sh`.
//
// Yang DIPERIKSA datang dari registry. §6: setiap basis data terdaftar wajib
// punya objek dumpnya sendiri. Perbandingan dua arah inilah buktinya, dan tidak
// satu arah pun cukup sendiri.
//
// Integrator TIDAK membaca `PLATFORM_DATABASE_URL`, dan pencacahan lewat
// `pg_database` itulah yang membuatnya tidak perlu: bidang penagihan (#137)
// tetap dicadangkan tanpa integrator pernah memegang alamatnya.

// Daftar mencacah basis data yang akan dicadangkan.
func Daftar(ctx context.Context, kendali *pgxpool.Pool, namaKendali string) (*Cacah, error) {
	// `datallowconn = false` dikecualikan: `pg_dump` tidak bisa menyambung ke
	// sana sama sekali, jadi memasukkannya menjamin satu kegagalan per putaran.
	rows, err := kendali.Query(ctx, `
		SELECT datname FROM pg_database
		 WHERE datistemplate = false AND datallowconn = true
		 ORDER BY datname`)
	if err != nil {
		return nil, fmt.Errorf("cacah pg_database: %w", err)
	}
	defer rows.Close()

	adaDiServer := map[string]bool{}
	var namaServer []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, fmt.Errorf("baca datname: %w", err)
		}
		adaDiServer[n] = true
		namaServer = append(namaServer, n)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("cacah pg_database: %w", err)
	}

	// Registry: nama basis data setiap PT yang terdaftar (#104).
	reg, err := kendali.Query(ctx, `SELECT id, database_name FROM companies`)
	if err != nil {
		return nil, fmt.Errorf("baca registry perusahaan: %w", err)
	}
	defer reg.Close()

	perusahaan := map[string]int32{}
	for reg.Next() {
		var id int32
		var nama string
		if err := reg.Scan(&id, &nama); err != nil {
			return nil, fmt.Errorf("baca baris registry: %w", err)
		}
		perusahaan[nama] = id
	}
	if err := reg.Err(); err != nil {
		return nil, fmt.Errorf("baca registry perusahaan: %w", err)
	}

	c := &Cacah{}
	for _, nama := range namaServer {
		b := Basis{Nama: nama, Peran: perankan(nama, namaKendali, perusahaan)}
		if id, ada := perusahaan[nama]; ada {
			salinan := id
			b.CompanyID = &salinan
		}
		c.Basis = append(c.Basis, b)
	}

	for nama := range perusahaan {
		if !adaDiServer[nama] {
			c.Hilang = append(c.Hilang, nama)
		}
	}
	sort.Strings(c.Hilang)

	return c, nil
}

// perankan memberi label pada sebuah basis data.
//
// Labelnya untuk MANUSIA yang membaca manifest pada hari pemulihan — ia tidak
// mengubah apa pun yang didump. `other` sengaja ada dan sengaja TIDAK
// dikecualikan: basis data yang tidak kita kenali tetap dicadangkan, sebab
// daftar yang membuang "yang kelihatannya bukan milik kita" adalah daftar yang
// akan membuang basis data sebuah PT pada hari seseorang menamainya di luar
// pola.
func perankan(nama, namaKendali string, perusahaan map[string]int32) Peran {
	switch {
	case nama == namaKendali:
		return PeranKendali
	case nama == "sai_platform":
		return PeranPlatform
	default:
		if _, ada := perusahaan[nama]; ada {
			return PeranPerusahaan
		}
		return PeranLain
	}
}
