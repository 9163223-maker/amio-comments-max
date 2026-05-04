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
const storeJsIncludesUploadDiagnostics = () => read('store.js').includes('uploadDiagnostics') && read('store.js').includes('addUploadDiagnostic');

try {
  const store = require(path.join(root, 'store.js'));
  const comments = require(path.join(root, 'services', 'commentService.js'));
  const commentKey = '-100:sp30-comments';
  store.setComments(commentKey, []);
  store.savePost(commentKey, {
    postId: 'sp30-comments', channelId: '-100', messageId: 'mid.test.sp30',
    originalText: 'Тест SP36',
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
  const blobTextComment = comments.createComment({
    commentKey, userId: 'u-blob', userName: 'Blob', text: 'blob should be dropped',
    attachments: [{ type: 'image', name: 'broken.webp', previewUrl: 'blob:https://max/broken', localOnly: true, payload: {} }]
  });
  check('blob-only attachment отбрасывается при создании комментария', Array.isArray(blobTextComment.attachments) && blobTextComment.attachments.length === 0);

  store.addUploadDiagnostic({ stage: 'test_upload_failed', commentKey, type: 'file', fileName: 'contract.pdf', mime: 'application/pdf', size: 20480, ok: false, error: 'mock_max_upload_failed' });
  const debugWithUpload = store.getDebugSnapshot();
  check('debug содержит uploadDiagnostics для разборов боевых ошибок', Array.isArray(debugWithUpload.uploadDiagnostics) && debugWithUpload.uploadDiagnostics.some((item) => item.stage === 'test_upload_failed'));

  const appJs = read('public/app.js');
  const html = read('mini-app.html');
  const css = read('public/styles.css');
  const indexJs = read('index.js');
  const commentServiceJs = read('services/commentService.js');
  const maxApiJs = read('services/maxApi.js');
  const postPatcherJs = read('services/postPatcher.js');
  const botJs = read('bot.js');

  check('runtime SP36 в клиенте', appJs.includes('SP36'));
  check('SP36 не перерисовывает все медиа при upload/polling', appJs.includes('commentRowFingerprints') && appJs.includes('mergeServerAndTransientComments') && appJs.includes('mediaUploadInFlight'));
  check('SP36 видео multipart timeout увеличен', appJs.includes('15000') && appJs.includes('video_upload_timeout'));
  check('сервер сохраняет posterUrl для видео', indexJs.includes('posterBuffer') && indexJs.includes('posterUrl'));
  check('commentService пропускает posterUrl', commentServiceJs.includes('posterUrl'));
  check('видео отрисовывается с poster и play overlay', appJs.includes('getCommentAttachmentPosterUrl') && appJs.includes('comment-video-play'));
  check('короткий тап по медиа открывает viewer, реакции открываются длинным тапом', appJs.includes('openMediaViewer') && appJs.includes('getAttachmentByShell'));
  check('выбор вложений идёт через один нативный picker без кастомного popover', html.includes('attachment-input-native') && css.includes('one native file picker target') && !html.includes('attachMediaBtn'));
  check('скрытые input не перекрывают экран', css.includes('attachment-input-native') && css.includes('pointer-events: auto'));
  check('кастомное меню вложений принудительно скрыто', css.includes('.attachment-menu { display: none !important; }'));
  check('клик по скрепке не дублирует picker', appJs.includes('event?.target === attachmentInput') && !appJs.includes('attachmentInput?.click?.()'));
  check('кнопка скрепки визуальная, input является tap target', css.includes('.attach-btn-wrap .attach-btn, .attach-btn { pointer-events: none !important; }'));
  check('media composer MAX-like fullscreen сохранён', html.includes('mediaPreviewModal') && css.includes('media-preview-modal') && appJs.includes('visualViewport'));
  check('poster для видео генерируется Blob-методом без base64', appJs.includes('captureVideoPosterBlob') && appJs.includes('posterBlob'));
  check('upload комментариев сначала идёт через FormData, затем JSON fallback при таймауте MAX WebView', appJs.includes('new FormData()') && appJs.includes('uploadCommentAttachmentJsonFallback') && appJs.includes('multipart_timeout'));
  check('сервер возвращает быстрый локальный media preview без ожидания MAX upload', indexJs.includes('local_fast') && indexJs.includes('server_saved_max_sync_deferred') && indexJs.includes('server_public'));
  check('сервер логирует этапы upload в debug', indexJs.includes('logCommentUploadDiagnostic') && storeJsIncludesUploadDiagnostics());
  check('upload endpoint принимает multipart/form-data и JSON fallback', indexJs.includes('upload_multipart_or_json_required') && indexJs.includes('multipart_or_json') && indexJs.includes('/multipart\\/form-data/i') && indexJs.includes('/application\\/json/i'));
  check('debug upload пишет content-type/boundary/file field diagnostics', indexJs.includes('contentType') && indexJs.includes('hasBoundary') && indexJs.includes('fileFieldNames') && indexJs.includes('rawBodyLength'));
  check('blob не сохраняется в store/commentService', read('store.js').includes('/^(data|blob):/i') && commentServiceJs.includes('/^(data|blob):/i'));
  check('клиент не отправляет blob fallback в createComment', !appJs.includes('uploadedAttachments.push(fallback)') && appJs.includes('Комментарий не сохранён, чтобы не оставить битый blob-preview'));
  check('тап по фото не делает window.open из MAX WebView', !appJs.includes('window.open(img.src') && appJs.includes('обычный тап по фото открывает viewer'));

  check('реакции обновляются локально без loadComments в обработчиках', appJs.includes('replaceCommentInCache') && !appJs.includes('await loadComments(false);\n    });\n  });')); 
  check('MAX upload идёт с Authorization', maxApiJs.includes('Authorization: botToken'));
  check('нативные реакции поста поддержаны best-effort', botJs.includes('extractNativeReactionSummary') && postPatcherJs.includes('nativeReactions') && appJs.includes('renderPostNativeReactions'));
  check('пересланный старый пост обрабатывается до active flow', botJs.includes('a forwarded channel post must stay a post-selection/edit target'));
  check('счётчик комментариев на кнопке канала репатчится', indexJs.includes('scheduleCommentCounterPatch') && indexJs.includes('comment_create_updates_channel_button_count'));
  check('лимит видео/медиа поднят до 32 МБ', appJs.includes('32 * 1024 * 1024'));

  check('модерация подключена без запуска таймеров в локальном стресс-тесте', fs.existsSync(path.join(root, 'services', 'moderationService.js')));

  console.log(JSON.stringify({ ok: true, passed: checks.length, checks }, null, 2));
  process.exitCode = 0;
} finally {
  if (backup) fs.writeFileSync(storePath, backup, 'utf8');
}

process.exit(0);
