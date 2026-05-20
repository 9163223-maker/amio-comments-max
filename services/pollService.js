'use strict';

const db = require('../cc5-db-core');
const RUNTIME = 'ADMINKIT-POLL-SERVICE-1.0-CALLBACK-POLLS';
let ensured = null;

function clean(v){return String(v||'').replace(/\s+/g,' ').trim();}
function cut(v,n){const s=clean(v);return s.length>n?s.slice(0,n-1).trim()+'…':s;}
async function q(sql,params=[]){await ensure();return db.query(sql,params);}
async function raw(sql,params=[]){await db.init();return db.query(sql,params);}

async function ensure(){
  if(ensured)return ensured;
  ensured=(async()=>{
    await db.init();
    await raw(`create table if not exists ak_polls(
      id bigserial primary key,
      admin_id text not null default '',
      channel_id text not null default '',
      post_id text not null default '',
      comment_key text not null default '',
      question text not null default '',
      options jsonb not null default '[]'::jsonb,
      status text not null default 'active',
      template text not null default 'quick',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    )`);
    const migrations=[
      "alter table ak_polls add column if not exists admin_id text not null default ''",
      "alter table ak_polls add column if not exists channel_id text not null default ''",
      "alter table ak_polls add column if not exists post_id text not null default ''",
      "alter table ak_polls add column if not exists comment_key text not null default ''",
      "alter table ak_polls add column if not exists question text not null default ''",
      "alter table ak_polls add column if not exists options jsonb not null default '[]'::jsonb",
      "alter table ak_polls add column if not exists status text not null default 'active'",
      "alter table ak_polls add column if not exists template text not null default 'quick'",
      "alter table ak_polls add column if not exists created_at timestamptz default now()",
      "alter table ak_polls add column if not exists updated_at timestamptz default now()",
      "create index if not exists ak_polls_post_idx on ak_polls(channel_id,post_id,status,updated_at desc)",
      "create index if not exists ak_polls_comment_idx on ak_polls(comment_key,updated_at desc)"
    ];
    for(const m of migrations)await raw(m);
    await raw(`create table if not exists ak_poll_votes(
      poll_id bigint not null,
      user_id text not null default '',
      option_id text not null default '',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      primary key(poll_id,user_id)
    )`);
    const voteMigrations=[
      "alter table ak_poll_votes add column if not exists poll_id bigint not null default 0",
      "alter table ak_poll_votes add column if not exists user_id text not null default ''",
      "alter table ak_poll_votes add column if not exists option_id text not null default ''",
      "alter table ak_poll_votes add column if not exists created_at timestamptz default now()",
      "alter table ak_poll_votes add column if not exists updated_at timestamptz default now()",
      "create index if not exists ak_poll_votes_poll_idx on ak_poll_votes(poll_id,updated_at desc)"
    ];
    for(const m of voteMigrations)await raw(m);
    return {ok:true,runtimeVersion:RUNTIME};
  })().catch(e=>{ensured=null;throw e;});
  return ensured;
}

