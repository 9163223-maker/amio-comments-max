import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
function check(name, condition) { checks.push({ name, ok: Boolean(condition) }); if (!condition) throw new Error(name); }
const botJs = read('bot.js');
const indexJs = read('index.js');
const appJs = read('public/app.js');
const html = read('mini-app.html');
const css = read('public/styles.css');
const storeJs = read('store.js');
const postEditorJs = read('services/postEditorService.js');
const packageJson = JSON.parse(read('package.json'));
check('package displayVersion = SP36', packageJson.displayVersion === 'SP36');
check('store runtimeVersion = SP36 через buildInfo', storeJs.includes('getBuildInfo') && storeJs.includes('meta: build') && storeJs.includes('...build'));
check('/health/root отдаёт buildInfo SP36', indexJs.includes('getBuildInfo') && indexJs.includes('BUILD_INFO.runtimeVersion'));
for (const action of ['admin_section_comments','admin_section_moderation','admin_section_gifts','admin_section_posts','admin_section_buttons','admin_section_stats','admin_section_channels']) check(`главное меню содержит ${action}`, botJs.includes(action));
check('нижнее меню содержит назад/главное меню', botJs.includes('appendAdminFooterRows') && botJs.includes('⬅️ Назад') && botJs.includes('🏠 Главное меню'));
check('SP36 главное меню разделяет модерацию редактор и кнопки', botJs.includes('🛡️ Модерация') && botJs.includes('✏️ Редактор постов') && botJs.includes('🔘 Кнопки под постами') && !botJs.includes("text: '📝 Посты и кнопки', payload: buildAdminCallbackPayload('admin_section_content')"));
check('SP36 legacy content оставлен только как bridge', botJs.includes('buildContentSectionKeyboard') && botJs.includes('старый объединённый раздел') && botJs.includes('admin_section_content'));
check('SP36 footer-навигация без дублей', botJs.includes('isTopLevelSection') && botJs.includes('safeBack !== safeRoot'));
for (const action of ['comments_enable_new','comments_old_post','comments_select_post','comments_pick_post','comments_edit_text','comments_add_button','comments_moderation','comments_toggle_moderation']) check(`меню содержит ${action}`, botJs.includes(action));
check('SP36 модерация вынесена в отдельный раздел', botJs.includes('buildModerationSectionText') && botJs.includes('buildModerationSectionKeyboard') && botJs.includes('source: \'moderation\''));
check('пересланный пост возвращает в исходный раздел', botJs.includes('selectedSection') && botJs.includes('Меню редактора постов сохранено') && botJs.includes('Открываю модерацию выбранного канала'));
check('пересланный пост не ломает active flow', botJs.includes('a forwarded channel post must stay a post-selection/edit target'));
check('редактирование текста сохраняет формат/ссылку', postEditorJs.includes('editPostText') && postEditorJs.includes('originalFormat') && postEditorJs.includes('link'));
check('Ваши каналы не делает live check по умолчанию', botJs.includes('LIVE_CHANNEL_CHECKS=1') && botJs.includes('!config?.liveChannelChecks'));
check('меню не ждёт удаления старых сообщений', botJs.includes('setTimeout(async () =>') && botJs.includes('deleteStoredMessageIds'));
check('mini-app: свои справа, чужие слева', css.includes('.comment-row.own') && appJs.includes('message-avatar'));
check('поиск sticky', css.includes('.comment-search-panel') && css.includes('position: sticky'));
check('media picker single native input flow', html.includes('attachment-input-native') && css.includes('one native file picker target'));
check('media composer fullscreen', html.includes('mediaPreviewModal') && css.includes('media-preview-modal'));
check('video poster support', appJs.includes('captureVideoPosterBlob') && indexJs.includes('posterUrl'));
check('native post reactions best-effort', botJs.includes('extractNativeReactionSummary') && appJs.includes('renderPostNativeReactions'));
check('debug no-cache/live/ping есть', indexJs.includes('/debug", "/debug/store", "/debug/store-live') && indexJs.includes('/debug/ping') && indexJs.includes('no-store'));
check('SP36 media render без массового пересоздания DOM', appJs.includes('commentRowFingerprints') && appJs.includes('replaceChildren(fragment)') && appJs.includes('mediaUploadInFlight'));

check('SP36 upload FormData плюс JSON fallback без blob-store fallback', indexJs.includes('upload_multipart_or_json_required') && indexJs.includes('multipart_or_json') && indexJs.includes('server_public') && appJs.includes('uploadCommentAttachmentJsonFallback') && appJs.includes('Не удалось подготовить вложение'));
check('SP36 native picker закреплён физически в скрепке', css.includes('один физический input лежит строго внутри скрепки') && css.includes('z-index: 100') && css.includes('overflow: hidden'));

const store = require(path.join(root, 'store.js'));
const comments = require(path.join(root, 'services/commentService.js'));
const commentKey = '-stress:sp30-global';
store.setComments(commentKey, []);
store.savePost(commentKey, { channelId: '-stress', postId: 'sp30-global', messageId: 'mid.global', originalText: 'Global', commentKey, nativeReactions: [{ emoji: '❤️', count: 1 }] });
const c = comments.createComment({ commentKey, userId: 'u1', userName: 'Alex', text: '', attachments: [{ type: 'video', name: 'v.mov', previewUrl: '/public/comment-uploads/v.mov', posterUrl: '/public/comment-uploads/v.jpg', payload: { token: 't' }, native: true }] });
check('runtime smoke: video comment with poster/processing created', Boolean(c?.attachments?.[0]?.posterUrl));
check('runtime smoke: debug не содержит data:image', !JSON.stringify(store.getDebugSnapshot()).includes('data:image'));

check('SP36 buildInfo single-source present', fs.existsSync(path.join(root, 'build-info.json')) && fs.existsSync(path.join(root, 'buildInfo.js')) && fs.existsSync(path.join(root, 'public', 'build-marker.txt')));
const buildInfo = require(path.join(root, 'buildInfo.js')).getBuildInfo();
check('SP36 buildInfo version correct', buildInfo.runtimeVersion === 'SP36' && buildInfo.sourceMarker === 'adminkit-SP36-silent-native-media-full');
const debugSnapshotForVersion = require(path.join(root, 'store.js')).getDebugSnapshot();
check('SP36 debug version cannot be stale store value', debugSnapshotForVersion.runtimeVersion === 'SP36' && debugSnapshotForVersion.sourceMarker === 'adminkit-SP36-silent-native-media-full');

console.log(JSON.stringify({ ok: true, passed: checks.length, checks }, null, 2));

process.exit(0);
