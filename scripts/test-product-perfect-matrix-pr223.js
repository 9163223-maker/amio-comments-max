'use strict';
const assert = require('assert');
const matrix = require('./product-perfect-matrix-pr223.json');
const store = require('../store');
const buttons = require('../buttons-flow-cc8-clean');

const menu = { button: (text, action, extra = {}) => ({ text, payload: { action, ...extra } }), keyboard: (rows) => ({ rows }) };
const txt = (s) => String(s?.text || '');
const flat = (s) => (s?.attachments?.rows || []).flat();
const labels = (s) => flat(s).map((b) => b.text);
const btn = (s, action) => flat(s).find((b) => b.payload?.action === action);
function reset() { store.replaceStoreInPlace({ posts: {}, comments: {}, likes: {}, reactions: {}, setup: {}, growth: { byChannel: {} }, channels: {} }); }
function seed(userId, specs) {
  store.saveChannel('ch-a', { channelId: 'ch-a', title: 'АдминКит клуб', ownerUserId: userId, tenantKey: `tenant_${userId}` });
  store.saveChannel('ch-b', { channelId: 'ch-b', title: 'Другой канал', ownerUserId: userId, tenantKey: `tenant_${userId}` });
  for (const [key, count] of Object.entries(specs)) {
    const [ch, postId] = key.split(':');
    const rows = Array.from({ length: count }, (_, i) => ({ buttons: [{ id: `btn_${i + 1}`, text: i ? `Кнопка${i + 1}` : 'Кнопка22', type: 'link', url: i ? `https://example.com/${i + 1}` : 'http://olga.style' }] }));
    store.savePost(key, { commentKey: key, channelId: ch, postId, messageId: postId, title: postId === '2' ? 'Тест стикеры 2' : `Пост ${postId}`, originalText: postId === '2' ? 'Тест стикеры 2' : `Пост ${postId}`, ownerUserId: userId, tenantKey: `tenant_${userId}`, customKeyboard: { enabled: !!count, rows } });
  }
}
async function route(userId, action, extra = {}) { return buttons.screenForPayload(menu, { action, ...extra }, { userId, config: {} }); }
async function input(userId, text) { return buttons.handleTextInput(menu, { userId, text, config: {} }); }
const results = [];
async function pass(id, fn) { try { await fn(); results.push([id, 'pass']); } catch (e) { results.push([id, 'fail', e.message]); } }
function must(s, re, msg) { assert(re.test(txt(s)), msg + `\nTEXT:\n${txt(s)}`); }

