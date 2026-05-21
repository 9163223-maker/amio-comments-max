'use strict';

const db = require('../db/postgres');

const RUNTIME = 'CC8.0.0-CLEAN-CONTROLLED-BASE';

function clean(value) {
  return String(value || '').trim();
}

function buildTenantId(userId) {
  const normalized = clean(userId);
  if (!normalized) return '';
  return `tenant_${normalized}`.replace(/[^a-zA-Z0-9_:-]/g, '_');
}

async function ensureTenant({ ownerUserId, tenantId = '', name = '', settings = {} } = {}) {
  const owner = clean(ownerUserId);
  if (!owner) throw new Error('owner_user_id_required');
  const resolvedTenantId = clean(tenantId) || buildTenantId(owner);
  await db.query(
    `insert into ak_tenants(tenant_id, owner_user_id, name, settings_json, updated_at)
     values($1,$2,$3,$4::jsonb,now())
     on conflict(tenant_id) do update set
       owner_user_id = excluded.owner_user_id,
       name = coalesce(nullif(excluded.name,''), ak_tenants.name),
       settings_json = ak_tenants.settings_json || excluded.settings_json,
       updated_at = now()`,
    [resolvedTenantId, owner, clean(name), JSON.stringify(settings || {})]
  );
  return getTenant(resolvedTenantId);
}

async function getTenant(tenantId) {
  const id = clean(tenantId);
  if (!id) return null;
  const { rows } = await db.query(
    `select tenant_id as "tenantId",
            owner_user_id as "ownerUserId",
            name,
            status,
            settings_json as "settings",
            created_at as "createdAt",
            updated_at as "updatedAt"
       from ak_tenants
      where tenant_id=$1`,
    [id]
  );
  return rows[0] || null;
}

async function getTenantByOwner(ownerUserId) {
  const owner = clean(ownerUserId);
  if (!owner) return null;
  const { rows } = await db.query(
    `select tenant_id as "tenantId",
            owner_user_id as "ownerUserId",
            name,
            status,
            settings_json as "settings",
            created_at as "createdAt",
            updated_at as "updatedAt"
       from ak_tenants
      where owner_user_id=$1
      order by created_at asc
      limit 1`,
    [owner]
  );
  return rows[0] || null;
}

module.exports = {
  RUNTIME,
  buildTenantId,
  ensureTenant,
  getTenant,
  getTenantByOwner
};
