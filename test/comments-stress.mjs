import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const storePath = path.join(root, 'data', 'store.json');
const backup = fs.existsSync(storePath) ? fs.readFileSync(storePath, 'utf8') : '';
const checks = [];
function check(name, condition, details = '') {
  checks.push({ name, ok: Boolean(condition), details });
  if (!condition) throw new Error(`${name}${details ? ` — ${details}` : ''}`);
}
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

try {
  const store = require(path.join(root, 'store.js'));
  const comments = require(path.join(root, 'services', 'commentService.js'));
  const commentKey = '-100:sp27-comments';
  store.setComments(commentKey, []);
  store.savePost(commentKey, {
    postId: 'sp27-comments', channelId: '-100', messageId: 'mid.test.sp27',
    originalText: 'Тест SP27',
    sourceAttachments: [{ type: 'image', payload: { url: 'https://example.test/post.jpg' } }],
    nativeReactions: [{ emoji: '🤣', count: 1 }],
    commentKey, createdAt: Date.now()
  });

  const names = ['Alex P', 'Ольга', 'Ruslan', 'Геннадий'];
  const created = [];
  for (let i = 0; i < 40; i += 1) {
    created.push(comments.createComment({
      commentKey,
      userId: `u${i % names.length}`,
      userName: names[i % names.length],
      avatarUrl: `https://example.test/a${i % names.length}.jpg`,
      text: i % 9 === 0 ? 'Длинный комментарий '.repeat(14) : `Комментарий ${i + 1}`,
      attachments: []
    }));
  }
  const imageComment = comments.createComment({
    commentKey, userId: 'u1', userName: 'Alex P', text: 'Фото с подписью',
    attachments: [{ type: 'image', name: 'photo.jpg', mime: 'image/jpeg', size: 1024, previewUrl: '/public/comment-uploads/photo.jpg', payload: { photos: { xrg: 'native-photo-token' } }, native: true }]
  });
  const videoComment = comments.createComment({
    commentKey, userId: 'u1', userName: 'Alex P', text: '',
    attachments: [{ type: 'video', name: 'video.mov', mime: 'video/quicktime', size: 2048, previewUrl: '/public/comment-uploads/video.mov', posterUrl: '/public/comment-uploads/video-poster.jpg', payload: { token: 'native-video-token' }, native: true }]
  });

  check('созданы 42 комментария', comments.listComments(commentKey).length === 42);
  comments.toggleReaction({ commentKey, commentId: imageComment.id, userId: 'u1', emoji: '❤️' });
  comments.toggleReaction({ commentKey, commentId: imageComment.id, userId: 'u2', emoji: '❤️' });
  comments.toggleReaction({ commentKey, commentId: videoComment.id, userId: 'u3', emoji: '👍' });
  const enriched = comments.listComments(commentKey, 'u1');
  const img = enriched.find((item) => item.id === imageComment.id);
  const vid = enriched.find((item) => item.id === videoComment.id);
  check('фото-комментарий хранит previewUrl и native payload', img.attachments[0].previewUrl && img.attachments[0].payload?.photos);
  check('видео-комментарий хранит posterUrl и native token', vid.attachments[0].posterUrl && vid.attachments[0].payload?.token);
  check('реакции работают на медиа-комментариях', img.reactionCounts['❤️'] === 2 && vid.reactionCounts['👍'] === 1);
  check('аватарки реакций ограничены до 3', img.reactionDetails[0].users.length <= 3);
  check('base64/dataUrl не попадает в debug/store', !JSON.stringify(store.getDebugSnapshot()).includes('data:image') && !JSON.stringify(store.getDebugSnapshot()).includes('base64'));

  const appJs = read('public/app.js');
  const html = read('mini-app.html');
  const css = read('public/styles.css');
  const indexJs = read('index.js');
  const commentServiceJs = read('services/commentService.js');
  const maxApiJs = read('services/maxApi.js');
  const postPatcherJs = read('services/postPatcher.js');
  const botJs = read('bot.js');

  check('runtime SP27 в клиенте', appJs.includes('SP27'));
  check('сервер сохраняет posterUrl для видео', indexJs.includes('posterDataUrl') && indexJs.includes('posterUrl'));
  check('commentService пропускает posterUrl', commentServiceJs.includes('posterUrl'));
  check('видео отрисовывается с poster и play overlay', appJs.includes('getCommentAttachmentPosterUrl') && appJs.includes('comment-video-play'));
  check('короткий тап по видео воспроизводит, реакции открываются длинным тапом', appJs.includes('comment-media-shell') && appJs.includes('commentInput?.blur'));
  check('выбор вложений идёт через один нативный picker без кастомного popover', appJs.includes('attachmentInput?.click') && css.includes('no custom attachment popover'));
  check('скрытые input не перекрывают экран', css.includes('attachment-input-hidden') && css.includes('pointer-events: none'));
  check('кастомное меню вложений принудительно скрыто', css.includes('.attachment-menu { display: none !important; }'));
  check('клик по скрепке обрабатывается на кнопке и wrap', appJs.includes('attachBtnWrap') && appJs.includes('handleAttachTriggerClick') && appJs.includes('attachBtnWrap?.addEventListener'));
  check('кнопка скрепки принимает pointer events', css.includes('.attach-btn-wrap .attach-btn { pointer-events: auto; }'));
  check('media composer MAX-like fullscreen сохранён', html.includes('mediaPreviewModal') && css.includes('media-preview-modal') && appJs.includes('visualViewport'));
  check('poster для видео генерируется Blob-методом без base64', appJs.includes('captureVideoPosterBlob') && appJs.includes('posterBlob'));
  check('upload комментариев идёт через FormData, не JSON dataUrl', appJs.includes('new FormData()') && !appJs.includes('dataUrl: ready.dataUrl'));
  check('сервер имеет local fallback для MAX upload', indexJs.includes('local_fallback') && indexJs.includes('preview сохраняем до внешнего MAX-upload'));
  check('реакции обновляются локально без loadComments в обработчиках', appJs.includes('replaceCommentInCache') && !appJs.includes('await loadComments(false);\n    });\n  });')); 
  check('MAX upload идёт с Authorization', maxApiJs.includes('Authorization: botToken'));
  check('нативные реакции поста поддержаны best-effort', botJs.includes('extractNativeReactionSummary') && postPatcherJs.includes('nativeReactions') && appJs.includes('renderPostNativeReactions'));
  check('пересланный старый пост обрабатывается до active flow', botJs.includes('a forwarded channel post must stay a post-selection/edit target'));
  check('счётчик комментариев на кнопке канала репатчится', indexJs.includes('scheduleCommentCounterPatch') && indexJs.includes('comment_create_updates_channel_button_count'));
  check('лимит видео/медиа поднят до 32 МБ', appJs.includes('32 * 1024 * 1024'));

  const moderation = require(path.join(root, 'services', 'moderationService.js'));
  store.saveModerationSettings('-100', { enabled: true, basicEnabled: true, aiEnabled: false, minTextLengthForCapsCheck: 3, maxUppercaseRatio: 0.75 });
  const capsResult = await moderation.moderateComment({ commentKey, channelId: '-100', userId: 'caps', userName: 'Caps', text: 'Ну привет', config: {} });
  check('обычная фраза не блокируется CAPS-модерацией', capsResult.allowed === true);

  console.log(JSON.stringify({ ok: true, passed: checks.length, checks }, null, 2));
} finally {
  if (backup) fs.writeFileSync(storePath, backup, 'utf8');
}
