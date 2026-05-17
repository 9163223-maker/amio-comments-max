'use strict';
const { makeSection } = require('./_sectionFactory');

module.exports = makeSection({
  id: 'reactions_replies',
  title: 'Реакции и ответы',
  icon: '❤️',
  order: 40,
  feature: 'reactions_replies.enabled',
  description: 'Настройки реакций, ответов, avatar stack и счётчиков внутри комментариев. На 1.32 это audit-ready каркас без записи в legacy.',
  status: 'scaffold-audit-ready',
  mode: 'read-only',
  cleanTables: ['ak_comment_reactions', 'ak_comment_replies', 'ak_comment_threads'],
  nextStep: 'спроектировать clean reactionsDataAdapter: один голос, счётчики, avatar stack до 3 аватаров, ответы на комментарии',
  risks: ['не смешивать реакции поста и реакции комментария без явной связи', 'не дублировать реакции при повторном callback'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});
