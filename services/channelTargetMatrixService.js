'use strict';

const picker = require('../channel-post-picker-core');
const menu = require('../features/menu-v3/adapter');
const runtimeExport = require('./runtimeExportService');

const DEFAULT_PATH = 'runtime/channel-target-matrix.json';
const POST_TARGETS = ['comments', 'gifts', 'buttons', 'polls', 'highlights', 'editor', 'stats'];
const FORBIDDEN_TITLES = ['Все свои MAX', 'Саша - сын Мамочки 🌸'];
function clean(v){return String(v||'').trim();}
function textOf(screen){return JSON.stringify(screen||{});}
function fixtureChannels(){return [
  { channelId:'ch-real-1', title:'Настоящий канал', type:'channel', isChannel:true },
  { channelId:'ch-tenant-1', title:'Канал клиента', tenantId:'tenant-1', isChannel:true },
  { channelId:'ch-posts-1', title:'Канал с постами', type:'channel', isChannel:true },
  { chatId:'chat-1', title:'Все свои MAX' },
  { id:'chat-2', title:'Саша - сын Мамочки 🌸', type:'chat' },
  { id:'grp-1', title:'Группа друзей', chatType:'group' },
  { id:'private-1', title:'Личный диалог', kind:'private' },
  { id:'dialog-1', title:'Диалог MAX', sourceType:'dialog' },
  { id:'ambiguous-1', title:'Саша - сын Мамочки 🌸' }
];}
function buildMatrix(channels = fixtureChannels()){
  const safeChannels = channels.filter((c)=>picker.isKnownChannelRecord(c,'matrix-user'));
  const screens = [{ route:'channels:list', screen: menu.render('channels:list',{ channels: safeChannels }) }];
  for (const target of POST_TARGETS) screens.push({ route:`${target}:choose_channel`, screen: menu.render(`${target}:choose_channel`, { channels: safeChannels }) });
  const leaks = [];
  for (const item of screens) {
    const serialized = textOf(item.screen);
    for (const title of FORBIDDEN_TITLES) if (serialized.includes(title)) leaks.push({ route:item.route, value:title });
    for (const raw of channels.filter((c)=>picker.isChatLikeRecord(c)||FORBIDDEN_TITLES.includes(clean(c.title)))) {
      for (const value of [raw.chatId, raw.id].filter(Boolean)) if (serialized.includes(String(value))) leaks.push({ route:item.route, value:String(value) });
    }
  }
  return { ok: leaks.length === 0, runtime:'PR259-CHANNEL-TARGET-MATRIX', generatedAt:new Date().toISOString(), routes:screens.map((s)=>s.route), visibleChannelIds:safeChannels.map((c)=>c.channelId||c.id), forbiddenTitles:FORBIDDEN_TITLES, leaks };
}
async function exportMatrix(){const payload=buildMatrix();return runtimeExport.exportJson({path:DEFAULT_PATH,payload,message:`channel target matrix ${payload.ok?'PASS':'FAIL'}`});}
module.exports={DEFAULT_PATH,POST_TARGETS,FORBIDDEN_TITLES,fixtureChannels,buildMatrix,exportMatrix};
