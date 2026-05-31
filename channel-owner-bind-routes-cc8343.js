'use strict';
const config=require('./config');
const channelService=require('./services/channelService');
const titleResolver=require('./channel-title-resolver-cc8340');
const RUNTIME='CC8.3.43-TENANT-CHANNEL-BINDING';
const clean=(v)=>String(v||'').trim();
const arr=(v)=>Array.isArray(v)?v:[];
function noCache(res){res.set({'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0','Pragma':'no-cache','Expires':'0','Surrogate-Control':'no-store'});}
function cid(x={}){return clean(x.channelId||x.id||x.chatId||x.chat_id);}
function ttl(x={}){return clean(x.resolvedChannelTitle||x.channelTitle||x.title||x.channelName||x.chatTitle)||'Канал без названия';}
async function bind({userId='',limit=30,force=true}={}){const uid=clean(userId);const list=arr(channelService.listChannels()).filter(x=>cid(x)).slice(0,Math.max(1,Math.min(Number(limit||30),100)));const results=[];for(const ch of list){const before=clean(ch.linkedByUserId||ch.ownerUserId||'');if(!force&&before)continue;const r=await titleResolver.resolveTitle({botToken:config.botToken,channelId:cid(ch),tenantUserId:uid||before,tenantName:'',force:true});results.push({channelId:cid(ch),title:r&&r.title||ttl(ch),beforeLinkedByUserId:before,afterLinkedByUserId:r&&r.linkedByUserId||'',source:r&&r.source,error:r&&r.error||''});}return{ok:true,runtimeVersion:RUNTIME,userId:uid,scannedChannels:list.length,updatedChannels:results.length,results,channelsAfter:arr(channelService.listChannels()).map(x=>({channelId:cid(x),title:ttl(x),hasPosts:!!x.hasPosts,linkedByUserId:clean(x.linkedByUserId||x.ownerUserId||'')})),safe:true,noCache:true};}
function install(app){if(!app||app.__adminkitChannelOwnerBindRoutes)return app;app.__adminkitChannelOwnerBindRoutes=true;app.get('/debug/channel-owner-bind-live',async(req,res)=>{noCache(res);res.type('application/json').send(JSON.stringify(await bind({userId:req.query.userId||'',limit:req.query.limit||30,force:clean(req.query.force)!=='0'}),null,2));});return app;}
module.exports={RUNTIME,install,bind};
