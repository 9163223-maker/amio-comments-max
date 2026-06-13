'use strict';

const https = require('https');
const crypto = require('crypto');
const liveVersionSnapshotService = require('./liveVersionSnapshotService');

const DEFAULT_REPO = '9163223-maker/amio-comments-max';
const DEFAULT_BRANCH = 'runtime-status';
const DEFAULT_PATH = 'runtime/startup-log.json';
const DEFAULT_LIMIT = 50;
const DEFAULT_MAIN_BRANCH = 'main';
const USER_AGENT = 'adminkit-startup-log-pr181';

const state = {
  enabled: false,
  lastOk: false,
  lastError: '',
  lastAttemptAt: '',
  lastSyncedAt: '',
  branch: DEFAULT_BRANCH,
  path: DEFAULT_PATH,
  limit: DEFAULT_LIMIT,
  latest: null,
  githubMainHeadSha: '',
  githubMainHeadCheckedAt: ''
};

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function short(value, max = 160) { return clean(value).slice(0, max); }
function b64(value) { return Buffer.from(String(value || ''), 'utf8').toString('base64'); }
function fromB64(value) { return Buffer.from(String(value || ''), 'base64').toString('utf8'); }
function bootId() { return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`; }
function sanitizeBool(value) { return value === true; }
function sanitizeObject(value = {}) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function sanitizeList(value = [], limit = 20) { return Array.isArray(value) ? value.slice(0, limit).map((item) => short(item, 160)).filter(Boolean) : []; }
function sanitizeBoolMap(value = {}) {
  const input = sanitizeObject(value);
  return Object.fromEntries(Object.entries(input).map(([key, val]) => [short(key, 120), sanitizeBool(val)]));
}
function sanitizeRuntimeContract(input = {}) {
  const c = sanitizeObject(input);
  const startupPath = sanitizeObject(c.startupPath);
  const routes = sanitizeObject(c.routes);
  const dataProviders = sanitizeObject(c.dataProviders);
  const route = (name) => {
    const r = sanitizeObject(routes[name]);
    return {
      action: short(r.action, 120),
      active: sanitizeBool(r.active),
      module: short(r.module, 120),
      renderer: short(r.renderer, 120),
      channelsProvider: short(r.channelsProvider, 160),
      postsProvider: short(r.postsProvider, 160),
      expectedPostsProvider: short(r.expectedPostsProvider, 160),
      usesSharedPicker: sanitizeBool(r.usesSharedPicker),
      dbBacked: sanitizeBool(r.dbBacked),
      stillStoreBacked: sanitizeBool(r.stillStoreBacked),
      ok: sanitizeBool(r.ok)
    };
  };
  return {
    runtime: short(c.runtime, 120),
    sourceMarker: short(c.sourceMarker, 160),
    generatedAt: short(c.generatedAt, 64),
    safe: true,
    contractLiveOk: sanitizeBool(c.contractLiveOk),
    startupPath: {
      entrypointExpected: short(startupPath.entrypointExpected, 120),
      activeEntrypoint: short(startupPath.activeEntrypoint, 120),
      startupLogBootstrapRequired: sanitizeBool(startupPath.startupLogBootstrapRequired),
      expressRoutesInstalledByEntrypoint: sanitizeBool(startupPath.expressRoutesInstalledByEntrypoint),
      cleanBotInstalledByEntrypoint: sanitizeBool(startupPath.cleanBotInstalledByEntrypoint),
      ok: sanitizeBool(startupPath.ok)
    },
    routes: {
      channelsList: route('channelsList'),
      buttonsChannelPicker: route('buttonsChannelPicker'),
      buttonsPostPicker: route('buttonsPostPicker')
    },
    dataProviders: {
      cc5DbCoreLoaded: sanitizeBool(dataProviders.cc5DbCoreLoaded),
      cc5GetChannelsAvailable: sanitizeBool(dataProviders.cc5GetChannelsAvailable),
      cc5GetPostsAvailable: sanitizeBool(dataProviders.cc5GetPostsAvailable),
      akPostsHasAdminChannelPostKey: sanitizeBool(dataProviders.akPostsHasAdminChannelPostKey),
      akPostsHasAdminCommentUnique: sanitizeBool(dataProviders.akPostsHasAdminCommentUnique),
      buttonsReadsPostsFromCc5: sanitizeBool(dataProviders.buttonsReadsPostsFromCc5),
      buttonsReadsPostsFromStore: sanitizeBool(dataProviders.buttonsReadsPostsFromStore),
      ok: sanitizeBool(dataProviders.ok)
    },
    mismatches: sanitizeList(c.mismatches, 30)
  };
}
function sanitizeFinalRuntimeReadinessGate(input = {}) {
  const gate = sanitizeObject(input);
  const required = sanitizeBoolMap(gate.required);
  return {
    ok: sanitizeBool(gate.ok),
    runtime: short(gate.runtime, 120),
    source: short(gate.source, 160),
    generatedAt: short(gate.generatedAt, 64),
    activeEntrypoint: short(gate.activeEntrypoint, 120),
    runtimeVersion: short(gate.runtimeVersion, 120),
    buildVersion: short(gate.buildVersion, 120),
    sourceMarker: short(gate.sourceMarker, 160),
    githubMainHeadVerifiedByStartupLog: sanitizeBool(gate.githubMainHeadVerifiedByStartupLog),
    required,
    missing: sanitizeList(gate.missing, 30),
    readyForManualMaxTest: sanitizeBool(gate.readyForManualMaxTest)
  };
}
function buildFinalRuntimeReadinessGateFromSnapshot(snapshot = {}) {
  const snap = sanitizeObject(snapshot);
  const summary = sanitizeObject(snap.liveVersionSummary);
  const required = {
    runtimeSnapshotOk: sanitizeBool(snap.ok),
    runtimeContractLiveOk: sanitizeBool(summary.runtimeContractLiveOk),
    pr199Ready: sanitizeBool(summary.pr199Ready),
    pr202Ready: sanitizeBool(summary.pr202Ready),
    buttonsWizardPhysicalRouteProbeOk: sanitizeBool(summary.buttonsWizardPhysicalRouteProbeOk),
    buttonsWizardPhysicalInplaceReady: sanitizeBool(summary.buttonsWizardPhysicalInplaceReady),
    plusSignWizardTextSupported: sanitizeBool(summary.plusSignWizardTextSupported)
  };
  const missing = Object.entries(required).filter(([, value]) => value !== true).map(([key]) => key);
  return {
    ok: missing.length === 0,
    runtime: 'PR205-FINAL-RUNTIME-READINESS-GATE',
    source: 'adminkit-pr205-final-runtime-readiness-gate',
    generatedAt: Date.now(),
    activeEntrypoint: short(summary.activeEntrypoint || snap.activeEntrypoint, 120),
    runtimeVersion: short(summary.runtimeVersion || snap.runtimeVersion, 120),
    buildVersion: short(summary.buildVersion || snap.buildVersion, 120),
    sourceMarker: short(summary.sourceMarker || snap.sourceMarker, 160),
    githubMainHeadVerifiedByStartupLog: true,
    required,
    missing,
    readyForManualMaxTest: missing.length === 0
  };
}
function sanitizeLiveVersionSnapshot(input = {}) {
  const snap = sanitizeObject(input);
  const wizard = sanitizeObject(snap.pr199ButtonsWizard);
  const guard = sanitizeObject(snap.pr199ButtonsMainMenuRouteGuard);
  const realShow = sanitizeObject(snap.pr202ButtonsRealShowPath);
  const postStart = sanitizeObject(snap.pr202PostStartInstaller);
  const physicalProbe = sanitizeObject(snap.buttonsWizardPhysicalRouteProbe);
  const summary = sanitizeObject(snap.liveVersionSummary);
  const contract = sanitizeObject(snap.runtimeContract);
  return {
    ok: sanitizeBool(snap.ok),
    runtimeVersion: short(snap.runtimeVersion, 120),
    buildVersion: short(snap.buildVersion || snap.runtimeVersion, 120),
    displayVersion: short(snap.displayVersion || snap.runtimeVersion, 120),
    packageVersion: short(snap.packageVersion || snap.runtimeVersion, 120),
    sourceMarker: short(snap.sourceMarker, 160),
    gitCommit: short(snap.gitCommit, 80),
    activeEntrypoint: short(snap.activeEntrypoint, 120),
    staleEndpointDetected: sanitizeBool(snap.staleEndpointDetected),
    debugVersionSource: short(snap.debugVersionSource, 120),
    runtimeContract: {
      runtime: short(contract.runtime, 120),
      sourceMarker: short(contract.sourceMarker, 160),
      contractLiveOk: sanitizeBool(contract.contractLiveOk),
      startupPathOk: sanitizeBool(contract.startupPathOk),
      dataProvidersOk: sanitizeBool(contract.dataProvidersOk),
      mismatches: sanitizeList(contract.mismatches, 20),
      safe: true
    },
    safe: true,
    generatedAt: short(snap.generatedAt, 64),
    error: short(snap.error, 160),
    pr199ButtonsWizard: {
      ok: sanitizeBool(wizard.ok),
      installed: sanitizeBool(wizard.installed),
      installOrder: short(wizard.installOrder, 80),
      buttonsDuplicateSaveGuarded: sanitizeBool(wizard.buttonsDuplicateSaveGuarded),
      buttonsPendingPreviewConsumedBeforeSave: sanitizeBool(wizard.buttonsPendingPreviewConsumedBeforeSave)
    },
    pr199ButtonsMainMenuRouteGuard: {
      ok: sanitizeBool(guard.ok),
      installed: sanitizeBool(guard.installed),
      chatIdWizardEditForwardsBotToken: sanitizeBool(guard.chatIdWizardEditForwardsBotToken),
      chatIdWizardEditFallsBackToSend: sanitizeBool(guard.chatIdWizardEditFallsBackToSend)
    },
    pr202ButtonsRealShowPath: {
      ok: sanitizeBool(realShow.ok),
      installed: sanitizeBool(realShow.installed),
      runtime: short(realShow.runtime, 120),
      source: short(realShow.source, 160),
      buttonsWizardRealShowPathInplace: sanitizeBool(realShow.buttonsWizardRealShowPathInplace),
      buttonsWizardTraceCoversShowPath: sanitizeBool(realShow.buttonsWizardTraceCoversShowPath),
      plusSignWizardTextSupported: sanitizeBool(realShow.plusSignWizardTextSupported),
      patchesMaxSendMessageAfterPr199: sanitizeBool(realShow.patchesMaxSendMessageAfterPr199),
      already: sanitizeBool(realShow.already),
      error: short(realShow.error, 160)
    },
    pr202PostStartInstaller: {
      ok: sanitizeBool(postStart.ok),
      installed: sanitizeBool(postStart.installed),
      scheduled: sanitizeBool(postStart.scheduled),
      runtime: short(postStart.runtime, 120),
      reason: short(postStart.reason, 120),
      delayMs: Number(postStart.delayMs || 0),
      startupLogRefreshRequested: sanitizeBool(postStart.startupLogRefreshRequested),
      startupLogRefreshReason: short(postStart.startupLogRefreshReason, 120),
      error: short(postStart.error, 160)
    },
    buttonsWizardPhysicalRouteProbe: {
      ok: sanitizeBool(physicalProbe.ok),
      runtime: short(physicalProbe.runtime, 120),
      source: short(physicalProbe.source, 160),
      step1Transport: short(physicalProbe.step1Transport, 80),
      step2Transport: short(physicalProbe.step2Transport, 80),
      step3Transport: short(physicalProbe.step3Transport, 80),
      sameMessageAcrossSteps: sanitizeBool(physicalProbe.sameMessageAcrossSteps),
      wizardSendMessageCount: Number(physicalProbe.wizardSendMessageCount || 0),
      cleanupTouchedWizardMessage: sanitizeBool(physicalProbe.cleanupTouchedWizardMessage),
      diagnostics: sanitizeList(physicalProbe.diagnostics, 10)
    },
    liveVersionSummary: {
      ok: sanitizeBool(summary.ok),
      runtimeVersion: short(summary.runtimeVersion, 120),
      buildVersion: short(summary.buildVersion, 120),
      sourceMarker: short(summary.sourceMarker, 160),
      gitCommit: short(summary.gitCommit, 80),
      activeEntrypoint: short(summary.activeEntrypoint, 120),
      staleEndpointDetected: sanitizeBool(summary.staleEndpointDetected),
      debugVersionSource: short(summary.debugVersionSource, 120),
      runtimeContractLiveOk: sanitizeBool(summary.runtimeContractLiveOk),
      pr199Ready: sanitizeBool(summary.pr199Ready),
      pr202Ready: sanitizeBool(summary.pr202Ready),
      buttonsWizardPhysicalRouteProbeOk: sanitizeBool(summary.buttonsWizardPhysicalRouteProbeOk),
      buttonsWizardPhysicalInplaceReady: sanitizeBool(summary.buttonsWizardPhysicalInplaceReady),
      pr199ButtonsWizardOk: sanitizeBool(summary.pr199ButtonsWizardOk),
      pr199ButtonsMainMenuRouteGuardOk: sanitizeBool(summary.pr199ButtonsMainMenuRouteGuardOk),
      chatIdWizardEditForwardsBotToken: sanitizeBool(summary.chatIdWizardEditForwardsBotToken),
      chatIdWizardEditFallsBackToSend: sanitizeBool(summary.chatIdWizardEditFallsBackToSend),
      buttonsDuplicateSaveGuarded: sanitizeBool(summary.buttonsDuplicateSaveGuarded),
      buttonsPendingPreviewConsumedBeforeSave: sanitizeBool(summary.buttonsPendingPreviewConsumedBeforeSave),
      installOrderAfterPersistentStoreBootstrap: sanitizeBool(summary.installOrderAfterPersistentStoreBootstrap),
      pr202ButtonsRealShowPathOk: sanitizeBool(summary.pr202ButtonsRealShowPathOk),
      pr202ButtonsRealShowPathInstalled: sanitizeBool(summary.pr202ButtonsRealShowPathInstalled),
      buttonsWizardRealShowPathInplace: sanitizeBool(summary.buttonsWizardRealShowPathInplace),
      buttonsWizardTraceCoversShowPath: sanitizeBool(summary.buttonsWizardTraceCoversShowPath),
      plusSignWizardTextSupported: sanitizeBool(summary.plusSignWizardTextSupported),
      patchesMaxSendMessageAfterPr199: sanitizeBool(summary.patchesMaxSendMessageAfterPr199)
    }
  };
}

function sanitizeEntry(input = {}) {
  const liveVersionSnapshot = input.liveVersionSnapshot;
  const finalRuntimeReadinessGate = input.finalRuntimeReadinessGate || buildFinalRuntimeReadinessGateFromSnapshot(liveVersionSnapshot);
  const safe = {
    startedAt: short(input.startedAt || nowIso(), 64),
    bootId: short(input.bootId || bootId(), 80),
    runtimeVersion: short(input.runtimeVersion, 120),
    buildVersion: short(input.buildVersion || input.runtimeVersion, 120),
    displayVersion: short(input.displayVersion || input.runtimeVersion, 120),
    sourceMarker: short(input.sourceMarker, 160),
    entrypoint: short(input.entrypoint || 'clean-entrypoint-1.53.10-pr89.js', 120),
    gitCommit: short(input.gitCommit || process.env.GIT_COMMIT || process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION, 80),
    githubMainBranch: short(input.githubMainBranch || DEFAULT_MAIN_BRANCH, 80),
    githubMainHeadSha: short(input.githubMainHeadSha, 80),
    githubMainHeadCheckedAt: short(input.githubMainHeadCheckedAt, 64),
    commitSource: short(input.commitSource, 80),
    nodeEnv: short(process.env.NODE_ENV || '', 40),
    pr178PushPairingBinding: sanitizeBool(input.pr178PushPairingBinding),
    pr191PushAdminInviteTitleCommands: sanitizeBool(input.pr191PushAdminInviteTitleCommands),
    pushPairingRuntimeVersion: short(input.pushPairingRuntimeVersion, 120),
    pushRuntimeSourceMarker: short(input.pushRuntimeSourceMarker, 160),
    pushPairingBaseSourceMarker: short(input.pushPairingBaseSourceMarker, 160),
    pushPairingSourceMarker: short(input.pushPairingSourceMarker, 160),
    pr165RuntimeWired: sanitizeBool(input.pr165RuntimeWired),
    postgresConfigured: sanitizeBool(input.postgresConfigured),
    canonicalPublicBaseUrl: short(input.canonicalPublicBaseUrl || process.env.ADMINKIT_PUBLIC_BASE_URL, 200),
    runtimeContract: sanitizeRuntimeContract(input.runtimeContract),
    liveVersionSnapshot: sanitizeLiveVersionSnapshot(liveVersionSnapshot),
    liveVersionSummary: sanitizeLiveVersionSnapshot(liveVersionSnapshot).liveVersionSummary,
    finalRuntimeReadinessGate: sanitizeFinalRuntimeReadinessGate(finalRuntimeReadinessGate),
    safe: true
  };
  if (!safe.commitSource) safe.commitSource = safe.gitCommit ? 'runtime-env' : (safe.githubMainHeadSha ? 'github-main-head' : 'unknown');
  return safe;
}

function safeError(error) {
  const code = short(error && (error.code || error.status || error.message), 120) || 'startup_log_failed';
  return code.replace(/ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+\S+/gi, '[redacted]');
}

function requestJson({ method = 'GET', path, token, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = https.request({
      hostname: 'api.github.com',
      method,
      path,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        const error = new Error(data && data.message || `github_status_${res.statusCode}`);
        error.status = res.statusCode;
        error.data = data;
        reject(error);
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('github_timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function getBranchHead({ repo, branch, token }) {
  const checkedAt = nowIso();
  try {
    const ref = await requestJson({ path: `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token });
    const sha = ref && ref.object && ref.object.sha;
    return { ok: Boolean(sha), branch, sha: short(sha, 80), checkedAt };
  } catch (error) {
    return { ok: false, branch, sha: '', checkedAt, error: safeError(error) };
  }
}

