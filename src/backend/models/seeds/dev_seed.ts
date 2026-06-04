/**
 * Dev seed — creates `dev-clinic` tenant with one admin, one doctor, one staff user.
 * Run with: npx ts-node src/backend/models/seeds/dev_seed.ts
 */
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { config } from '../../config/env';

const pool = new Pool({ connectionString: config.databaseUrl });

const SALT_ROUNDS = 10;
const DEV_PASSWORD = 'Dev1234!';

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotent: skip if dev-clinic already exists
    const existing = await client.query(
      `SELECT id FROM tenants WHERE subdomain = 'dev-clinic'`
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log('dev-clinic already seeded — skipping.');
      await client.query('ROLLBACK');
      return;
    }

    const tenantResult = await client.query<{ id: number }>(
      `INSERT INTO tenants (name, subdomain) VALUES ($1, $2) RETURNING id`,
      ['Dev Clinic', 'dev-clinic']
    );
    const tenantId = tenantResult.rows[0].id;

    const hash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

    const seedUsers = [
      { name: 'Dev Admin',   email: 'admin@dev-clinic.local',  role: 'admin'  },
      { name: 'Dev Doctor',  email: 'doctor@dev-clinic.local', role: 'doctor' },
      { name: 'Dev Staff',   email: 'staff@dev-clinic.local',  role: 'staff'  },
    ];

    for (const u of seedUsers) {
      await client.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, u.name, u.email, hash, u.role]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded tenant id=${tenantId} with 3 users (password: ${DEV_PASSWORD})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
