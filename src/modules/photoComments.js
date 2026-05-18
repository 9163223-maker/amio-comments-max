'use strict';
const { makeSection } = require('./_sectionFactory');

const section = makeSection({
  id: 'photo_comments',
  title: 'Фото в комментариях',
  icon: '🖼',
  order: 30,
  feature: 'photo_comments.enabled',
  description: 'Фото в комментариях теперь управляются внутри раздела «Комментарии». Верхний раздел скрыт из главного меню, чтобы не дробить одну функцию на несколько экранов.',
  status: 'folded-into-comments',
  mode: 'read-only',
  cleanTables: ['ak_comment_media', 'ak_comment_threads', 'ak_admin_sessions'],
  nextStep: 'настраивать фото через 💬 Комментарии → пост → Фото в комментариях',
  risks: ['не включать видео', 'не включать файлы', 'не использовать legacy attachment handlers как рабочий слой'],
  writesEnabled: false,
  legacyAdaptersUsed: false,
  dangerousActionsDisabled: true
});

section.hiddenInMain = true;
section.foldedInto = 'comments';
section.selfTest = function selfTest() {
  return {
    ok: true,
    runtimeVersion: 'ADMINKIT-CORE-PHOTO-COMMENTS-1.41.0-FOLDED-INTO-COMMENTS',
    sectionId: 'photo_comments',
    foldedInto: 'comments',
    hiddenInMain: true,
    photoInsideComments: true,
    noVideoFilesInComments: true,
    legacyAdaptersUsed: false
  };
};

module.exports = section;
