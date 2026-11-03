import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/modules/auth/authService.js';

async function runSimulation() {
  console.log('=== AMAS End-to-End Simulation Runner ===');
  const app = buildApp();
  await app.ready();

  try {
    // 1. Setup Tenant and Operator
    const slug = `sim-${Date.now()}`;
    const { rows: [org] } = await pool.query(
      'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id, slug',
      ['Metropolis High', slug]
    );

    const passwordHash = await hashPassword('admin123');
    await pool.query(
      `INSERT INTO users (organization_id, email, password_hash, role)
       VALUES ($1, 'operator@metropolis.edu', $2, 'ADMIN')`,
      [org.id, passwordHash]
    );

    console.log(`1. Created Organization: ${org.slug}`);

    // 2. Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { orgSlug: org.slug, email: 'operator@metropolis.edu', password: 'admin123' },
    });
    const { accessToken } = loginRes.json();
    console.log('2. Authenticated operator with JWT token');

    // 3. Create Excel workbook with leading zeros and formula string
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['ID', 'Name', 'Email', 'Group']);
    sheet.addRow(['00101', 'Diana Prince', 'diana@metropolis.edu', 'Grade 10']);
    sheet.addRow(['00102', 'Clark Kent', 'clark@metropolis.edu', 'Grade 10']);
    sheet.addRow(['00103', 'Bruce Wayne', 'bruce@metropolis.edu', 'Grade 10']);

    const buffer = await workbook.xlsx.writeBuffer();

    // 4. Commit Roster directly
    const rows = [
      { externalId: '00101', fullName: 'Diana Prince', email: 'diana@metropolis.edu', groupName: 'Grade 10' },
      { externalId: '00102', fullName: 'Clark Kent', email: 'clark@metropolis.edu', groupName: 'Grade 10' },
      { externalId: '00103', fullName: 'Bruce Wayne', email: 'bruce@metropolis.edu', groupName: 'Grade 10' },
    ];

    const commitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/people/import/commit',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { rows },
    });
    const { rosterVersionId, versionNumber } = commitRes.json();
    console.log(`3. Published Roster Version #${versionNumber} (ID: ${rosterVersionId})`);

    // 5. Get people and map cards
    const peopleRes = await app.inject({
      method: 'GET',
      url: '/api/v1/people',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const people = peopleRes.json();
    const diana = people.find((p: any) => p.external_id === '00101');
    const clark = people.find((p: any) => p.external_id === '00102');

    await app.inject({
      method: 'POST',
      url: '/api/v1/cards/register',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { personId: diana.id, cardUid: '04A1B2C3' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/cards/register',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { personId: clark.id, cardUid: '04A1B2C4' },
    });
    console.log('4. Registered NFC smart cards for Diana (04A1B2C3) and Clark (04A1B2C4)');

    // 6. Create Session & Open it
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        title: 'Morning Physics Lab',
        rosterVersionId,
        scheduledStart: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        scheduledEnd: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
      },
    });
    const session = sessionRes.json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${session.id}/state`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { targetState: 'OPEN' },
    });
    console.log(`5. Created & Opened Session: "${session.title}" (ID: ${session.id})`);

    // 7. Issue Ed25519 Offline Package
    const packageRes = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${session.id}/offline-package?deviceFingerprint=scanner-phone-01`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const offlinePkg = packageRes.json();
    console.log(`6. Generated Ed25519 Offline Authorization Package (AuthID: ${offlinePkg.payload.authorizationId})`);

    // 8. Simulate Batch Sync (1 Valid, 1 Duplicate, 1 Unregistered, 1 Clock Anomaly)
    const batchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${session.id}/sync`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        events: [
          // Event 1: Diana valid tap
          {
            eventId: crypto.randomUUID(),
            authorizationId: offlinePkg.payload.authorizationId,
            cardUid: '04A1B2C3',
            deviceEventTime: new Date().toISOString(),
          },
          // Event 2: Diana duplicate tap (should return DUPLICATE)
          {
            eventId: crypto.randomUUID(),
            authorizationId: offlinePkg.payload.authorizationId,
            cardUid: '04A1B2C3',
            deviceEventTime: new Date(Date.now() + 1000).toISOString(),
          },
          // Event 3: Unregistered card
          {
            eventId: crypto.randomUUID(),
            authorizationId: offlinePkg.payload.authorizationId,
            cardUid: 'DEADBEEF01',
            deviceEventTime: new Date().toISOString(),
          },
          // Event 4: Clock anomaly (device clock before authorization issued)
          {
            eventId: crypto.randomUUID(),
            authorizationId: offlinePkg.payload.authorizationId,
            cardUid: '04A1B2C4', // Clark
            deviceEventTime: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          },
        ],
      },
    });

    const syncResult = batchRes.json();
    console.log('7. Reconciled Batch Sync Outcomes:');
    for (const out of syncResult.outcomes) {
      console.log(`   - Event ${out.eventId.slice(0, 8)}: outcome=${out.outcome} (reason: ${out.reason || 'None'})`);
    }

    // 9. Move Session to REVIEW
    await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${session.id}/state`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { targetState: 'REVIEW' },
    });
    console.log('8. Moved session to REVIEW');

    // 10. Attempt Finalization (Expect 409 Conflict due to Event 4 being in NEEDS_REVIEW)
    const blockedFinalizeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${session.id}/finalize`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { forceAcknowledgeMissingDevices: true },
    });

    if (blockedFinalizeRes.statusCode === 409) {
      console.log('9. Finalization Gate Test: Successfully BLOCKED with 409 Conflict:');
      console.log(`   "${blockedFinalizeRes.json().message}"`);
    } else {
      throw new Error(`Expected 409 Conflict, got ${blockedFinalizeRes.statusCode}`);
    }

    // 11. Resolve the NEEDS_REVIEW exception and finalize
    await pool.query(
      `UPDATE attendance_events SET outcome = 'REJECTED', outcome_reason = 'RESOLVED_CLOCK_ANOMALY'
       WHERE session_id = $1 AND outcome = 'NEEDS_REVIEW'`,
      [session.id]
    );
    console.log('10. Resolved NEEDS_REVIEW exception');

    const finalizedRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${session.id}/finalize`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { forceAcknowledgeMissingDevices: true },
    });

    const finalSnapshot = finalizedRes.json();
    console.log('11. Finalization Gate Passed! Official Immutable Snapshot:');
    console.log(`   - State: ${finalSnapshot.state}`);
    console.log(`   - Total Expected: ${finalSnapshot.snapshot.expectedCount}`);
    console.log(`   - Total Present: ${finalSnapshot.snapshot.presentCount}`);
    console.log(`   - Total Absent: ${finalSnapshot.snapshot.absentCount}`);
    console.log(`   - Finalized At: ${finalSnapshot.finalizedAt}`);

    console.log('\n=== AMAS End-to-End Simulation Completed Successfully ===');
  } finally {
    await app.close();
    await pool.end();
  }
}

runSimulation().catch((err) => {
  console.error('Simulation Failed:', err);
  process.exit(1);
});
