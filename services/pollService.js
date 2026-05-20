'use strict';

const db = require('../cc5-db-core');
const RUNTIME = 'ADMINKIT-POLL-SERVICE-1.7-DROP-LEGACY-FK';
let ensured = null;

function clean(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
function cut(v,n){ const s=clean(v); return s.length>n ? s.slice(0, Math.max(0,n-1)).trim()+'…' : s; }
function countText(n){ n=Number(n||0); if(!Number.isFinite(n)||n<0)n=0; return n>9999?'9999':String(Math.floor(n)); }
function percentText(n){ n=Number(n||0); if(!Number.isFinite(n)||n<0)n=0; return n>100?'100':String(Math.round(n)); }
function questionLabel(q,total){ const suffix=' · '+countText(total), max=64; return cut('🗳 '+cut(q, Math.max(8,max-suffix.length-3)), max-suffix.length)+suffix; }
function idFromText(v,i){ const b=clean(v).toLowerCase().replace(/[^a-zа-я0-9]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,18); return (b || ('o'+(i+1)))+'_'+(i+1); }
function pollNumber(v){ const n=Number(v||0); return Number.isFinite(n) && n>0 ? Math.floor(n) : 0; }

async function raw(sql,params=[]){ await db.init(); return db.query(sql,params); }
async function q(sql,params=[]){ await ensure(); return db.query(sql,params); }

async function ensure(){
  if(ensured) return ensured;
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
    for(const m of [
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
    ]) await raw(m);

    await raw(`create table if not exists ak_poll_votes(
      poll_id bigint not null,
      user_id text not null default '',
      option_id text not null default '',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      primary key(poll_id,user_id)
    )`);

    // Старые экспериментальные сборки могли создать внешние ключи на option_id как bigint.
    // Сейчас option_id — стабильный текстовый id варианта (_1, _2, gore_1 и т.п.), поэтому legacy FK нужно снять до миграции типа.
    await raw(`do $$
    declare r record;
    begin
      if to_regclass('public.ak_poll_votes') is not null then
        for r in
          select conname from pg_constraint
          where conrelid = 'public.ak_poll_votes'::regclass and contype = 'f'
        loop
          execute 'alter table public.ak_poll_votes drop constraint if exists ' || quote_ident(r.conname);
        end loop;
      end if;
    end $$`);

    await raw("alter table ak_poll_votes alter column user_id type text using user_id::text");
    await raw("alter table ak_poll_votes alter column option_id type text using option_id::text");
    await raw("alter table ak_poll_votes alter column poll_id type bigint using nullif(poll_id::text,'')::bigint");
    for(const m of [
      "alter table ak_poll_votes alter column user_id set default ''",
      "alter table ak_poll_votes alter column option_id set default ''",
      "alter table ak_poll_votes alter column created_at set default now()",
      "alter table ak_poll_votes alter column updated_at set default now()",
      "create index if not exists ak_poll_votes_poll_idx on ak_poll_votes(poll_id,updated_at desc)"
    ]) await raw(m);
    return {ok:true,runtimeVersion:RUNTIME};
  })().catch(e=>{ensured=null;throw e;});
  return ensured;
}

function normalizeOptions(list=[]){
  return (Array.isArray(list)?list:[]).map((x,i)=>{
    const text=typeof x==='string'?clean(x):clean(x&&x.text||x&&x.label||'');
    const id=typeof x==='object'&&x&&x.id?clean(x.id).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24):idFromText(text,i);
    return {id:id||('o'+(i+1)),text:cut(text,48)};
  }).filter(x=>x.text).slice(0,4);
}
function parseOptionsText(text){ const raw=String(text||'').replace(/\r/g,'\n'); const parts=raw.includes('\n')?raw.split('\n'):raw.split(/[;|]/g); return normalizeOptions(parts.map(x=>x.replace(/^[-•*\d.)\s]+/,'').trim()).filter(Boolean)); }
function optionsFor(t){ t=clean(t||'yes_no'); if(t==='like_dislike')return normalizeOptions(['👍 Нравится','👎 Не нравится']); if(t==='three')return normalizeOptions(['1 вариант','2 вариант','3 вариант']); return normalizeOptions(['Да','Нет']); }
function questionFor(t,title){ const name=cut(title||'этот пост',80); if(t==='like_dislike')return 'Как вам пост: '+name+'?'; if(t==='three')return 'Выберите вариант по посту: '+name; return 'Полезен ли пост: '+name+'?'; }

