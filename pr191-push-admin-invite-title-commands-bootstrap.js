'use strict';

const RUNTIME = 'CC8.3.59-MAIN-STRICT-RUNTIME-IDENTITY-GATE';
const SOURCE = 'adminkit-main-strict-runtime-identity-gate';

process.env.ADMINKIT_PR191_PUSH_ADMIN_INVITE_TITLE_COMMANDS = '1';

function info() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    pr191PushAdminInviteTitleCommands: true,
    chatTitleResolution: true,
    adminInvitePublishing: true,
    maxCommandCatalogAudit: true
  };
}

module.exports = { RUNTIME, SOURCE, info };