function optionsFor(template){
  const t=clean(template||'yes_no');
  if(t==='like_dislike')return [{id:'yes',text:'👍 Нравится'},{id:'no',text:'👎 Не нравится'}];
  if(t==='three')return [{id:'o1',text:'1 вариант'},{id:'o2',text:'2 вариант'},{id:'o3',text:'3 вариант'}];
  return [{id:'yes',text:'Да'},{id:'no',text:'Нет'}];
}
function questionFor(template,title){
  const name=cut(title||'этот пост',80);
  if(template==='like_dislike')return 'Как вам пост: '+name+'?';
  if(template==='three')return 'Выберите вариант по посту: '+name;
  return 'Полезен ли пост: '+name+'?';
}
async function createQuickPoll({adminId='',channelId='',postId='',commentKey='',postTitle='',template='yes_no'}={}){
  const ch=clean(channelId),post=clean(postId),ck=clean(commentKey)||(ch&&post?ch+':'+post:'');
  if(!ch||!post)return {ok:false,error:'post_required'};
  await q("update ak_polls set status='archived',updated_at=now() where channel_id=$1 and post_id=$2 and status='active'",[ch,post]);
  const opts=optionsFor(template);
  const r=await q("insert into ak_polls(admin_id,channel_id,post_id,comment_key,question,options,status,template,created_at,updated_at) values($1,$2,$3,$4,$5,$6::jsonb,'active',$7,now(),now()) returning *",[clean(adminId),ch,post,ck,questionFor(template,postTitle),JSON.stringify(opts),clean(template)]);
  return {ok:true,poll:r.rows[0]};
}
async function activePoll({channelId='',postId='',commentKey=''}={}){
  const ch=clean(channelId),post=clean(postId),ck=clean(commentKey);
  let r;
  if(ch&&post)r=await q("select * from ak_polls where channel_id=$1 and post_id=$2 and status='active' order by updated_at desc limit 1",[ch,post]);
  else if(ck)r=await q("select * from ak_polls where comment_key=$1 and status='active' order by updated_at desc limit 1",[ck]);
  else return null;
  return r.rows[0]||null;
}
function normalizeOptions(v){return Array.isArray(v)?v:[];}
async function summary(pollId){
  const id=Number(pollId||0);if(!id)return null;
  const pr=await q('select * from ak_polls where id=$1 limit 1',[id]);
  const poll=pr.rows[0];if(!poll)return null;
  const opts=normalizeOptions(poll.options);
  const cr=await q('select option_id,count(*)::int n from ak_poll_votes where poll_id=$1 group by option_id',[id]);
  const counts={};for(const row of cr.rows||[])counts[clean(row.option_id)]=Number(row.n||0);
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  return {pollId:id,question:clean(poll.question),commentKey:clean(poll.comment_key),channelId:clean(poll.channel_id),postId:clean(poll.post_id),total,options:opts.map(o=>({id:clean(o.id),text:clean(o.text),votes:counts[clean(o.id)]||0,percent:total?Math.round(((counts[clean(o.id)]||0)/total)*100):0}))};
}
async function vote({pollId='',optionId='',userId=''}={}){
  const id=Number(pollId||0),opt=clean(optionId),uid=clean(userId);
  if(!id||!opt||!uid)return {ok:false,error:'vote_payload_missing'};
  const s=await summary(id);if(!s)return {ok:false,error:'poll_not_found'};
  if(!s.options.some(o=>o.id===opt))return {ok:false,error:'option_not_found'};
  await q("insert into ak_poll_votes(poll_id,user_id,option_id,created_at,updated_at) values($1,$2,$3,now(),now()) on conflict(poll_id,user_id) do update set option_id=excluded.option_id,updated_at=now()",[id,uid,opt]);
  return {ok:true,summary:await summary(id)};
}
function payload(action,data){return JSON.stringify(Object.assign({action},data||{}));}
async function buildPollKeyboardRows({channelId='',postId='',commentKey=''}={}){
  const poll=await activePoll({channelId,postId,commentKey});if(!poll)return [];
  const s=await summary(poll.id);if(!s)return [];
  const rows=[[{type:'callback',text:cut('🗳 '+s.question,64),payload:payload('poll_info',{pollId:s.pollId,commentKey:s.commentKey})}]];
  for(const o of s.options){const label=s.total?`${o.text} · ${o.votes} (${o.percent}%)`:o.text;rows.push([{type:'callback',text:cut(label,64),payload:payload('poll_vote',{pollId:s.pollId,optionId:o.id,commentKey:s.commentKey})}]);}
  return rows;
}
async function status(){await ensure();const a=await q('select count(*)::int n from ak_polls');const b=await q('select count(*)::int n from ak_poll_votes');return {ok:true,runtimeVersion:RUNTIME,counts:{polls:a.rows[0].n,votes:b.rows[0].n}};}
module.exports={RUNTIME,ensure,createQuickPoll,activePoll,summary,vote,buildPollKeyboardRows,status,info:()=>({runtimeVersion:RUNTIME,backend:'postgres-callback-polls'})};
