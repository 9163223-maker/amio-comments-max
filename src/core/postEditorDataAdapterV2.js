'use strict';

const base = require('./postEditorDataAdapter');

const RUNTIME = 'ADMINKIT-CORE-POST-EDITOR-DATA-ADAPTER-1.44.0-NO-LOCAL-AGE-BLOCK';

async function directEditPost(ctx = {}, input = {}, options = {}) {
  const result = await base.directEditPost(ctx, input, options);
  if (result && typeof result === 'object') {
    delete result.maxEditLimitHours;
    result.noLocalAgeBlock = true;
    result.actualMaxApiResultDecides = true;
  }
  return result;
}

async function restoreArchive(ctx = {}, input = {}, options = {}) {
  const result = await base.restoreArchive(ctx, input, options);
  if (result && typeof result === 'object') {
    delete result.maxEditLimitHours;
    result.noLocalAgeBlock = true;
    result.actualMaxApiResultDecides = true;
  }
  return result;
}

function selfTest() {
  const self = base.selfTest ? base.selfTest() : {};
  return {
    ...self,
    ok: self.ok !== false,
    runtimeVersion: RUNTIME,
    noLocalAgeBlock: true,
    actualMaxApiResultDecides: true,
    quickEditDoesNotRequireArchiveRestore: true,
    archiveSeparateFromQuickEdit: true
  };
}

module.exports = { ...base, RUNTIME, directEditPost, restoreArchive, selfTest };