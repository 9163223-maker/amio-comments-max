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
  { channelId:'ch-tenant-1', title:'Канал клиента', tenantId:'tenant-1', status:'active' },
  { channelId:'ch-posts-1', title:'Канал с постами', type:'channel', isChannel:true },
  { chatId:'chat-1', title:'Все свои MAX' },
  { id:'chat-2', title:'Саша - сын Мамочки 🌸', type:'chat' },
  { id:'grp-1', title:'Группа друзей', chatType:'group' },
  { id:'private-1', title:'Личный диалог', kind:'private' },
  { id:'dialog-1', title:'Диалог MAX', sourceType:'dialog' },
  { id:'ambiguous-1', title:'Саша - сын Мамочки 🌸' },
  { channelId:'chat-channelid-1', title:'Все свои MAX' },
  { channelId:'chat-channelid-2', channelTitle:'Саша - сын Мамочки 🌸', title:'Саша - сын Мамочки 🌸' }
];}
function dangerousRecords(channels){
  return channels.filter((c)=>picker.isChatLikeRecord(c)||FORBIDDEN_TITLES.includes(clean(c.title))||FORBIDDEN_TITLES.includes(clean(c.channelTitle))||(/^chat-|^grp-|^private-|^dialog-|^ambiguous-/i.test(clean(c.id||c.chatId||c.channelId))));
}
function buildMatrix(channels = fixtureChannels()){
  const screens = [{ route:'channels:list', screen: menu.render('channels:list',{ channels }) }];
  for (const target of POST_TARGETS) screens.push({ route:`${target}:choose_channel`, screen: menu.render(`${target}:choose_channel`, { channels }) });
  const leaks = [];
  const dangerous = dangerousRecords(channels);
  for (const item of screens) {
    const serialized = textOf(item.screen);
    for (const title of FORBIDDEN_TITLES) if (serialized.includes(title)) leaks.push({ route:item.route, value:title });
    for (const raw of dangerous) {
      for (const value of [raw.chatId, raw.id, raw.channelId].filter(Boolean)) if (serialized.includes(String(value))) leaks.push({ route:item.route, value:String(value) });
    }
  }
  const visibleChannelIds = channels.filter((c)=>picker.isKnownChannelRecord(c,'matrix-user')).map((c)=>c.channelId||c.id).filter(Boolean);
  return { ok: leaks.length === 0, runtime:'PR259-CHANNEL-TARGET-MATRIX', generatedAt:new Date().toISOString(), routes:screens.map((s)=>s.route), visibleChannelIds, forbiddenTitles:FORBIDDEN_TITLES, leaks };
}
async function exportMatrix(){const payload=buildMatrix();return runtimeExport.exportJson({path:DEFAULT_PATH,payload,message:`channel target matrix ${payload.ok?'PASS':'FAIL'}`});}
module.exports={DEFAULT_PATH,POST_TARGETS,FORBIDDEN_TITLES,fixtureChannels,dangerousRecords,buildMatrix,exportMatrix};
