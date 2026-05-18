'use strict';
const { makeSection } = require('./_sectionFactory');

const section = makeSection({
  id: 'reactions_replies',
  title: 'Реакции и ответы',
  icon: '❤️',
  order: 40,
  feature: 'reactions_replies.enabled',
  description: 'Реакции и ответы теперь управляются внутри раздела «Комментарии». Верхний раздел скрыт из главного меню, потому что это настройки обсуждений под постами.',
  status: 'folded-into-comments',
  mode: 'read-only',
  cleanTables: ['ak_comment_reactions', 'ak_comment_replies', 'ak_comment_threads'],
  nextStep: 'настраивать ответы и реакции через 💬 Комментарии → пост → Ответы / Реакции',
  risks: ['не смешивать реакции поста и реакции комментария без явной связи', 'не дублировать реакции при повторном callback'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});

section.hiddenInMain = true;
section.foldedInto = 'comments';
section.selfTest = function selfTest() {
  return {
    ok: true,
    runtimeVersion: 'ADMINKIT-CORE-REACTIONS-REPLIES-1.41.0-FOLDED-INTO-COMMENTS',
    sectionId: 'reactions_replies',
    foldedInto: 'comments',
    hiddenInMain: true,
    repliesInsideComments: true,
    reactionsInsideComments: true,
    legacyAdaptersUsed: false
  };
};

module.exports = section;
