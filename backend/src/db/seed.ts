import crypto from 'node:crypto';
import { pool } from './pool.js';
import { hashPassword } from '../modules/auth/authService.js';
import { commitRosterImport } from '../modules/people/rosterService.js';
import { registerCard } from '../modules/cards/cardService.js';
import { createSession, transitionSessionState } from '../modules/sessions/sessionService.js';

async function seed() {
  console.log('Seeding demo data for AMAS dashboard testing...');

  const client = await pool.connect();
  try {
    // 1. Create or ensure demo organization
    const { rows: orgRows } = await client.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Greenwood High School', 'demo-org')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, slug`
    );
    const org = orgRows[0];
    console.log(`- Organization: ${org.name} (slug: ${org.slug})`);

    // 2. Create Admin and Operator users with Argon2id hash
    const adminPassHash = await hashPassword('admin123');
    const opPassHash = await hashPassword('operator123');

    const { rows: adminRows } = await client.query(
      `INSERT INTO users (organization_id, email, password_hash, role)
       VALUES ($1, 'admin@demo.com', $2, 'ADMIN')
       ON CONFLICT (organization_id, email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id, email, role`,
      [org.id, adminPassHash]
    );
    const adminUser = adminRows[0];
    console.log(`- User: ${adminUser.email} (password: admin123, role: ${adminUser.role})`);

    await client.query(
      `INSERT INTO users (organization_id, email, password_hash, role)
       VALUES ($1, 'operator@demo.com', $2, 'OPERATOR')
       ON CONFLICT (organization_id, email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [org.id, opPassHash]
    );
    console.log(`- User: operator@demo.com (password: operator123, role: OPERATOR)`);

    // 3. Preload a demo roster preserving leading zeros
    const demoPeople = [
      { externalId: '00101', fullName: 'Jane Doe', email: 'jane.doe@greenwood.edu', groupName: 'Class 10-A' },
      { externalId: '00102', fullName: 'John Smith', email: 'john.smith@greenwood.edu', groupName: 'Class 10-A' },
      { externalId: '00103', fullName: 'Alice Wonder', email: 'alice.w@greenwood.edu', groupName: 'Class 10-B' },
      { externalId: '00104', fullName: 'Clark Kent', email: 'clark.k@greenwood.edu', groupName: 'Class 10-B' },
      { externalId: '00105', fullName: 'Diana Prince', email: 'diana.p@greenwood.edu', groupName: 'Class 10-B' },
    ];

    const rosterResult = await commitRosterImport(org.id, adminUser.id, demoPeople);
    console.log(`- Published Roster Version #${rosterResult.versionNumber} with ${rosterResult.totalMembers} members`);

    // 4. Map Smart NFC Cards
    const { rows: people } = await client.query(
      'SELECT id, external_id, full_name FROM people WHERE organization_id = $1',
      [org.id]
    );

    const jane = people.find((p) => p.external_id === '00101');
    const john = people.find((p) => p.external_id === '00102');
    const alice = people.find((p) => p.external_id === '00103');

    if (jane) {
      await registerCard(org.id, jane.id, '04A1B2C3', adminUser.id);
      console.log(`- Card 04A1B2C3 mapped to ${jane.full_name} (${jane.external_id})`);
    }
    if (john) {
      await registerCard(org.id, john.id, '04A1B2C4', adminUser.id);
      console.log(`- Card 04A1B2C4 mapped to ${john.full_name} (${john.external_id})`);
    }
    if (alice) {
      await registerCard(org.id, alice.id, '04A1B2C5', adminUser.id);
      console.log(`- Card 04A1B2C5 mapped to ${alice.full_name} (${alice.external_id})`);
    }

    // 5. Create an active OPEN session
    const now = new Date();
    const end = new Date(now.getTime() + 4 * 3600 * 1000); // 4 hours window
    const session = await createSession(
      org.id,
      'Morning General Assembly & Roll Call',
      rosterResult.rosterVersionId,
      now.toISOString(),
      end.toISOString()
    );

    await transitionSessionState(session.id, org.id, 'OPEN', adminUser.id);
    console.log(`- Created & Opened Session: "${session.title}" (ID: ${session.id})`);

    console.log('\nSeed completed successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
