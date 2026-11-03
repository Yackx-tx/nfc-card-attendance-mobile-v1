import { pool } from '../../db/pool.js';

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
}

export async function createOrganization(name: string, slug: string): Promise<OrganizationRow> {
  const { rows } = await pool.query(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     RETURNING id, name, slug, created_at`,
    [name, slug.toLowerCase()]
  );
  return rows[0];
}

export async function getOrganizationById(id: string): Promise<OrganizationRow | null> {
  const { rows } = await pool.query(
    'SELECT id, name, slug, created_at FROM organizations WHERE id = $1',
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function getOrganizationBySlug(slug: string): Promise<OrganizationRow | null> {
  const { rows } = await pool.query(
    'SELECT id, name, slug, created_at FROM organizations WHERE slug = $1',
    [slug.toLowerCase()]
  );
  return rows.length > 0 ? rows[0] : null;
}
