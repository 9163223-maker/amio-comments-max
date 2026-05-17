'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'billing',
  title: 'Тарифы / кабинет',
  icon: '💳',
  order: 135,
  feature: 'billing.enabled',
  description: 'Личный кабинет клиента: текущий тариф, оплата, подписка, лимиты, реферальная ссылка и история начислений.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_accounts', 'ak_billing_subscriptions', 'ak_referrals', 'ak_referral_rewards'],
  nextStep: 'сделать billingDataAdapter: текущий тариф, кнопка оплаты/продления, реферальная ссылка, баланс бонусов, лимиты функций',
  risks: ['не подключать реальные платежи без отдельного payment adapter', 'не показывать внутренние account_id в клиентском UX', 'не смешивать debug и личный кабинет'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