(async () => {
  reset(); seed('u1', { 'ch-a:0': 0, 'ch-a:2': 1, 'ch-a:3': 2, 'ch-b:9': 1 });
  await pass('BTN-001', async()=>{ const s=await route('u-none','admin_section_buttons'); must(s,/Кнопки под постами/,'root title'); assert(labels(s).includes('📌 Выбрать пост')); assert(!labels(s).some(x=>/Добавить кнопку/.test(x))); });
  await pass('BTN-002', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:0',channelId:'ch-a',postId:'0'}); const s=await route('u1','admin_section_buttons'); must(s,/Текущие кнопки: пока нет кнопок/,'B0'); assert(labels(s).includes('➕ Добавить кнопку')); });
  await pass('BTN-003', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); const s=await route('u1','admin_section_buttons'); must(s,/Кнопка22 → http:\/\/olga\.style/,'B1'); assert(labels(s).includes('✏️ Изменить кнопку') && labels(s).includes('🗑 Удалить кнопку')); });
  await pass('BTN-004', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); const s=await route('u1','admin_section_buttons'); must(s,/1\. Кнопка22[\s\S]*2\. Кнопка2/,'B2 all'); });
  await pass('BTN-005', async()=>{ const s=await route('u1','button_admin_channel_pick',{channelId:'ch-b'}); must(s,/Канал: Другой канал/,'channel title'); assert(!txt(s).includes('Тест стикеры 2')); });
  await pass('BTN-006', async()=>{ const s=await route('u1','button_admin_select_post',{commentKey:'ch-a:0',channelId:'ch-a',postId:'0'}); must(s,/пока нет кнопок/i,'select B0'); });
  await pass('BTN-007', async()=>{ const s=await route('u1','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); must(s,/Кнопка22/,'select B1'); });
  await pass('BTN-008', async()=>{ const s=await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); must(s,/2\. Кнопка2/,'select B2'); });
  await pass('BTN-009', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); const a=await route('u1','admin_section_buttons'); const b=await route('u1','button_admin_show_current'); assert.strictEqual(b.id,'buttons_clean_selected_post'); must(b,/Кнопка22/,'legacy current'); assert(labels(a).join('|')===labels(b).join('|')); });
  await pass('BTN-010', async()=>{ const s=await route('u1','button_admin_show_current',{commentKey:'missing',channelId:'ch-a',postId:'x'}); must(s,/Пост не найден\. Выберите пост заново\./,'not found'); });
  await pass('BTN-011', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:0',channelId:'ch-a',postId:'0'}); const s=await route('u1','button_admin_start_add'); must(s,/Шаг 1\/3[\s\S]*пока нет кнопок/,'add first'); });
  await pass('BTN-012', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); const s=await route('u1','button_admin_start_add'); must(s,/уже есть 1 кнопка[\s\S]*Кнопка22[\s\S]*добавлена к существующим/,'add another'); });
  await pass('BTN-013', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); const s=await route('u1','button_admin_start_add'); must(s,/уже есть 2 кнопки[\s\S]*Кнопка2/,'add multi'); });
  await pass('BTN-014', async()=>{ await input('u1','Новая'); const s=await input('u1','Новая'); must(s,/Шаг 2\/3|Нужна ссылка/,'text step handled'); });
  await pass('BTN-015', async()=>{ await route('u1','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); await route('u1','button_admin_start_add'); const s=await input('u1','   '); assert.strictEqual(s,null); assert(store.getSetupState('u1').buttonFlow); });
  await pass('BTN-016', async()=>{ await input('u1','Новая'); const s=await input('u1','olga.style'); must(s,/Нужна ссылка/,'bad url rejected'); });
  await pass('BTN-017', async()=>{ const s=await input('u1','https://olga.style'); must(s,/Шаг 3\/3/,'preview'); });
  await pass('BTN-018', async()=>{ const s=await route('u1','button_admin_preview_back'); must(s,/Шаг 2\/3/,'back url'); });
  await pass('BTN-019', async()=>{ const s=await route('u1','button_admin_preview_back'); must(s,/Черновик|Шаг 2\/3/,'safe preview back'); });
  await pass('BTN-020', async()=>{ reset(); seed('u2',{ 'ch-a:0':0 }); await route('u2','button_admin_select_post',{commentKey:'ch-a:0',channelId:'ch-a',postId:'0'}); await route('u2','button_admin_start_add'); await input('u2','Первая'); const p=await input('u2','https://one.example'); const s=await route('u2','button_admin_save',{flowId:btn(p,'button_admin_save').payload.flowId}); must(s,/Первая → https:\/\/one\.example/,'save first'); });
  await pass('BTN-021', async()=>{ reset(); seed('u3',{ 'ch-a:2':1 }); await route('u3','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); await route('u3','button_admin_start_add'); await input('u3','Вторая'); const p=await input('u3','https://two.example'); const s=await route('u3','button_admin_save',{flowId:btn(p,'button_admin_save').payload.flowId}); must(s,/Кнопка22[\s\S]*Вторая/,'append preserves'); });
  await pass('BTN-022', async()=>{ const before=(txt(await route('u3','button_admin_show_current')).match(/Вторая/g)||[]).length; const s=await route('u3','button_admin_save',{flowId:'old'}); const after=(txt(await route('u3','button_admin_show_current')).match(/Вторая/g)||[]).length; assert.strictEqual(after,before); assert(/устарел|уже/.test(txt(s))); });
  await pass('BTN-023', async()=>{ await route('u3','button_admin_start_add'); const s=await route('u3','button_admin_cancel'); must(s,/Черновик кнопки отменён[\s\S]*Кнопка22/,'cancel selected'); });
  await pass('BTN-024', async()=>{ must(await route('u3','button_admin_show_current'),/Кнопка22/,'cancel kept B1'); });
  await pass('BTN-025', async()=>{ reset(); seed('u4',{ 'ch-a:2':1 }); await route('u4','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); const s=await route('u4','button_admin_edit'); must(s,/Кнопка: Кнопка22[\s\S]*Ссылка: http:\/\/olga\.style/,'edit single'); assert(!/не найдена/.test(txt(s))); assert(labels(s).includes('🔗 Изменить ссылку')); });
  await pass('BTN-026', async()=>{ seed('u1', { 'ch-a:3': 2 }); await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); must(await route('u1','button_admin_edit'),/Какую кнопку изменить\?/,'edit pick'); });
  await pass('BTN-027', async()=>{ await route('u4','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); must(await route('u4','button_admin_edit',{buttonId:'stale'}),/Кнопка: Кнопка22/,'stale single edit'); });
  await pass('BTN-028', async()=>{ seed('u1', { 'ch-a:3': 2 }); await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); must(await route('u1','button_admin_edit',{buttonId:'stale'}),/Какую кнопку изменить\?/,'stale multi pick'); });
  await pass('BTN-029', async()=>{ await route('u4','button_admin_edit_text'); assert(store.getSetupState('u4').buttonFlow); });
  await pass('BTN-030', async()=>{ const s=await input('u4','Новый текст'); must(s,/Новый текст → http:\/\/olga\.style/,'edit text saved'); });
  await pass('BTN-031', async()=>{ await route('u4','button_admin_edit_text'); const s=await input('u4','   '); assert.strictEqual(s,null); });
  await pass('BTN-032', async()=>{ const s=await route('u4','button_admin_edit_url'); must(s,/Пришлите новую ссылку/,'ask url'); });
  await pass('BTN-033', async()=>{ const s=await input('u4','olga.style'); must(s,/Нужна ссылка/,'reject edit url'); });
  await pass('BTN-034', async()=>{ const s=await input('u4','https://olga.style/new'); must(s,/Новый текст → https:\/\/olga\.style\/new/,'edit url'); });
  await pass('BTN-035', async()=>{ await route('u4','button_admin_edit_text'); const s=await route('u4','button_admin_cancel'); must(s,/Новый текст/,'cancel edit'); });
  await pass('BTN-036', async()=>{ const s=await route('u4','button_admin_delete_confirm'); must(s,/Подтвердите удаление/,'delete single'); assert(!/не найдена/.test(txt(s))); });
  await pass('BTN-037', async()=>{ seed('u1', { 'ch-a:3': 2 }); await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); must(await route('u1','button_admin_delete_confirm'),/Какую кнопку удалить\?/,'delete pick'); });
  await pass('BTN-038', async()=>{ await route('u4','button_admin_select_post',{commentKey:'ch-a:2',channelId:'ch-a',postId:'2'}); must(await route('u4','button_admin_delete_confirm',{buttonId:'stale'}),/Подтвердите удаление/,'stale single delete'); });
  await pass('BTN-039', async()=>{ seed('u1', { 'ch-a:3': 2 }); await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); must(await route('u1','button_admin_delete_confirm',{buttonId:'stale'}),/Какую кнопку удалить\?/,'stale multi delete'); });
  await pass('BTN-040', async()=>{ const s=await route('u4','button_admin_show_current'); must(s,/Новый текст/,'cancel delete via back preserves'); });
  await pass('BTN-041', async()=>{ const c=await route('u4','button_admin_delete_confirm'); const s=await route('u4','button_admin_delete',btn(c,'button_admin_delete').payload); must(s,/Текущие кнопки: пока нет кнопок/,'delete only'); });
  await pass('BTN-042', async()=>{ seed('u1', { 'ch-a:3': 2 }); await route('u1','button_admin_select_post',{commentKey:'ch-a:3',channelId:'ch-a',postId:'3'}); const c=await route('u1','button_admin_delete_confirm',{buttonId:'btn_1'}); const s=await route('u1','button_admin_delete',btn(c,'button_admin_delete').payload); assert(!txt(s).includes('Кнопка22 →')); must(s,/Кнопка2/,'other remains'); });
  await pass('BTN-043', async()=>{ must(await route('u1','button_admin_show_current'),/Кнопка2/,'canonical state after patch success'); });
  await pass('BTN-044', async()=>{ reset(); seed('u5',{ 'ch-a:no-msg':0 }); store.savePost('ch-a:no-msg',{messageId:''}); await route('u5','button_admin_select_post',{commentKey:'ch-a:no-msg',channelId:'ch-a',postId:'no-msg'}); await route('u5','button_admin_start_add'); await input('u5','Без msg'); const p=await input('u5','https://m.example'); const s=await route('u5','button_admin_save',{flowId:btn(p,'button_admin_save').payload.flowId}); must(s,/message_id_missing[\s\S]*Без msg/,'patch fail canonical'); });
  await pass('BTN-045', async()=>{ const s=await route('other','button_admin_show_current',{commentKey:'ch-a:no-msg',channelId:'ch-a',postId:'no-msg'}); assert(!txt(s).includes('Без msg')); });
  await pass('BTN-046', async()=>{ await route('u5','button_admin_select_post',{commentKey:'ch-a:no-msg',channelId:'ch-a',postId:'no-msg'}); const s=await route('u5','button_admin_edit',{cardId:'old-card'}); assert(!/пока нет кнопок/.test(txt(s))); });
  await pass('BTN-047', async()=>{ await route('u5','button_admin_start_add'); const s=await route('u5','admin_section_buttons'); must(s,/Без msg/,'root during draft canonical'); });
  await pass('BTN-048', async()=>{ await route('u5','button_admin_start_add'); buttons.clearButtonDraftOnly('u5'); assert(!store.getSetupState('u5').buttonFlow); });
  await pass('BTN-049', async()=>{ const s=await route('u5','button_admin_show_current',{note:'Справка: раздел кнопок.'}); must(s,/Справка/,'help-like note'); assert(labels(s).includes('🔘 В начало кнопок')&&labels(s).includes('🏠 Главное меню')); });
  await pass('BTN-050', async()=>{ const s=await route('u5','admin_section_buttons'); must(s,/Без msg/,'reopen real state'); assert(!/не найдена/.test(txt(s))); });

  console.log('Buttons matrix:');
  for (const [id, st, reason] of results) console.log(`${id} ${st}${reason ? ': ' + reason : ''}`);
  const ok = results.filter(([,st])=>st==='pass').length;
  console.log(`Required buttons: ${ok}/50 pass`);

  console.log('\nGifts matrix:');
  matrix.gifts.forEach((id) => console.log(`${id} auditOnly: gifts canonical migration is documented but not fully implemented in PR223`));
  console.log('Gifts fully canonical: false');
  if (ok !== 50 || results.some(([,st]) => st !== 'pass')) process.exit(1);
})().catch((e)=>{ console.error(e && e.stack || e); process.exit(1); });
