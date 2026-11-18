import type { Db } from '../db/pool.js';
import { pool } from '../db/pool.js';

export interface Actor {
  id: number | null;
  username: string;
  role?: string;
  ip?: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, username: 'sistema' };

export async function audit(
  actor: Actor,
  action: string,
  entity: string | null,
  entityId: string | number | null,
  details: unknown = null,
  db: Db = pool,
): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (user_id, username, action, entity, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actor.id, actor.username, action, entity, entityId === null ? null : String(entityId), details === null ? null : JSON.stringify(details), actor.ip ?? null],
  );
}
