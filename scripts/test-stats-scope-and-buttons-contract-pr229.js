'use strict';
const assert = require('assert');
(async () => {
  const menu = require('../v3-menu-core-1539');
  const statsFlow = require('../stats-flow-cc8');
  const home = await statsFlow.screenForPayload(menu, { action: 'admin_section_stats' }, { userId: 'contract_pr229_user', config: {} });
  assert(['stats_home_pr229', 'stats_scope_selector_pr229', 'stats_scope_empty_pr229'].includes(home && home.id), `PR229 stats root expected, got ${home && home.id}`);
  assert(!['stats_monitoring_home', 'stats_product_perfect_home_pr226'].includes(home && home.id), 'legacy stats root must not be returned');
  console.log(JSON.stringify({ ok: true, screenId: home.id }));
})().catch((error) => { console.error(error); process.exit(1); });