async function createPoll({adminId='',channelId='',postId='',commentKey='',question='',options=[],template='custom'}={}){
  const ch=clean(channelId), post=clean(postId), ck=clean(commentKey)||(ch&&post?ch+':'+post:'');
  const qText=cut(question,220), opts=normalizeOptions(options);
  if(!ch||!post) return {ok:false,error:'post_required'};
  if(qText.length<3) return {ok:false,error:'question_required'};
  if(opts.length<2) return {ok:false,error:'at_least_two_options_required'};
  await q("update ak_polls set status='archived',updated_at=now() where channel_id=$1 and post_id=$2 and status='active'",[ch,post]);
  const r=await q("insert into ak_polls(admin_id,channel_id,post_id,comment_key,question,options,status,template,created_at,updated_at) values($1,$2,$3,$4,$5,$6::jsonb,'active',$7,now(),now()) returning *",[clean(adminId),ch,post,ck,qText,JSON.stringify(opts),clean(template||'custom')]);
  return {ok:true,poll:r.rows[0]};
}
async function createQuickPoll(args={}){ return createPoll({...args,question:questionFor(args.template,args.postTitle),options:optionsFor(args.template)}); }
async function activePoll({channelId='',postId='',commentKey=''}={}){
  const ch=clean(channelId), post=clean(postId), ck=clean(commentKey); let r;
  if(ch&&post) r=await q("select * from ak_polls where channel_id=$1 and post_id=$2 and status='active' order by updated_at desc limit 1",[ch,post]);
  else if(ck) r=await q("select * from ak_polls where comment_key=$1 and status='active' order by updated_at desc limit 1",[ck]);
  else return null;
  return r.rows[0]||null;
}
async function summary(pollId){
  const id=pollNumber(pollId); if(!id) return null;
  const pr=await q('select * from ak_polls where id=$1 limit 1',[id]);
  const poll=pr.rows[0]; if(!poll) return null;
  const opts=normalizeOptions(poll.options);
  const cr=await q('select option_id,count(*)::int n from ak_poll_votes where poll_id=$1 group by option_id',[id]);
  const counts={}; for(const row of cr.rows||[]) counts[clean(row.option_id)]=Number(row.n||0);
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  return {pollId:id,question:clean(poll.question),commentKey:clean(poll.comment_key),channelId:clean(poll.channel_id),postId:clean(poll.post_id),total,options:opts.map(o=>({id:clean(o.id),text:clean(o.text),votes:counts[clean(o.id)]||0,percent:total?Math.round(((counts[clean(o.id)]||0)/total)*100):0}))};
}
async function vote({pollId='',optionId='',userId=''}={}){
  const id=pollNumber(pollId), opt=clean(optionId), uid=clean(userId);
  if(!id||!opt||!uid) return {ok:false,error:'vote_payload_missing'};
  const s=await summary(id); if(!s) return {ok:false,error:'poll_not_found'};
  if(!s.options.some(o=>o.id===opt)) return {ok:false,error:'option_not_found'};
  await q("insert into ak_poll_votes(poll_id,user_id,option_id,created_at,updated_at) values($1::bigint,$2::text,$3::text,now(),now()) on conflict(poll_id,user_id) do update set option_id=excluded.option_id,updated_at=now()",[id,uid,opt]);
  return {ok:true,summary:await summary(id)};
}
function buttonPayload(action,data){ if(action==='poll_vote') return `pv:${data.pollId}:${data.optionId}`; if(action==='poll_info') return `pi:${data.pollId}`; return JSON.stringify(Object.assign({action},data||{})); }
function optionLabel(o){ const suffix=` · ${percentText(o.percent)}% (${countText(o.votes)})`; return `${cut(o.text,Math.max(8,64-suffix.length))}${suffix}`; }
function adaptiveOptionRows(options,total,pollId,commentKey){
  const buttons=options.map(o=>({type:'callback',text:cut(optionLabel(o),64),payload:buttonPayload('poll_vote',{pollId,optionId:o.id,commentKey})}));
  const compact=buttons.length<=4&&buttons.every(b=>clean(b.text).length<=26);
  if(!compact) return buttons.map(b=>[b]);
  const rows=[]; for(let i=0;i<buttons.length;i+=2) rows.push(buttons.slice(i,i+2)); return rows;
}
async function buildPollKeyboardRows({channelId='',postId='',commentKey=''}={}){
  const poll=await activePoll({channelId,postId,commentKey}); if(!poll) return [];
  const s=await summary(poll.id); if(!s) return [];
  const rows=[[{type:'callback',text:questionLabel(s.question,s.total),payload:buttonPayload('poll_info',{pollId:s.pollId,commentKey:s.commentKey})}]];
  rows.push(...adaptiveOptionRows(s.options,s.total,s.pollId,s.commentKey));
  return rows;
}
async function status(){ await ensure(); const a=await q('select count(*)::int n from ak_polls'), b=await q('select count(*)::int n from ak_poll_votes'); return {ok:true,runtimeVersion:RUNTIME,counts:{polls:a.rows[0].n,votes:b.rows[0].n}}; }
module.exports={RUNTIME,ensure,createPoll,createQuickPoll,parseOptionsText,normalizeOptions,activePoll,summary,vote,buildPollKeyboardRows,status,info:()=>({runtimeVersion:RUNTIME,backend:'postgres-custom-callback-polls-drop-legacy-fk'})};
