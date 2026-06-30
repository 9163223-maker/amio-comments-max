'use strict';

const fs = require('fs');
const path = require('path');
const menu = require('../features/menu-v3/adapter');
const canonical = require('../features/menu-v3/canonical-menu');
const contracts = require('./productFlowContractService');
const startupLog = require('./startupLogService');

const DEFAULT_PATH = 'runtime/product-semantic-matrix.json';
function clean(v){return String(v == null ? '' : v).replace(/\s+/g,' ').trim();}
function buttons(screen){return (screen?.attachments?.[0]?.payload?.buttons || []).flat().filter(Boolean);}
function labels(screen){return buttons(screen).map((b)=>clean(b.text)).filter(Boolean);}
function payloads(screen){return buttons(screen).map((b)=>clean(b.payload)).filter(Boolean);}
function lifecycleCovered(c){return Object.values(c.lifecycle||{}).every(Boolean);}
function vio(severity, section, route, scenario, reason, expected, actual, extra={}){return {severity,section,route,scenario,reason,expected,actual,...extra};}
function duplicateTextRisk(screen){const parts=clean(screen?.text).split(/[\n.]+/).map(clean).filter((x)=>x.length>5); const seen=new Set(); return parts.some((p)=>seen.size===seen.add(p).size);}
function statusFor(sectionViolations, contract){ if(sectionViolations.some((v)=>v.severity==='block')) return 'BLOCK'; if(contract.productReady && lifecycleCovered(contract)) return 'PASS'; return 'PARTIAL'; }
function activeFileText(file){try{return fs.readFileSync(path.join(__dirname,'..',file),'utf8');}catch{return '';}}
function menuMultiplicationViolations(){
  const active=['clean-entrypoint-1.53.10-pr89.js','features/menu-v3/adapter.js','v3-menu-routes-1539.js','bot.js'];
  const legacy=['production-menu-map-v3-fixed','production-menu-v3-renderer'];
  const out=[];
  for(const file of active){const t=activeFileText(file); for(const needle of legacy){ if(t.includes(needle)) out.push(vio('block','main',file,'active_runtime_import','legacy_action_bypasses_product_flow_contract','canonical-menu.js only',needle,{remediation:'Remove legacy menu import from active runtime path.'})); }}
  return out;
}
function buildMatrix(){
  const violations=[...menuMultiplicationViolations()]; const sections=[]; const actualVsExpected=[];
  const canonicalIds=['main',...canonical.clientSections.map((s)=>s.id)];
  for(const id of canonicalIds){
    const contract=contracts.getContract(id); const route=id==='main'?'main:home':canonical.sectionById[id].route;
    const screen=menu.render(route,{}); const actual=labels(screen); const expected=contract?.rootActions?.allowed || [];
    const unexpected=actual.filter((x)=>!expected.includes(x)); const missing=expected.filter((x)=>!actual.includes(x));
    const forbidden=(contract?.rootActions?.forbiddenWithoutContext||[]).filter((x)=>actual.includes(x));
    const hidden=(contract?.rootActions?.hiddenUntilContext||[]).filter((x)=>actual.includes(x));
    if(!contract) violations.push(vio('block',id,route,'contract_mapping','missing_product_flow_contract','one contract per canonical section','missing'));
    for(const x of forbidden) violations.push(vio('block',id,route,'root_without_context','root_action_requires_context_visible',`Hidden until ${contract.requiredContext}`,x,{offendingText:x,remediation:'Gate this action behind channel/post/entity context.'}));
    for(const x of hidden) violations.push(vio('block',id,route,'root_without_context','hidden_until_context_visible','hidden until selected entity',x,{offendingText:x,remediation:'Remove from root and show only after context exists.'}));
    for(const x of actual){ if(/^Текущ/i.test(x)) violations.push(vio('block',id,route,'root_without_entity','current_entity_visible_without_context','No current action at root without selected entity',x,{offendingText:x,remediation:'Move current action to selected entity card.'})); }
    if(actual.some((x)=>/^Создать /.test(x)) && contract && contract.requiredContext.includes('post') && !clean(screen.text).includes('Пост не выбран')) violations.push(vio('block',id,route,'post_scoped_root','create_leads_to_empty_picker_dead_end','Context gate before create',actual.join(' | '),{remediation:'Use choose post first and useful empty states.'}));
    if(actual.includes('Список подарков')) violations.push(vio('block',id,route,'root_list_scope','list_action_unclear_scope','All gifts in account/channel/post scope stated','Список подарков',{offendingText:'Список подарков'}));
    if(duplicateTextRisk(screen)) violations.push(vio('block',id,route,'screen_copy','duplicate_semantic_text','No repeated semantic sentence',clean(screen.text).slice(0,120),{offendingText:clean(screen.text).slice(0,120)}));
    if(contract && contract.rootMode==='placeholder_info' && contract.productReady) violations.push(vio('block',id,route,'placeholder','placeholder_counted_as_pass','productReady false for placeholders','productReady true'));
    if(contract && contract.productReady && !lifecycleCovered(contract)) violations.push(vio('block',id,route,'lifecycle','product_ready_lifecycle_incomplete','all lifecycle steps covered',contract.lifecycle));
    if(contract && contract.requiredContext.includes('post') && contract.rootMode!=='context_gate') violations.push(vio('block',id,route,'post_scope','post_scoped_section_not_gated','rootMode context_gate',contract.rootMode));
    if(contract && !contract.productReady) violations.push(vio('warn',id,route,'readiness','client_visible_product_ready_false','Either complete lifecycle or mark visible partial honestly','productReady false'));
    if(actual.includes('Помощь') && id !== 'channels' && id !== 'gifts') violations.push(vio('warn',id,route,'root_help','help_visible_root_may_duplicate_docs','Help only when useful and non-duplicated','Помощь'));
    const sectionViolations=violations.filter((v)=>v.section===id);
    const row={section:id, expectedRootMode:contract?.rootMode||'missing', actualRootButtons:actual, expectedAllowedRootButtons:expected, unexpectedRootButtons:unexpected, missingRequiredRootButtons:missing, forbiddenButtonsVisible:forbidden.concat(hidden), productReady:!!contract?.productReady, lifecycleCovered:!!contract&&lifecycleCovered(contract), deadEndRisk:sectionViolations.some((v)=>/dead_end|empty_state_lacks/.test(v.reason)), duplicateTextRisk:duplicateTextRisk(screen), placeholderAsPassRisk:!!contract?.productReady && /Раздел подготовлен/.test(clean(screen.text)), menuMultiplicationRisk:sectionViolations.some((v)=>/menu|legacy/.test(v.reason)), classification: statusFor(sectionViolations, contract||{})};
    sections.push(row); actualVsExpected.push({section:id, route, expected:{rootMode:row.expectedRootMode, buttons:expected}, actual:{text:clean(screen.text), buttons:actual, payloads:payloads(screen)}});
  }
  const blockCount=violations.filter((v)=>v.severity==='block').length, warnCount=violations.filter((v)=>v.severity==='warn').length;
  return {ok:blockCount===0, generatedAt:new Date().toISOString(), sections, summary:{sectionCount:sections.length, pass:sections.filter(s=>s.classification==='PASS').length, partial:sections.filter(s=>s.classification==='PARTIAL').length, block:sections.filter(s=>s.classification==='BLOCK').length, blockCount, warnCount, table:sections.map(s=>({section:s.section, classification:s.classification, productReady:s.productReady, lifecycleCovered:s.lifecycleCovered}))}, violations, actualVsExpected};
}
async function exportMatrix(){const payload=buildMatrix();return startupLog.exportRuntimeJson({path:DEFAULT_PATH,payload,message:`product semantic matrix ${payload.ok?'PASS':'FAIL'}`});}
module.exports={DEFAULT_PATH,buildMatrix,exportMatrix};
