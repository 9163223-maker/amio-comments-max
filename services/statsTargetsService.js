'use strict';
const store = require('../store');
const tenantScope = require('../tenant-scope');
const clientAccessService = require('./clientAccessService');
const pushConnectedChatsService = require('./pushConnectedChatsService');
const channelPostPicker = require('../channel-post-picker-core');
function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function arr(v){return Array.isArray(v)?v:[];}
function visibleName(x, fallback){const s=clean(x.title||x.channelTitle||x.chatTitle||x.name||x.displayName);return s && !/^-?\d{5,}$/.test(s) ? s : fallback;}
function ownerFields(x={}){return [x.ownerUserId,x.linkedByUserId,x.userId,x.maxUserId,x.createdByUserId,x.adminId,x.updatedByUserId].map(clean).filter(Boolean);}
function tenantForUser(userId){try{return clean(tenantScope.ensureTenantContext(clean(userId)).tenantKey);}catch{return '';}}
function channelPostBoundToUser(channelId,userId){return arr(store.getPostsList&&store.getPostsList()).some(p=>clean(p.channelId)===clean(channelId)&&ownerFields(p).includes(clean(userId)));}
function boundToUser(x,userId,channelId=''){const uid=clean(userId); if(!uid)return false; if(ownerFields(x).includes(uid))return true; const tenant=tenantForUser(uid); if(tenant&&clean(x.tenantKey)===tenant)return true; if(channelId&&channelPostBoundToUser(channelId,uid))return true; return false;}
function destinationType(x={}){return clean(x.type||x.chatType||x.chat_type||x.kind||x.sourceType||x.source_type||x.destinationType||x.destination_type).toLowerCase();}
function explicitChannelId(x={}){return clean(x.channelId||x.channel_id||x.channel?.id||x.channel?.channelId||'');}
function rawChatId(x={}){return clean(x.chatId||x.chat_id||x.chat?.id||x.chat?.chatId||x.requiredChatId||'');}
function channelIdOf(x={}){const explicit=explicitChannelId(x); if(explicit)return explicit; const generic=clean(x.id); if(generic)return generic; const idFromChat=rawChatId(x); const type=destinationType(x); return idFromChat&&(x.isChannel===true||/\bchannel\b/.test(type))?idFromChat:'';}
function knownChannel(x={},userId=''){return channelPostPicker&&typeof channelPostPicker.isKnownChannelRecord==='function'?channelPostPicker.isKnownChannelRecord(x,userId):Boolean(channelIdOf(x));}
function notChatLike(x={}){return !(channelPostPicker&&typeof channelPostPicker.isChatLikeRecord==='function'&&channelPostPicker.isChatLikeRecord(x));}
function trustedSharedChannel(x={}){return Boolean(channelIdOf(x))&&notChatLike(x);}
function channelTarget(c,provider){const id=channelIdOf(c);return {targetKind:'channel',targetId:id,channelId:id,chatId:'',title:visibleName(c,'Канал без названия'),provider};}
function accessChannelsForUser(userId){try{return arr(clientAccessService.getClientChannels&&clientAccessService.getClientChannels(clean(userId)));}catch{return []}}
async function sharedPickerChannelsForUser(userId,config={}){try{const maybe=channelPostPicker&&typeof channelPostPicker.listUiChannelsForUser==='function'?channelPostPicker.listUiChannelsForUser(clean(userId),config||{}):[];return arr(maybe&&typeof maybe.then==='function'?await maybe:maybe);}catch{return []}}
function sharedPickerBoundToUser(c,userId,channelId=''){const uid=clean(userId);const owners=ownerFields(c);if(owners.length&&uid&&!owners.includes(uid)&&!channelPostBoundToUser(channelId,uid))return false;const tenant=tenantForUser(uid);const itemTenant=clean(c.tenantKey||c.tenantId);if(tenant&&itemTenant&&itemTenant!==tenant)return false;return true;}
function listChannelsFromSources(userId,config={},shared=[]){const seen=new Set();const out=[];const add=(c,provider,mode)=>{const id=channelIdOf(c); if(!id||seen.has(id))return; if(mode==='shared'){if(!trustedSharedChannel(c)||!sharedPickerBoundToUser(c,userId,id))return;} else {if(!knownChannel(c,userId))return; if(mode==='bound'&&!boundToUser(c,userId,id))return;} seen.add(id); out.push(channelTarget({...c,channelId:id},provider));}; arr(store.getChannelsList&&store.getChannelsList()).forEach(c=>add(c,'channel_registry','bound')); accessChannelsForUser(userId).forEach(c=>add(c,'client_access','trusted')); arr(shared).forEach(c=>add(c,'channel_post_picker','shared')); return out;}
function listChannels(userId,config={}){return listChannelsFromSources(userId,config,[]);}
async function listChannelsAsync(userId,config={}){return listChannelsFromSources(userId,config,await sharedPickerChannelsForUser(userId,config));}
function chatTarget(c,provider){const id=clean(c.chatId||c.id||c.requiredChatId);return {targetKind:'chat',targetId:id,channelId:'',chatId:id,title:visibleName(c,'Чат без названия'),provider};}
function chatAdder(userId){const providers=[]; const out=[]; const seen=new Set(); const add=(c,provider,requireBinding=true)=>{const id=clean(c.chatId||c.id||c.requiredChatId); if(!id||seen.has(id))return; if(requireBinding&&!boundToUser(c,userId,''))return; seen.add(id); out.push(chatTarget(c,provider));}; return {providers,out,add};}
function listChats(userId, config={}){const a=chatAdder(userId);
  const sources=[['chat_registry',()=>arr(store.getChatsList&&store.getChatsList())],['config_chat_registry',()=>arr(config.chats||config.chatRegistry)]];
  for(const [name,fn] of sources){let list=[]; try{list=fn();}catch{} if(list.length)a.providers.push(name); list.forEach(x=>a.add(x,name,true));}
  return {chats:a.out, providers:a.providers, chatProviderAvailable:a.providers.length>0};}
