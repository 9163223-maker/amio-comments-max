'use strict';

const RUNTIME = 'CC8.3.60-PR220-BUTTONS-SELECTED-POST-STATE';
const SOURCE = 'adminkit-pr220-buttons-selected-post-state';

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
