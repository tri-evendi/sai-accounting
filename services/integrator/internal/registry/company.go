// Package registry membaca daftar perusahaan di basis data KENDALI.
//
// Padanan `dalamKonteksPerusahaan` di `workers/jalur-perusahaan.ts`: dari
// `jobs.company_id` ke nama basis data buku PT-nya. Hanya MEMBACA.
//
// ══ KONTEKS YANG HILANG MELEMPAR (#104) ════════════════════════════════════
// Pekerjaan tanpa `company_id`, atau dengan id yang tidak ada di registry,
// MELEMPAR — tidak pernah jatuh ke basis data bawaan. Jatuh ke bawaan berarti
// berkas PT A dihitung dari buku PT B tanpa galat dan tanpa jejak.
package registry

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Company adalah satu baris `companies` yang dibutuhkan pelari.
type Company struct {
	ID           int32
	Slug         string
	Name         string
	DatabaseName string
	IsActive     bool
	// InstanceURLEnvVar: nama env var `db_instances.url_env_var` tempat
	// bukunya hidup; kosong = instans bawaan (tahap 4).
	InstanceURLEnvVar string
}

// ErrNoCompany: pekerjaan tanpa konteks perusahaan yang sah.
var ErrNoCompany = errors.New(
	"pekerjaan tanpa `company_id` yang sah — ia tidak bisa tahu buku mana. " +
		"Konteks perusahaan yang hilang MELEMPAR (#104)")

// Lookup membaca satu perusahaan menurut id-nya.
func Lookup(ctx context.Context, pool *pgxpool.Pool, id *int32) (*Company, error) {
	if id == nil || *id <= 0 {
		return nil, ErrNoCompany
	}
	var c Company
	var instanceKey, urlEnvVar *string
	err := pool.QueryRow(ctx,
		`SELECT c.id, c.slug, c.name, c.database_name, c.is_active, c.db_instance_key, i.url_env_var
		   FROM companies c
		   LEFT JOIN db_instances i ON i.key = c.db_instance_key
		  WHERE c.id = $1`, *id,
	).Scan(&c.ID, &c.Slug, &c.Name, &c.DatabaseName, &c.IsActive, &instanceKey, &urlEnvVar)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf(
			"perusahaan #%d tidak ada di registry kendali — pekerjaan ini TIDAK "+
				"dijalankan, dan tidak pernah jatuh ke basis data bawaan (#104)", *id)
	}
	if err != nil {
		return nil, fmt.Errorf("baca registry perusahaan #%d: %w", *id, err)
	}
	if instanceKey != nil {
		// Kunci instans tanpa baris `db_instances` (FK menolaknya, tapi kode
		// tidak bersandar pada itu): melempar, bukan membaca server bawaan.
		if urlEnvVar == nil || *urlEnvVar == "" {
			return nil, fmt.Errorf(
				"perusahaan #%d menunjuk instans %q yang tidak terdaftar di db_instances", *id, *instanceKey)
		}
		c.InstanceURLEnvVar = *urlEnvVar
	}
	return &c, nil
}