async function connectedChatsForUser(userId, config={}){try{const r=await pushConnectedChatsService.resolveConnectedChats(clean(userId),{});return arr(r&&r.chats);}catch{return []}}
async function listChatsAsync(userId, config={}){const base=listChats(userId,config);const a=chatAdder(userId);base.chats.forEach(c=>a.add(c,c.provider,false));a.providers.push(...base.providers);const connected=await connectedChatsForUser(userId,config);if(connected.length)a.providers.push('push_connected_chats');connected.forEach(c=>a.add(c,'push_connected_chats',true));return {chats:a.out,providers:[...new Set(a.providers)],chatProviderAvailable:a.providers.length>0};}
function normalizeOverrideTargets(list,kind){return arr(list).map(x=>({targetKind:clean(x.targetKind)||kind,targetId:clean(x.targetId||x.channelId||x.chatId),channelId:clean(x.channelId),chatId:clean(x.chatId),title:visibleName(x,kind==='chat'?'Чат без названия':'Канал без названия'),provider:'override'}));}
function buildResult(userId,channels,chat){const channelProviders=[...new Set(channels.map(c=>c.provider).filter(Boolean))]; const providersUsed=channelProviders.concat(chat.providers); return {ok:true,userId:clean(userId),channels,chats:chat.chats,targets:[...channels,...chat.chats],diagnostics:{providersUsed,channelProviderAvailable:channels.length>0,chatProviderAvailable:chat.chatProviderAvailable,chatProviders:chat.providers,pushSubscriptionsUsedAsStatsChats:false}};}
function listStatsTargetsForUser(userId, config={}){if(config.statsTargetsOverride){const channels=normalizeOverrideTargets(config.statsTargetsOverride.channels,'channel');const chats=normalizeOverrideTargets(config.statsTargetsOverride.chats,'chat');return {ok:true,userId:clean(userId),channels,chats,targets:[...channels,...chats],diagnostics:{providersUsed:['override'],channelProviderAvailable:true,chatProviderAvailable:chats.length>0,chatProviders:['override']}};} return buildResult(userId,listChannels(userId,config),listChats(userId,config));}
async function listStatsTargetsForUserAsync(userId, config={}){if(config.statsTargetsOverride)return listStatsTargetsForUser(userId,config); return buildResult(userId,await listChannelsAsync(userId,config),await listChatsAsync(userId,config));}
module.exports={listStatsTargetsForUser,listStatsTargetsForUserAsync,_private:{boundToUser,channelPostBoundToUser,accessChannelsForUser,connectedChatsForUser,sharedPickerChannelsForUser,trustedSharedChannel}};
