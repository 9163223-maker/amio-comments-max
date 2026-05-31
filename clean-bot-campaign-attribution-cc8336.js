'use strict';

const base = require('./clean-bot-campaign-links-pr91');
const store = require('./store');
const growthService = require('./services/growthService');
const campaignAttribution = require('./campaign-attribution-cc8336');
const botAudit = require('./admin-bot-audit-trace');

const RUNTIME = 'CC8.3.36-CAMPAIGN-ATTRIBUTION';

function audit(type, payload = {}) {
  try { botAudit.log(type, payload); } catch {}
}

function createCleanBot(legacy) {
  campaignAttribution.install();
  const wrapped = base.createCleanBot(legacy);
  return {
    handleWebhook: async function handleWebhookWithCampaignAttribution(req, res, config) {
      try {
        campaignAttribution.saveAudienceEventFromUpdate(store, growthService, req.body || {}, audit);
      } catch (error) {
        audit('campaign_attribution.error', { error: String(error && error.message || error).slice(0, 220), runtimeVersion: RUNTIME });
      }
      return wrapped.handleWebhook(req, res, config);
    }
  };
}

module.exports = { RUNTIME, createCleanBot };