async function ensureBranch({ repo, branch, token }) {
  try {
    await requestJson({ path: `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token });
    return { ok: true, existed: true };
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const repoInfo = await requestJson({ path: `/repos/${repo}`, token });
  const baseBranch = clean(repoInfo.default_branch || DEFAULT_MAIN_BRANCH);
  const baseRef = await requestJson({ path: `/repos/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token });
  const sha = baseRef && baseRef.object && baseRef.object.sha;
  if (!sha) throw new Error('startup_log_base_ref_missing');
  await requestJson({ method: 'POST', path: `/repos/${repo}/git/refs`, token, body: { ref: `refs/heads/${branch}`, sha } });
  return { ok: true, existed: false, baseBranch, sha };
}

async function readLog({ repo, branch, path, token }) {
  try {
    const file = await requestJson({ path: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`, token });
    const parsed = JSON.parse(fromB64(file.content || ''));
    return { sha: file.sha, log: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch (error) {
    if (error.status === 404) return { sha: '', log: {} };
    throw error;
  }
}

async function writeLog({ repo, branch, path, token, sha, log }) {
  const body = {
    message: `startup log ${log.latest && log.latest.runtimeVersion || 'runtime'}`,
    content: b64(`${JSON.stringify(log, null, 2)}\n`),
    branch,
    ...(sha ? { sha } : {})
  };
  return requestJson({ method: 'PUT', path: `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, body });
}

async function recordStartup(input = {}) {
  state.lastAttemptAt = nowIso();
  const token = clean(process.env.GITHUB_DEBUG_TOKEN);
  state.enabled = Boolean(token);
  if (!token) {
    state.lastOk = false;
    state.lastError = 'GITHUB_DEBUG_TOKEN not configured';
    console.log('[startup-log] skipped: GITHUB_DEBUG_TOKEN not configured');
    return { ok: false, skipped: true, error: state.lastError };
  }
  const repo = DEFAULT_REPO;
  const branch = DEFAULT_BRANCH;
  const path = DEFAULT_PATH;
  const limit = DEFAULT_LIMIT;
  state.branch = branch;
  state.path = path;
  state.limit = limit;
  try {
    const liveVersionSnapshot = input.liveVersionSnapshot || liveVersionSnapshotService.buildLiveVersionSnapshot();
    const mainHead = await getBranchHead({ repo, branch: DEFAULT_MAIN_BRANCH, token });
    const entry = sanitizeEntry({
      ...input,
      liveVersionSnapshot,
      liveVersionSummary: input.liveVersionSummary || liveVersionSnapshot.liveVersionSummary,
      githubMainBranch: DEFAULT_MAIN_BRANCH,
      githubMainHeadSha: mainHead.sha,
      githubMainHeadCheckedAt: mainHead.checkedAt,
      commitSource: clean(input.gitCommit || process.env.GIT_COMMIT || process.env.COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION) ? 'runtime-env' : (mainHead.sha ? 'github-main-head' : 'unknown')
    });
    state.githubMainHeadSha = mainHead.sha;
    state.githubMainHeadCheckedAt = mainHead.checkedAt;
    await ensureBranch({ repo, branch, token });
    const current = await readLog({ repo, branch, path, token });
    const oldItems = Array.isArray(current.log.items) ? current.log.items : [];
    const items = [entry, ...oldItems].slice(0, limit);
    const log = { ok: true, updatedAt: nowIso(), limit, latest: entry, items };
    await writeLog({ repo, branch, path, token, sha: current.sha, log });
    state.lastOk = true;
    state.lastError = '';
    state.lastSyncedAt = log.updatedAt;
    state.latest = entry;
    console.log('[startup-log] synced', JSON.stringify({ branch, path, runtimeVersion: entry.runtimeVersion, gitCommit: entry.gitCommit, githubMainHeadSha: entry.githubMainHeadSha, contractLiveOk: entry.runtimeContract && entry.runtimeContract.contractLiveOk }));
    return { ok: true, branch, path, latest: entry };
  } catch (error) {
    state.lastOk = false;
    state.lastError = safeError(error);
    console.warn('[startup-log] failed', state.lastError);
    return { ok: false, error: state.lastError };
  }
}

function info() {
  return {
    enabled: state.enabled,
    lastOk: state.lastOk,
    lastError: state.lastError,
    lastAttemptAt: state.lastAttemptAt,
    lastSyncedAt: state.lastSyncedAt,
    branch: state.branch,
    path: state.path,
    limit: state.limit,
    githubMainHeadSha: state.githubMainHeadSha,
    githubMainHeadCheckedAt: state.githubMainHeadCheckedAt,
    latest: state.latest
  };
}

module.exports = { recordStartup, info, sanitizeEntry, sanitizeRuntimeContract, sanitizeLiveVersionSnapshot, sanitizeFinalRuntimeReadinessGate, buildFinalRuntimeReadinessGateFromSnapshot, getBranchHead, DEFAULT_REPO, DEFAULT_BRANCH, DEFAULT_PATH, DEFAULT_LIMIT, DEFAULT_MAIN_BRANCH };
