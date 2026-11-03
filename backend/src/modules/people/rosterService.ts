import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { pool } from '../../db/pool.js';

export interface ParsedPersonRow {
  externalId: string;
  fullName: string;
  email?: string;
  groupName?: string;
}

export interface RowValidationError {
  rowNumber: number;
  error: string;
}

export interface RosterPreviewResult {
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  previewRows: ParsedPersonRow[];
  errors: RowValidationError[];
}

export interface RosterCommitResult {
  rosterVersionId: string;
  versionNumber: number;
  totalMembers: number;
  digestSha256: string;
}

/**
 * Formula injection mitigation: escapes cells starting with =, +, -, @, Tab, CR
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Parses Excel workbook preserving leading zeros for external_id
 */
export async function parseRosterWorkbook(buffer: Buffer): Promise<{ rows: ParsedPersonRow[]; errors: RowValidationError[] }> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];

  const rows: ParsedPersonRow[] = [];
  const errors: RowValidationError[] = [];

  if (!worksheet) {
    errors.push({ rowNumber: 0, error: 'No worksheet found in workbook' });
    return { rows, errors };
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Header row

    const externalIdCell = row.getCell(1);
    // Explicitly preserve leading zeros by using text or direct string coercion
    const externalId = externalIdCell.text
      ? externalIdCell.text.trim()
      : String(externalIdCell.value ?? '').trim();

    const fullNameCell = row.getCell(2);
    const fullName = String(fullNameCell.value ?? '').trim();

    const emailCell = row.getCell(3);
    const email = emailCell.value ? String(emailCell.value).trim() : undefined;

    const groupCell = row.getCell(4);
    const groupName = groupCell.value ? String(groupCell.value).trim() : undefined;

    if (!externalId) {
      errors.push({ rowNumber, error: 'Missing externalId' });
      return;
    }
    if (!fullName) {
      errors.push({ rowNumber, error: 'Missing fullName' });
      return;
    }

    rows.push({
      externalId,
      fullName,
      email,
      groupName,
    });
  });

  return { rows, errors };
}

export async function previewRosterImport(
  organizationId: string,
  buffer: Buffer
): Promise<RosterPreviewResult> {
  const { rows, errors } = await parseRosterWorkbook(buffer);

  // Check intra-file duplicate external IDs
  const seenIds = new Set<string>();
  let duplicateCount = 0;
  const validRows: ParsedPersonRow[] = [];

  for (const r of rows) {
    if (seenIds.has(r.externalId)) {
      duplicateCount++;
      errors.push({ rowNumber: 0, error: `Duplicate externalId '${r.externalId}' found within file` });
    } else {
      seenIds.add(r.externalId);
      validRows.push(r);
    }
  }

  return {
    totalRows: rows.length,
    validCount: validRows.length,
    duplicateCount,
    previewRows: validRows.slice(0, 10),
    errors,
  };
}

export async function commitRosterImport(
  organizationId: string,
  userId: string,
  rows: ParsedPersonRow[]
): Promise<RosterCommitResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get next version number
    const { rows: versionRows } = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM roster_versions
       WHERE organization_id = $1`,
      [organizationId]
    );
    const nextVersion = Number(versionRows[0].next_version);

    // 2. Compute SHA-256 digest of normalized rows
    const normalizedData = JSON.stringify(
      rows.map((r) => ({ id: r.externalId, name: r.fullName, email: r.email || '', group: r.groupName || '' }))
    );
    const digest = crypto.createHash('sha256').update(normalizedData).digest('hex');

    // 3. Insert roster_version
    const { rows: rvRows } = await client.query(
      `INSERT INTO roster_versions (organization_id, version_number, digest_sha256, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [organizationId, nextVersion, digest, userId]
    );
    const rosterVersionId = rvRows[0].id;

    // 4. Upsert people and record membership
    for (const r of rows) {
      const { rows: pRows } = await client.query(
        `INSERT INTO people (organization_id, external_id, full_name, email, group_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, external_id)
         DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, group_name = EXCLUDED.group_name
         RETURNING id`,
        [organizationId, r.externalId, r.fullName, r.email || null, r.groupName || null]
      );
      const personId = pRows[0].id;

      await client.query(
        `INSERT INTO roster_memberships (roster_version_id, person_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [rosterVersionId, personId]
      );
    }

    // 5. Audit event
    await client.query(
      `INSERT INTO audit_events (organization_id, actor_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'ROSTER_COMMITTED', 'ROSTER_VERSION', $3, $4)`,
      [organizationId, userId, rosterVersionId, JSON.stringify({ versionNumber: nextVersion, membersCount: rows.length })]
    );

    await client.query('COMMIT');

    return {
      rosterVersionId,
      versionNumber: nextVersion,
      totalMembers: rows.length,
      digestSha256: digest,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
