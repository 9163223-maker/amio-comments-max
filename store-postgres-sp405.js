'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const RUNTIME = 'SP40.5';
const SOURCE = 'adminkit-SP40.5-postgres-store-preload';
const TABLE = process.env.ADMINKIT_PG_TABLE || 'adminkit_store_kv';
const STORE_KEY = 'store';
const DATA_FILE = process.env.ADMINKIT_JSON_STORE_PATH || path.join(process.cwd(), 'data', 'store.json');
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.NF_ADMINKIT_POSTGRES_PROD_POSTGRES_URI || '';
const ENABLED = String(process.env.ADMINKIT_STORE_DRIVER || 'postgres').toLowerCase() === 'postgres' && !!DB_URL;
const AUTO_MIGRATE = String(process.env.ADMINKIT_AUTO_MIGRATE || '1') !== '0';
const JSON_FALLBACK = String(process.env.ADMINKIT_JSON_FALLBACK || '1') !== '0';
const state = global.__ADMINKIT_PG_STORE__ = global.__ADMINKIT_PG_STORE__ || {
  runtime: RUNTIME,
  sourceMarker: SOURCE,
  enabled: ENABLED,
  dbUrlPresent: !!DB_URL,
  table: TABLE,
  hydrateStatus: 'not_started',
  lastSyncStatus: 'not_started',
  lastError: null,
  migratedFromJson: false,
  hydrateAt: null,
  lastSyncAt: null,
  writes: 0,
  skippedWrites: 0
};
let Pool = null;
let pool = null;
let storeModule = null;
let hydrated = false;
let hydrating = false;
let syncing = false;
let syncTimer = null;
let suppressSync = false;
function log(msg){ try { console.log('[SP40.5 pg-store] ' + msg); } catch(_){} }
function clone(v){ try { return JSON.parse(JSON.stringify(v || {})); } catch { return {}; } }
function readJsonStore(){ try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '{}'); } catch(e){ state.lastError = 'read_json:' + e.message; } return null; }
function getPg(){ if(!ENABLED) return null; if(pool) return pool; try { Pool = require('pg').Pool; pool = new Pool({ connectionString: DB_URL, ssl: /sslmode=require|ssl=true/i.test(DB_URL) ? { rejectUnauthorized: false } : undefined }); return pool; } catch(e){ state.enabled=false; state.lastError='pg_require:' + e.message; log('pg unavailable: ' + e.message); return null; } }
async function ensureDb(){ const pg=getPg(); if(!pg) return false; if(!AUTO_MIGRATE) return true; await pg.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`); await pg.query(`CREATE TABLE IF NOT EXISTS adminkit_events (id BIGSERIAL PRIMARY KEY, event_type TEXT NOT NULL, tenant_id TEXT, channel_id TEXT, post_id TEXT, user_id TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`); return true; }
async function hydrate(){ if(hydrated||hydrating||!storeModule||!ENABLED) return; hydrating=true; state.hydrateStatus='running'; try { const pg=getPg(); if(!pg) throw new Error('pg_not_available'); await ensureDb(); const row=await pg.query(`SELECT data FROM ${TABLE} WHERE key=$1`, [STORE_KEY]); if(row.rows.length && row.rows[0].data && typeof row.rows[0].data==='object'){ suppressSync=true; try { if(typeof storeModule.saveStore==='function') storeModule.saveStore(row.rows[0].data); } finally { suppressSync=false; } state.hydrateStatus='loaded_from_postgres'; } else { const json = JSON_FALLBACK ? readJsonStore() : null; if(json && typeof json==='object' && Object.keys(json).length){ await pg.query(`INSERT INTO ${TABLE}(key,data,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [STORE_KEY, JSON.stringify(json)]); state.migratedFromJson=true; state.hydrateStatus='migrated_json_to_postgres'; } else { const empty = typeof storeModule.createEmptyStore==='function' ? storeModule.createEmptyStore() : {}; await pg.query(`INSERT INTO ${TABLE}(key,data,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO NOTHING`, [STORE_KEY, JSON.stringify(empty)]); state.hydrateStatus='created_empty_postgres_store'; } }
    hydrated=true; state.hydrateAt=new Date().toISOString(); log(state.hydrateStatus); } catch(e){ state.hydrateStatus='error'; state.lastError='hydrate:' + e.message; log('hydrate error: '+e.message); } finally { hydrating=false; } }
async function syncNow(){ if(syncing||suppressSync||!ENABLED) return; syncing=true; try { const pg=getPg(); if(!pg) throw new Error('pg_not_available'); await ensureDb(); const json=readJsonStore(); if(!json || typeof json!=='object'){ state.skippedWrites++; state.lastSyncStatus='skipped_no_json'; return; } await pg.query(`INSERT INTO ${TABLE}(key,data,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [STORE_KEY, JSON.stringify(json)]); state.writes++; state.lastSyncAt=new Date().toISOString(); state.lastSyncStatus='ok'; } catch(e){ state.lastSyncStatus='error'; state.lastError='sync:' + e.message; log('sync error: '+e.message); } finally { syncing=false; } }
function scheduleSync(){ if(suppressSync||!ENABLED) return; clearTimeout(syncTimer); syncTimer=setTimeout(syncNow, 150); }
function wrapStore(st){ if(!st||st.__ADMINKIT_PG_WRAPPED__) return st; Object.defineProperty(st, '__ADMINKIT_PG_WRAPPED__', { value:true, enumerable:false }); storeModule=st; setTimeout(hydrate, 10); const writeNames=['saveStore','savePost','savePostVersion','addComment','setComments','saveChannel','setSetupState','clearSetupState','setLikeState','setReactionState','saveChannelMemberSnapshot','saveGiftSettings','saveGiftCampaign','deleteGiftCampaign','recordGiftClaim','saveModerationSettings','logModerationAction','saveGrowthClick','savePollVote']; for(const name of writeNames){ const old=st[name]; if(typeof old==='function'){ st[name]=function(){ const result=old.apply(this, arguments); scheduleSync(); return result; }; } }
  const oldDebug=st.getDebugSnapshot; if(typeof oldDebug==='function'){ st.getDebugSnapshot=function(){ const d=oldDebug.apply(this, arguments); return { ...d, postgresStore: clone(state) }; }; }
  return st; }
const oldLoad=Module._load;
Module._load=function(request,parent,isMain){ const loaded=oldLoad.apply(this, arguments); try { if(request==='./store'||request==='store'||String(request).endsWith('/store')||String(request).endsWith('store.js')) return wrapStore(loaded); } catch(e){ state.lastError='module_patch:' + e.message; } return loaded; };
process.on('SIGTERM',()=>{ try{ clearTimeout(syncTimer); syncNow().finally(()=>process.exit(0)); setTimeout(()=>process.exit(0),1000); }catch{process.exit(0)} });
log('loaded; dbUrlPresent=' + (!!DB_URL));
