/**
 * Seed default admin user. Safe to run multiple times.
 * Env:
 *   ADMIN_USERNAME   default: admin
 *   ADMIN_PASSWORD   default: admin123
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(password, 10);

  const res = await query(
    `insert into users (username, password_hash, role)
     values ($1, $2, 'admin')
     on conflict (username) do update
       set password_hash = excluded.password_hash,
           role          = 'admin'
     returning id, username, role`,
    [username, hash],
  );
  console.log('seeded admin:', res.rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
