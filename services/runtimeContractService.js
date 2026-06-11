'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'RUNTIME-CONTRACT-PR196';
const SOURCE = 'adminkit-runtime-contract-pr196';
const EXPECTED_ENTRYPOINT = 'clean-entrypoint-1.53.10-pr89.js';

function clean(value, limit = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1))}…` : text;
}
function bool(value) { return value === true; }
function read(relPath = '') {
  try { return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8'); }
  catch (error) { return ''; }
}
function has(source = '', pattern) {
  if (!source) return false;
  if (pattern instanceof RegExp) return pattern.test(source);
  return source.includes(String(pattern));
}
function buildInfo() {
  try {
    const mod = require('../buildInfo');
    return typeof mod.getBuildInfo === 'function' ? mod.getBuildInfo() : (mod.BUILD_INFO || {});
  } catch {
    return {};
  }
}
function moduleAvailable(relPath = '') {
  try {
    require(path.join('..', relPath));
    return true;
  } catch {
    return false;
  }
}
function functionAvailable(relPath = '', fn = '') {
  try {
    const mod = require(path.join('..', relPath));
    return typeof mod[fn] === 'function';
  } catch {
    return false;
  }
}
function buildContract() {
  const info = buildInfo();
  const activeEntrypoint = clean(info.activeEntrypoint || EXPECTED_ENTRYPOINT, 140);
  const v3Core = read('v3-menu-core-1539.js');
  const adapter = read('features/menu-v3/adapter.js');
  const buttons = read('buttons-flow-cc8-clean.js');
  const cc5 = read('cc5-db-core.js');
  const cleanEntrypoint = read(EXPECTED_ENTRYPOINT);

  const channelsListUsesSharedPicker = has(v3Core, "channelPostPicker=require('./channel-post-picker-core')")
    && has(v3Core, /asyncChannelsForUser\([^)]*\).*channelPostPicker\.listUiChannelsForUser/s)
    && has(v3Core, /unifiedScreenAsync\([^)]*\).*asyncChannelsForUser/s)
    && has(adapter, "case 'channels:list'");

  const buttonsChannelPickerUsesSharedPicker = has(buttons, "pickerCore.buildChannelPickerRows")
    || has(buttons, /listChannelsFromPosts\([^)]*\).*pickerCore\.listUiChannelsForUser/s);

  const buttonsPostPickerStillStoreBacked = has(buttons, 'store.getPostsList()')
    || has(buttons, 'store.getPostsList');
  const buttonsImportsCc5Db = has(buttons, "require('./cc5-db-core')") || has(buttons, 'require("./cc5-db-core")');
  const buttonsCallsCc5GetPosts = has(buttons, /\bdb\.getPosts\s*\(/)
    || has(buttons, /cc5Db\.getPosts\s*\(/)
    || has(buttons, /cc5\.getPosts\s*\(/);
  const buttonsPostPickerDbBacked = buttonsImportsCc5Db && buttonsCallsCc5GetPosts;

  const cc5GetPostsAvailable = functionAvailable('cc5-db-core', 'getPosts') || has(cc5, /async function getPosts\s*\(/) || has(cc5, /getPosts\s*[,=]/);
  const cc5GetChannelsAvailable = functionAvailable('cc5-db-core', 'getChannels') || has(cc5, /async function getChannels\s*\(/) || has(cc5, /getChannels\s*[,=]/);
  const akPostsHasAdminChannelPostKey = has(cc5, /primary key\s*\(admin_id,\s*channel_id,\s*post_id\)/i)
    || has(cc5, /PRIMARY KEY\s*\(admin_id,\s*channel_id,\s*post_id\)/i);
  const akPostsHasAdminCommentUnique = has(cc5, /unique\s*\(admin_id,\s*comment_key\)/i)
    || has(cc5, /UNIQUE\s*\(admin_id,\s*comment_key\)/i);

  const startupPathOk = activeEntrypoint === EXPECTED_ENTRYPOINT
    && has(cleanEntrypoint, "require('./pr180-startup-log-bootstrap')")
    && has(cleanEntrypoint, 'installExpressRoutes')
    && has(cleanEntrypoint, 'installCleanBot');

  const contractLiveOk = startupPathOk
    && channelsListUsesSharedPicker
    && buttonsChannelPickerUsesSharedPicker
    && buttonsPostPickerDbBacked
    && !buttonsPostPickerStillStoreBacked
    && cc5GetPostsAvailable
    && akPostsHasAdminChannelPostKey;

  return {
    runtime: RUNTIME,
    sourceMarker: SOURCE,
    generatedAt: new Date().toISOString(),
    safe: true,
    contractLiveOk,
    startupPath: {
      entrypointExpected: EXPECTED_ENTRYPOINT,
      activeEntrypoint,
      startupLogBootstrapRequired: has(cleanEntrypoint, "require('./pr180-startup-log-bootstrap')"),
      expressRoutesInstalledByEntrypoint: has(cleanEntrypoint, 'installExpressRoutes'),
      cleanBotInstalledByEntrypoint: has(cleanEntrypoint, 'installCleanBot'),
      ok: startupPathOk
    },
    routes: {
      channelsList: {
        action: 'channels:list',
        active: has(adapter, "case 'channels:list'"),
        module: 'v3-menu-core-1539.js',
        renderer: 'features/menu-v3/adapter.js',
        channelsProvider: channelsListUsesSharedPicker ? 'channel-post-picker-core.listUiChannelsForUser' : 'clientAccessService.getClientChannels_or_context_only',
        usesSharedPicker: channelsListUsesSharedPicker,
        ok: channelsListUsesSharedPicker
      },
      buttonsChannelPicker: {
        action: 'button_admin_recent_posts/button_admin_channel_pick',
        active: has(buttons, 'button_admin_channel_pick'),
        module: 'buttons-flow-cc8-clean.js',
        channelsProvider: buttonsChannelPickerUsesSharedPicker ? 'channel-post-picker-core.buildChannelPickerRows' : 'legacy_or_unknown',
        usesSharedPicker: buttonsChannelPickerUsesSharedPicker,
        ok: buttonsChannelPickerUsesSharedPicker
      },
      buttonsPostPicker: {
        action: 'button_admin_channel_pick -> listPosts',
        active: has(buttons, 'function listPosts'),
        module: 'buttons-flow-cc8-clean.js',
        postsProvider: buttonsPostPickerDbBacked ? 'cc5-db-core.getPosts' : (buttonsPostPickerStillStoreBacked ? 'store.getPostsList' : 'unknown'),
        expectedPostsProvider: 'cc5-db-core.getPosts',
        dbBacked: buttonsPostPickerDbBacked,
        stillStoreBacked: buttonsPostPickerStillStoreBacked,
        ok: buttonsPostPickerDbBacked && !buttonsPostPickerStillStoreBacked
      }
    },
    dataProviders: {
      cc5DbCoreLoaded: moduleAvailable('cc5-db-core'),
      cc5GetChannelsAvailable,
      cc5GetPostsAvailable,
      akPostsHasAdminChannelPostKey,
      akPostsHasAdminCommentUnique,
      buttonsReadsPostsFromCc5: buttonsPostPickerDbBacked,
      buttonsReadsPostsFromStore: buttonsPostPickerStillStoreBacked,
      ok: cc5GetChannelsAvailable && cc5GetPostsAvailable && akPostsHasAdminChannelPostKey
    },
    mismatches: [
      startupPathOk ? '' : 'startup_path_not_confirmed',
      channelsListUsesSharedPicker ? '' : 'channels_list_not_shared_picker_backed',
      buttonsChannelPickerUsesSharedPicker ? '' : 'buttons_channel_picker_not_shared_picker_backed',
      buttonsPostPickerDbBacked ? '' : 'buttons_post_picker_not_db_backed',
      buttonsPostPickerStillStoreBacked ? 'buttons_post_picker_still_store_backed' : '',
      cc5GetPostsAvailable ? '' : 'cc5_get_posts_missing',
      akPostsHasAdminChannelPostKey ? '' : 'ak_posts_admin_channel_post_key_missing'
    ].filter(Boolean)
  };
}

module.exports = { RUNTIME, SOURCE, EXPECTED_ENTRYPOINT, buildContract };
