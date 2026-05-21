'use strict';

module.exports = {
  postgres: require('../db/postgres'),
  tenants: require('./tenants'),
  users: require('./users'),
  tariffs: require('./tariffs'),
  referrals: require('./referrals'),
  permissions: require('./permissions')
};
