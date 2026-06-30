'use strict';

const fs = require('fs');
const path = require('path');
const menu = require('../features/menu-v3/adapter');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('./productFlowContractService');
const startupLog = require('./startupLogService');

const DEFAULT_PATH = 'runtime/product-semantic-matrix.json';
const SAMPLE_CHANNEL = { channelId: 'semantic-channel-1', title: 'Семантический канал', channelTitle: 'Семантический канал', type: 'channel', isChannel: true, ownerUserId: 'semantic-user' };
const SAMPLE_POST = { postId: 'semantic-post-1', commentKey: 'semantic-channel-1:semantic-post-1', title: 'Семантический пост', originalText: 'Семантический пост', channelId: 'semantic-channel-1', channelTitle: 'Семантический канал' };

function clean(v){return String(v == null ? '' : v).replace(/\s+/g,' ').trim();}
function buttons(screen){return (screen?.attachments?.[0]?.payload?.buttons || []).flat().filter(Boolean);}
function labels(screen){return buttons(screen).map((b)=>clean(b.text)).filter(Boolean);}
function payloads(screen){return buttons(screen).map((b)=>clean(b.payload)).filter(Boolean);}
function lifecycleCovered(c){const required=Array.isArray(c?.requiredLifecycle)?c.requiredLifecycle:Object.keys(c?.lifecycle||{}); return required.every((step)=>c?.lifecycle?.[step]===true);}
function vio(severity, section, route, scenario, reason, expected, actual, extra={}){return {severity,section,route,scenario,reason,expected,actual,...extra};}
function duplicateTextRisk(screen){const parts=String(screen?.text||'').split(/[\n.]+/).map(clean).filter((x)=>x.length>5); const seen=new Set(); return parts.some((p)=>seen.size===seen.add(p).size);}
function statusFor(sectionViolations, contract){ if(sectionViolations.some((v)=>v.severity==='block')) return 'BLOCK'; if(contract.productReady && lifecycleCovered(contract)) return 'PASS'; return 'PARTIAL'; }
function activeFileText(file){try{return fs.readFileSync(path.join(__dirname,'..',file),'utf8');}catch{return '';}}
function walkFiles(dir, out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name==='node_modules'||entry.name==='.git'||entry.name==='runtime') continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walkFiles(full,out); else if(/\.(?:js|cjs|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}
function menuMultiplicationViolations(){
  const root=path.join(__dirname,'..');
  const active=['clean-entrypoint-1.53.10-pr89.js','features/menu-v3/adapter.js','v3-menu-routes-1539.js','bot.js','pr180-startup-log-bootstrap.js'];
  const legacy=['production-menu-map-v3-fixed','production-menu-v3-renderer'];
  const out=[];
  for(const file of active){const t=activeFileText(file); for(const needle of legacy){ if(/require\([^)]*production-menu-map-v3-fixed|require\([^)]*production-menu-v3-renderer/.test(t)) out.push(vio('block','main',file,'active_runtime_import','legacy_action_bypasses_product_flow_contract','canonical-menu.js only',needle,{remediation:'Remove legacy menu import from active runtime path.'})); }}
  for(const file of walkFiles(root)){
    const rel=path.relative(root,file).replace(/\\/g,'/');
    if(rel.startsWith('scripts/')||rel.startsWith('test')||rel.includes('node_modules')) continue;
    const text=fs.readFileSync(file,'utf8');
    if(/clientVisible\s*:\s*true/.test(text) && !['features/menu-v3/canonical-menu.js'].includes(rel)) out.push(vio('warn','main',rel,'menu_ownership_scan','possible_parallel_client_visible_menu_source','canonical-menu.js owns clientVisible sections',rel,{remediation:'Verify this is not an active parallel menu source.'}));
  }
  return out;
}
function sampleContextFor(id, scenario){
  if(scenario==='zero_channels') return { channels: [], posts: [], dataContext: { channels: [], posts: [] } };
  if(scenario==='multiple_channels') return { channels: [SAMPLE_CHANNEL, { ...SAMPLE_CHANNEL, channelId: 'semantic-channel-2', title: 'Второй канал', channelTitle: 'Второй канал' }], dataContext: { channels: [SAMPLE_CHANNEL] } };
  if(scenario==='zero_posts') return { channels: [SAMPLE_CHANNEL], posts: [], dataContext: { channelId: SAMPLE_CHANNEL.channelId, channelTitle: SAMPLE_CHANNEL.title, posts: [] }, channelId: SAMPLE_CHANNEL.channelId, channelTitle: SAMPLE_CHANNEL.title };
  if(scenario==='selected_post') return { payload: { channelId: SAMPLE_CHANNEL.channelId, channelTitle: SAMPLE_CHANNEL.title, postId: SAMPLE_POST.postId, commentKey: SAMPLE_POST.commentKey, postTitle: SAMPLE_POST.title }, dataContext: { channelId: SAMPLE_CHANNEL.channelId, channelTitle: SAMPLE_CHANNEL.title, posts: [SAMPLE_POST] } };
  return { channels: [SAMPLE_CHANNEL], dataContext: { channels: [SAMPLE_CHANNEL], posts: [SAMPLE_POST], channelId: SAMPLE_CHANNEL.channelId, channelTitle: SAMPLE_CHANNEL.title } };
}
function routeChecksFor(id, contract){
  const checks=[{scenario:'root',route:id==='main'?'main:home':canonical.sectionById[id]?.route, context:{}}];
  if(contract?.requiredContext && String(contract.requiredContext).includes('post')){
    checks.push({scenario:'zero_channels',route:`${id}:choose_channel`,context:sampleContextFor(id,'zero_channels')});
    checks.push({scenario:'multiple_channels',route:`${id}:choose_channel`,context:sampleContextFor(id,'multiple_channels')});
    checks.push({scenario:'zero_posts',route:`${id}:choose_post`,context:sampleContextFor(id,'zero_posts')});
    checks.push({scenario:'selected_post',route:`${id}:post`,context:sampleContextFor(id,'selected_post')});
  }
  if(id==='gifts') checks.push({scenario:'all_gifts_account_scope',route:'gifts:all',context:{}});
  return checks.filter((item)=>item.route);
}
function evaluateScreen({id, route, scenario, screen, contract, violations}){
  const actual=labels(screen);
  const text=clean(screen?.text);
  if(!screen || screen.ok===false || !text) violations.push(vio('block',id,route,scenario,'route_did_not_render_meaningful_screen','rendered text and keyboard when applicable',screen||null,{remediation:'Route must render a meaningful product screen or explicit not_supported/info state.'}));
  const forbidden=(contract?.rootActions?.forbiddenWithoutContext||[]).filter((x)=>actual.includes(x));
  const hidden=(contract?.rootActions?.hiddenUntilContext||[]).filter((x)=>actual.includes(x));
  if(scenario==='root'){
    for(const x of forbidden) violations.push(vio('block',id,route,scenario,'root_action_requires_context_visible',`Hidden until ${contract.requiredContext}`,x,{offendingText:x,remediation:'Gate this action behind channel/post/entity context.'}));
    for(const x of hidden) violations.push(vio('block',id,route,scenario,'hidden_until_context_visible','hidden until selected entity',x,{offendingText:x,remediation:'Remove from root and show only after context exists.'}));
    for(const x of actual){ if(/^Текущ/i.test(x)) violations.push(vio('block',id,route,scenario,'current_entity_visible_without_context','No current action at root without selected entity',x,{offendingText:x,remediation:'Move current action to selected entity card.'})); }
    if(actual.some((x)=>/^Создать /.test(x)) && contract && String(contract.requiredContext).includes('post') && !text.includes('Пост не выбран')) violations.push(vio('block',id,route,scenario,'create_leads_to_empty_picker_dead_end','Context gate before create',actual.join(' | '),{remediation:'Use choose post first and useful empty states.'}));
    if(actual.includes('Список подарков')) violations.push(vio('block',id,route,scenario,'list_action_unclear_scope','All gifts in account/channel/post scope stated','Список подарков',{offendingText:'Список подарков'}));
  }
  if(scenario==='zero_channels' && !/подключ/i.test(`${text}\n${actual.join('\n')}`)) violations.push(vio('block',id,route,scenario,'empty_state_lacks_recovery_action','zero channels offers connect/recovery',text,{remediation:'Add Подключить канал or equivalent useful recovery.'}));
  if(scenario==='zero_posts'){
    if(!/нет сохранённых постов|Постов пока нет|постов нет/i.test(text)) violations.push(vio('block',id,route,scenario,'zero_posts_copy_missing','zero posts copy clearly states missing posts',text));
    if(!/Главное меню|К списку каналов|Назад|В начало раздела|Обновить посты/.test(actual.join('\n'))) violations.push(vio('block',id,route,scenario,'empty_state_lacks_recovery_action','zero posts offers recovery navigation',actual.join(' | ')));
  }
  if(scenario==='selected_post' && !/Пост|пост|Семантический пост/.test(text)) violations.push(vio('block',id,route,scenario,'selected_post_context_missing','selected post screen identifies selected post/context',text));
  if(id==='gifts' && scenario==='selected_post' && !actual.includes('Создать подарок')) violations.push(vio('block',id,route,scenario,'gifts_selected_post_create_missing','Create gift appears only after selected post context',actual.join(' | ')));
  if(id==='gifts' && scenario==='all_gifts_account_scope' && !/Все подарки в аккаунте/.test(text)) violations.push(vio('block',id,route,scenario,'gifts_list_scope_missing','All gifts screen states account scope',text));
  if(duplicateTextRisk(screen)) violations.push(vio('block',id,route,scenario,'duplicate_semantic_text','No repeated semantic sentence',text.slice(0,160),{offendingText:text.slice(0,160)}));
  return {route, scenario, text, buttons:actual, payloads:payloads(screen), duplicateTextRisk:duplicateTextRisk(screen)};
}
function buildMatrix(){
  const violations=[...menuMultiplicationViolations()]; const sections=[]; const actualVsExpected=[]; const routeCoverage=[];
  const canonicalIds=['main',...canonical.clientSections.map((s)=>s.id)];
  for(const id of canonicalIds){
    const contract=contracts.getContract(id); const route=id==='main'?'main:home':canonical.sectionById[id]?.route;
    const rootScreen=menu.render(route,{}); const actual=labels(rootScreen); const expected=contract?.rootActions?.allowed || [];
    const unexpected=actual.filter((x)=>!expected.includes(x)); const missing=expected.filter((x)=>!actual.includes(x));
    if(!contract) violations.push(vio('block',id,route,'contract_mapping','missing_product_flow_contract','one contract per canonical section','missing'));
    const routeResults=[];
    for(const check of routeChecksFor(id,contract)){
      const screen=menu.render(check.route,check.context||{});
      routeResults.push(evaluateScreen({id, route:check.route, scenario:check.scenario, screen, contract, violations}));
    }
    const forbidden=(contract?.rootActions?.forbiddenWithoutContext||[]).filter((x)=>actual.includes(x));
    const hidden=(contract?.rootActions?.hiddenUntilContext||[]).filter((x)=>actual.includes(x));
    if(contract && contract.rootMode==='placeholder_info' && contract.productReady) violations.push(vio('block',id,route,'placeholder','placeholder_counted_as_pass','productReady false for placeholders','productReady true'));
    if(contract && contract.productReady && !lifecycleCovered(contract)) violations.push(vio('block',id,route,'lifecycle','product_ready_lifecycle_incomplete','required lifecycle steps covered',contract.requiredLifecycle || contract.lifecycle,{actual:contract.lifecycle}));
    if(contract && String(contract.requiredContext).includes('post') && contract.rootMode!=='context_gate') violations.push(vio('block',id,route,'post_scope','post_scoped_section_not_gated','rootMode context_gate',contract.rootMode));
    if(contract && !contract.productReady) violations.push(vio('warn',id,route,'readiness','client_visible_product_ready_false','Either complete lifecycle or mark visible partial honestly','productReady false'));
    if(actual.includes('Помощь') && id !== 'channels' && id !== 'gifts') violations.push(vio('warn',id,route,'root_help','help_visible_root_may_duplicate_docs','Help only when useful and non-duplicated','Помощь'));
    const sectionViolations=violations.filter((v)=>v.section===id);
    const row={section:id, expectedRootMode:contract?.rootMode||'missing', actualRootButtons:actual, expectedAllowedRootButtons:expected, unexpectedRootButtons:unexpected, missingRequiredRootButtons:missing, forbiddenButtonsVisible:forbidden.concat(hidden), productReady:!!contract?.productReady, lifecycleCovered:!!contract&&lifecycleCovered(contract), routesCovered:routeResults.map((r)=>`${r.scenario}:${r.route}`), postScopedRouteCoverage:routeResults.filter((r)=>r.scenario!=='root').length, deadEndRisk:sectionViolations.some((v)=>/dead_end|empty_state_lacks/.test(v.reason)), duplicateTextRisk:routeResults.some((r)=>r.duplicateTextRisk), placeholderAsPassRisk:!!contract?.productReady && routeResults.some((r)=>/Раздел подготовлен/.test(r.text)), menuMultiplicationRisk:sectionViolations.some((v)=>/menu|legacy/.test(v.reason)), classification: statusFor(sectionViolations, contract||{})};
    sections.push(row); routeCoverage.push({section:id,routes:routeResults}); actualVsExpected.push({section:id, route, expected:{rootMode:row.expectedRootMode, buttons:expected, requiredContext:contract?.requiredContext, states:contract?.states}, actual:{text:clean(rootScreen.text), buttons:actual, payloads:payloads(rootScreen)}, routes:routeResults});
  }
  const blockCount=violations.filter((v)=>v.severity==='block').length, warnCount=violations.filter((v)=>v.severity==='warn').length;
  return {ok:blockCount===0, generatedAt:new Date().toISOString(), sections, routeCoverage, summary:{sectionCount:sections.length, pass:sections.filter(s=>s.classification==='PASS').length, partial:sections.filter(s=>s.classification==='PARTIAL').length, block:sections.filter(s=>s.classification==='BLOCK').length, blockCount, warnCount, postScopedSectionsChecked:sections.filter((s)=>s.postScopedRouteCoverage>0).length, table:sections.map(s=>({section:s.section, classification:s.classification, productReady:s.productReady, lifecycleCovered:s.lifecycleCovered, routesCovered:s.routesCovered}))}, violations, actualVsExpected};
}
async function exportMatrix(){const payload=buildMatrix();return startupLog.exportRuntimeJson({path:DEFAULT_PATH,payload,message:`product semantic matrix ${payload.ok?'PASS':'FAIL'}`});}
module.exports={DEFAULT_PATH,buildMatrix,exportMatrix};
