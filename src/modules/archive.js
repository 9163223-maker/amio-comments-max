'use strict';
const { makeSection } = require('./_sectionFactory');
module.exports = makeSection({ id:'archive', title:'Архив', icon:'🗄️', order:95, feature:'archive.enabled', description:'Архив хранит копии постов и готовится к восстановлению копии как новой публикации.', status:'core-1.44.0-archive-planned', mode:'read-only', cleanTables:['posts'], nextStep:'full archive tree', risks:['preview before apply'], writesEnabled:false, legacyAdaptersUsed:false, dangerousActionsDisabled:true });
