'use strict';

// АдминКИТ V3 comments title DB fallback.
// Fixes comments UI stuck on "Загрузка..." after redeploy when file store has lost post text,
// but DB still knows channel/post/commentKey/messageId. Does not repatch channel posts.

const fs = require('fs');
const path = require('path');
const Module = require('module');

const RUNTIME = 'CC6.6.8-COMMENTS-TITLE-DB-FALLBACK';
const SOURCE = 'adminkit-v3-comments-title-resolve-db-and-live-message';
const MARKER = '__ADMINKIT_COMMENTS_TITLE_DB_FALLBACK_668__';

let installed = false;
let expressWrapped = false;
let clientPatched = false;
let lastError = '';
let resolveCount = 0;
let dbResolveCount = 0;
let liveResolveCount = 0;
let storeResolveCount = 0;
let lastResolveAt = '';

function norm(value) { return String(value || '').replace(/^:+/, '').replace(/^["']+|["']+$/g, '').trim(); }
function noCache(res) { try { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0', 'Surrogate-Control': 'no-store' }); } catch {} }

function compactText(value, limit = 6000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function queryParams(req) {
  const q = req.query || {};
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return {
    commentKey: norm(q.commentKey || body.commentKey || q.key || body.key || ''),
    handoff: norm(q.handoff || body.handoff || q.startapp || body.startapp || q.start_param || body.start_param || ''),
    channelId: norm(q.channelId || body.channelId || q.channel || body.channel || ''),
    postId: norm(q.postId || body.postId || q.post_id || body.post_id || q.messageId || body.messageId || '')
  };
}

function postFromStore(params) {
  try {
    const store = require('./store');
    const candidates = [];
    const add = (value) => { const v = norm(value); if (v && !candidates.includes(v)) candidates.push(v); };
    add(params.commentKey);
    add(params.handoff);
    if (params.channelId && params.postId) add(`${params.channelId}:${params.postId}`);
    add(params.postId);
    for (const candidate of candidates) {
      let post = null;
      if (typeof store.getPost === 'function') post = store.getPost(candidate);
      if (!post && typeof store.resolveCommentKeyFromHandoff === 'function') {
        const key = store.resolveCommentKeyFromHandoff(candidate);
        if (key && typeof store.getPost === 'function') post = store.getPost(key);
      }
      if (!post && typeof store.findPostByAnyId === 'function') post = store.findPostByAnyId(candidate);
      if (post) {
        storeResolveCount += 1;
        return { ...post, originalText: post.originalText || post.title || '', title: post.title || post.originalText || '', source: 'store' };
      }
    }
  } catch (error) { lastError = error?.message || String(error); }
  return null;
}

async function postFromDb(params) {
  try {
    const db = require('./cc5-db-core');
    await db.init();
    let rows = [];
    if (params.commentKey) {
      const result = await db.query('select channel_id, post_id, message_id, comment_key, title, raw, updated_at from ak_posts where comment_key=$1 order by updated_at desc limit 1', [params.commentKey]);
      rows = result.rows || [];
    }
    if (!rows.length && params.channelId && params.postId) {
      const result = await db.query('select channel_id, post_id, message_id, comment_key, title, raw, updated_at from ak_posts where channel_id=$1 and post_id=$2 order by updated_at desc limit 1', [params.channelId, params.postId]);
      rows = result.rows || [];
    }
    if (!rows.length && params.postId) {
      const result = await db.query('select channel_id, post_id, message_id, comment_key, title, raw, updated_at from ak_posts where post_id=$1 or message_id=$1 order by updated_at desc limit 1', [params.postId]);
      rows = result.rows || [];
    }
    const row = rows[0] || null;
    if (!row) return null;
    dbResolveCount += 1;
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    return {
      commentKey: norm(row.comment_key || raw.commentKey || `${row.channel_id}:${row.post_id}`),
      channelId: norm(row.channel_id || raw.channelId || ''),
      postId: norm(row.post_id || raw.postId || ''),
      messageId: norm(row.message_id || raw.messageId || row.post_id || ''),
      title: compactText(row.title || raw.title || raw.originalText || raw.text || row.post_id || ''),
      originalText: compactText(raw.originalText || raw.text || row.title || row.post_id || ''),
      channelTitle: norm(raw.channelTitle || ''),
      source: 'db'
    };
  } catch (error) { lastError = error?.message || String(error); }
  return null;
}

async function enrichFromLive(post) {
  if (!post || !post.messageId) return post;
  try {
    const config = require('./config');
    const api = require('./services/maxApi');
    const live = await api.getMessage({ botToken: config.botToken, messageId: post.messageId });
    const body = live && live.body && typeof live.body === 'object' ? live.body : {};
    const text = compactText(body.text || live.text || '');
    const attachments = Array.isArray(body.attachments) ? body.attachments.filter((item) => item && item.type !== 'inline_keyboard') : [];
    const link = body.link && typeof body.link === 'object' ? body.link : null;
    if (text || attachments.length || link) {
      liveResolveCount += 1;
      const next = { ...post, originalText: text || post.originalText || post.title || '', title: text || post.title || post.originalText || '', source: post.source + '+live' };
      try {
        const store = require('./store');
        if (typeof store.savePost === 'function' && next.commentKey) {
          store.savePost(next.commentKey, {
            postId: next.postId,
            channelId: next.channelId,
            messageId: next.messageId,
            originalText: next.originalText,
            title: next.title,
            sourceAttachments: attachments,
            originalLink: link,
            ...(body.format !== undefined ? { originalFormat: body.format } : {}),
            restoredBy: RUNTIME
          });
        }
      } catch {}
      return next;
    }
  } catch (error) { lastError = error?.message || String(error); }
  return post;
}

async function resolvePost(params) {
  let post = postFromStore(params);
  if (!post) post = await postFromDb(params);
  if (post && (!post.originalText || /^Загрузка/i.test(post.originalText))) post = await enrichFromLive(post);
  if (post) {
    resolveCount += 1;
    lastResolveAt = new Date().toISOString();
    return { ok: true, runtimeVersion: RUNTIME, sourceMarker: SOURCE, commentKey: post.commentKey || params.commentKey, post };
  }
  return { ok: false, runtimeVersion: RUNTIME, sourceMarker: SOURCE, error: 'post_not_resolved_v3_db_fallback', params };
}

function clientPatch() {
  return `;(() => {\ntry {\n  const MARKER='${MARKER}';\n  if (window[MARKER]) return;\n  window[MARKER]=true;\n  const isLoading=(v)=>{const s=String(v||'').trim(); return !s || /^Загрузка/i.test(s) || /^Loading/i.test(s);};\n  const clean=(v)=>String(v||'').trim();\n  const titleEl=()=>document.getElementById('postTitle')||document.querySelector('[data-post-title]')||document.querySelector('.post-title');\n  const setTitle=(post)=>{const el=titleEl(); if(!el||!post||!isLoading(el.textContent)) return false; const text=clean(post.originalText||post.title||post.text||post.caption||''); if(!text) return false; el.textContent=text; window.__ADMINKIT_TITLE_DB_FALLBACK_LAST__={ok:true,runtimeVersion:'${RUNTIME}',title:text,at:new Date().toISOString()}; return true;};\n  const ctx=()=>{const url=new URL(location.href); const q=url.searchParams; const out={commentKey:q.get('commentKey')||'',handoff:q.get('handoff')||q.get('startapp')||q.get('start_param')||'',channelId:q.get('channelId')||'',postId:q.get('postId')||q.get('post_id')||''}; try{const raw=[location.href,location.search,location.hash,document.referrer||'',window.WebApp?.initData,window.WebApp?.startParam,window.WebApp?.initDataUnsafe?.start_param,window.Max?.WebApp?.initData,window.MAX?.WebApp?.initData].filter(Boolean).join('&'); const m=raw.match(/-?\\d{6,}:-?\\d{3,}/); if(m&&!out.commentKey) out.commentKey=m[0]; const h=raw.match(/h_[A-Za-z0-9_-]{6,}/); if(h&&!out.handoff) out.handoff=h[0]; }catch(_){} return out;};\n  async function run(source){const el=titleEl(); if(!el||!isLoading(el.textContent)) return; const c=ctx(); if(!c.commentKey&&!c.handoff&&!(c.channelId&&c.postId)&&!c.postId) return; const q=new URLSearchParams(); Object.entries(c).forEach(([k,v])=>{if(v) q.set(k,v)}); q.set('_',Date.now()); try{const r=await fetch('/api/comments/post-resolve-v3?'+q.toString(),{cache:'no-store'}); const d=await r.json().catch(()=>({})); if(d&&d.ok&&d.post) setTitle(d.post); else window.__ADMINKIT_TITLE_DB_FALLBACK_LAST__={ok:false,runtimeVersion:'${RUNTIME}',source,error:d&&d.error||'not_resolved',ctx:c,at:new Date().toISOString()};}catch(e){window.__ADMINKIT_TITLE_DB_FALLBACK_LAST__={ok:false,runtimeVersion:'${RUNTIME}',source,error:String(e&&e.message||e),at:new Date().toISOString()};}}\n  [0,150,400,900,1600,3000,6000,10000].forEach(ms=>setTimeout(()=>run('timer'),ms));\n  try{new MutationObserver(()=>run('mutation')).observe(document.documentElement,{childList:true,subtree:true,characterData:true});}catch(_){}\n}catch(e){window.__ADMINKIT_TITLE_DB_FALLBACK_LAST__={ok:false,runtimeVersion:'${RUNTIME}',error:String(e&&e.message||e),at:new Date().toISOString()};}\n})();\n`;
}

function patchClient() {
  try {
    const file = path.resolve(__dirname, 'public', 'app.js');
    const before = fs.readFileSync(file, 'utf8');
    if (before.includes(MARKER)) { clientPatched = true; return; }
    fs.writeFileSync(file, clientPatch() + before, 'utf8');
    clientPatched = true;
  } catch (error) { lastError = error?.message || String(error); }
}

function installExpress() {
  if (Module._load.__adminkitCommentsTitleDbFallback) return;
  const oldLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = oldLoad.apply(this, arguments);
    if (String(request || '') === 'express' && loaded && !loaded.__adminkitCommentsTitleDbFallbackWrap) {
      function expressWrapper() {
        const app = loaded.apply(this, arguments);
        if (app && !app.__adminkitCommentsTitleDbFallback) {
          app.__adminkitCommentsTitleDbFallback = true;
          app.get('/api/comments/post-resolve-v3', async (req, res) => { noCache(res); res.json(await resolvePost(queryParams(req))); });
          app.get('/debug/comments-title-db-fallback', (req, res) => { noCache(res); res.json(selfTest()); });
        }
        return app;
      }
      Object.setPrototypeOf(expressWrapper, loaded);
      Object.assign(expressWrapper, loaded);
      expressWrapper.__adminkitCommentsTitleDbFallbackWrap = true;
      expressWrapped = true;
      return expressWrapper;
    }
    return loaded;
  };
  Module._load.__adminkitCommentsTitleDbFallback = true;
}

function install() {
  if (installed) return selfTest();
  installed = true;
  patchClient();
  installExpress();
  return selfTest();
}

function selfTest() {
  return { ok: installed && clientPatched, runtimeVersion: RUNTIME, sourceMarker: SOURCE, installed, expressWrapped, clientPatched, resolveCount, storeResolveCount, dbResolveCount, liveResolveCount, lastResolveAt, lastError, endpoint: '/api/comments/post-resolve-v3', debug: '/debug/comments-title-db-fallback', policy: { readsOnlyUntilResolved: true, noPostRepatch: true, canRestoreStoreFromLiveMessage: true } };
}

module.exports = { RUNTIME, SOURCE, MARKER, install, selfTest, resolvePost };
