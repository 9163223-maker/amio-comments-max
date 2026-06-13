'use strict';
const assert=require('assert');
const maxPath=require.resolve('../services/maxApi');
const storePath=require.resolve('../store');
const buttonsPath=require.resolve('../buttons-flow-cc8-clean');
const bootstrapPath=require.resolve('../pr199-buttons-wizard-inplace-save-bootstrap');
const guardPath=require.resolve('../pr199-buttons-main-menu-route-guard');
[maxPath,storePath,buttonsPath,bootstrapPath,guardPath].forEach((p)=>{delete require.cache[p];});

const USER_ID='pr199-user';
const TARGET={channelId:'pr199-channel',postId:'pr199-post',commentKey:'pr199-comment'};
const READY_FLOW={mode:'button_wizard',stepIndex:2,targetPost:TARGET,draft:{id:'btn_pr199',text:'Press',url:'https://olga.style'}};
const STEP1_TEXT='Добавление кнопки\nШаг 1/3';
const STEP2_TEXT='Добавление кнопки\nШаг 2/3';
const PREVIEW_TEXT='Предпросмотр кнопки\nШаг 3/3';
const SAVE_OK_TEXT='Кнопка сохранена. Пост обновлён.';
let state={activeAdminFlowKind:'button',buttonFlow:READY_FLOW};
const editCalls=[];
const sendCalls=[];
const patches=[];
let saveCalls=0;
let saveGate=null;
let failNextEdit=false;
function deferred(){let resolve;const promise=new Promise((res)=>{resolve=res;});return{promise,resolve};}

require.cache[storePath]={id:storePath,filename:storePath,loaded:true,exports:{
  getSetupState:(uid)=>{assert.strictEqual(uid,USER_ID);return state;},
  setSetupState:(uid,patch)=>{assert.strictEqual(uid,USER_ID);patches.push(patch);state={...state,...patch};},
  store:{growth:{byChannel:{}}},saveStore:()=>{},savePost:()=>{}
}};
require.cache[maxPath]={id:maxPath,filename:maxPath,loaded:true,exports:{
  editMessage:async(args)=>{editCalls.push(args);if(failNextEdit){failNextEdit=false;throw new Error('edit failed for test');}return{message:{id:args.messageId,body:{mid:args.messageId}}};},
  sendMessage:async(args)=>{sendCalls.push(args);return{message:{id:'new-message',body:{mid:'new-message'}}};}
}};
require.cache[buttonsPath]={id:buttonsPath,filename:buttonsPath,loaded:true,exports:{
  isCleanButtonAction:(action='')=>['button_admin_start_add','button_admin_save','button_admin_preview_back','button_admin_cancel'].includes(action),
  handleTextInput:async()=>({id:'buttons_clean_add_preview',text:PREVIEW_TEXT,attachments:[]}),
  screenForPayload:async(menu,payload={})=>{
    if(payload.action==='button_admin_start_add')return{id:'buttons_clean_add_label',text:STEP1_TEXT,attachments:[]};
    if(payload.action==='button_admin_preview_back'){require('../store').setSetupState(USER_ID,{buttonFlow:{...READY_FLOW,stepIndex:1,draft:{...READY_FLOW.draft,url:''}}});return{id:'buttons_clean_add_url',text:STEP2_TEXT,attachments:[]};}
    if(payload.action==='button_admin_cancel'){require('../store').setSetupState(USER_ID,{buttonFlow:null,activeAdminFlowKind:''});return{id:'buttons_clean_home',text:'cancelled',attachments:[]};}
    if(payload.action==='button_admin_save'){
      saveCalls+=1;
      if(saveGate)await saveGate.promise;
      const current=require('../store').getSetupState(USER_ID);
      if(current.buttonFlow&&current.buttonFlow.stepIndex>=2&&current.buttonFlow.draft.url){require('../store').setSetupState(USER_ID,{buttonFlow:null,activeAdminFlowKind:''});return{id:'buttons_clean_home',text:SAVE_OK_TEXT,attachments:[]};}
      return{id:'buttons_clean_home',text:'need_preview',attachments:[]};
    }
    return null;
  }
}};

const max=require('../services/maxApi');
const buttons=require('../buttons-flow-cc8-clean');
const store=require('../store');
const bootstrap=require('../pr199-buttons-wizard-inplace-save-bootstrap');
const guard=require('../pr199-buttons-main-menu-route-guard');
assert.strictEqual(bootstrap.info().installed,false);
assert.strictEqual(bootstrap.updateMessageId({callback:{message_id:'flat-callback-message'}}),'flat-callback-message');
assert.strictEqual(bootstrap.install().ok,true);
assert.strictEqual(guard.install().ok,true);
assert.strictEqual(bootstrap.info().buttonsRecordsActiveScreenOnEdit,true);
assert.strictEqual(bootstrap.info().buttonsPendingEditMessageScoped,true);
assert.strictEqual(bootstrap.info().buttonsPendingPreviewClearedOnFlowClear,true);
assert.strictEqual(bootstrap.info().buttonsDuplicateSaveGuarded,true);
assert.strictEqual(bootstrap.info().buttonsSaveGuardClearedOnExit,true);
assert.strictEqual(guard.info().mainMenuUsesPublicRoute,true);
assert.strictEqual(guard.info().chatIdWizardSendGuard,true);
assert.strictEqual(guard.info().chatIdWizardEditForwardsBotToken,true);
assert.strictEqual(guard.info().chatIdWizardEditFallsBackToSend,true);
assert.strictEqual(buttons.isCleanButtonAction('admin_section_main'),false);

(async()=>{
  const first=await buttons.screenForPayload({},{action:'button_admin_start_add'},{userId:USER_ID,update:{callback:{message_id:'callback-message'}}});
  await max.editMessage({messageId:'other-message',text:first.text,attachments:first.attachments});
  assert.notStrictEqual(state.buttonsActiveScreenMessageId,'other-message');
  await max.editMessage({messageId:'callback-message',text:first.text,attachments:first.attachments});
  assert.strictEqual(state.buttonsActiveScreenMessageId,'callback-message');
  await max.sendMessage({userId:USER_ID,text:STEP2_TEXT,attachments:[]});
  assert.strictEqual(editCalls.filter((c)=>c.messageId==='callback-message').length>=2,true);
  assert.strictEqual(sendCalls.length,0);

  state={activeAdminFlowKind:'button',buttonsActiveScreenMessageId:'callback-message',buttonFlow:READY_FLOW};
  await max.sendMessage({chatId:USER_ID,botToken:'test-bot-token',text:STEP2_TEXT,attachments:[]});
  assert.strictEqual(editCalls.at(-1).messageId,'callback-message');
  assert.strictEqual(editCalls.at(-1).botToken,'test-bot-token');
  assert.strictEqual(sendCalls.length,0);
  failNextEdit=true;
  await max.sendMessage({chatId:USER_ID,botToken:'test-bot-token',text:STEP2_TEXT,attachments:[]});
  assert.strictEqual(sendCalls.length,1);
  assert(Number(state.buttonsChatIdInplaceEditFailedAt)>0);
  assert.strictEqual(state.buttonsChatIdInplaceEditFailedRuntime,guard.RUNTIME);
  assert(/edit failed for test/.test(state.buttonsChatIdInplaceEditFailedMessage));

  await buttons.handleTextInput({},{userId:USER_ID,text:'https://olga.style'});
  assert(state.buttonsPendingPreview);
  state={...state,activeAdminFlowKind:'',buttonFlow:null};
  const beforeRestore=patches.filter((p)=>p.buttonsPendingPreviewRestoredRuntime===bootstrap.RUNTIME).length;
  assert.strictEqual((await buttons.screenForPayload({},{action:'button_admin_save'},{userId:USER_ID})).text,SAVE_OK_TEXT);
  assert(patches.filter((p)=>p.buttonsPendingPreviewRestoredRuntime===bootstrap.RUNTIME).length>beforeRestore);
  assert.strictEqual(state.buttonsPendingPreview,null);

  state={activeAdminFlowKind:'button',buttonsActiveScreenMessageId:'callback-message',buttonFlow:READY_FLOW};
  await buttons.handleTextInput({},{userId:USER_ID,text:'https://olga.style'});
  assert(state.buttonsPendingPreview);
  state={...state,activeAdminFlowKind:'',buttonFlow:null};
  const duplicateStartRestores=patches.filter((p)=>p.buttonsPendingPreviewRestoredRuntime===bootstrap.RUNTIME).length;
  saveGate=deferred();
  const firstSave=buttons.screenForPayload({},{action:'button_admin_save'},{userId:USER_ID});
  assert.strictEqual(saveCalls,2);
  assert.strictEqual(state.buttonsPendingPreview,null);
  assert(Number(state.buttonsPendingPreviewSaveInFlightAt)>0);
  const duplicate=await buttons.screenForPayload({},{action:'button_admin_save'},{userId:USER_ID});
  assert.strictEqual(duplicate.text,'Сохранение кнопки уже выполняется. Подождите результат.');
  assert.strictEqual(saveCalls,2);
  saveGate.resolve();
  assert.strictEqual((await firstSave).text,SAVE_OK_TEXT);
  saveGate=null;
  assert.strictEqual(state.buttonsPendingPreview,null);
  assert.strictEqual(Number(state.buttonsPendingPreviewSaveInFlightAt||0),0);
  assert.strictEqual(patches.filter((p)=>p.buttonsPendingPreviewRestoredRuntime===bootstrap.RUNTIME).length,duplicateStartRestores+1);

  state={activeAdminFlowKind:'button',buttonsActiveScreenMessageId:'callback-message',buttonFlow:READY_FLOW};
  await buttons.handleTextInput({},{userId:USER_ID,text:'https://olga.style'});
  assert(state.buttonsPendingPreview);
  assert.strictEqual((await buttons.screenForPayload({},{action:'button_admin_preview_back'},{userId:USER_ID})).text,STEP2_TEXT);
  assert.strictEqual(state.buttonsPendingPreview,null);
  const restoresAfterBack=patches.filter((p)=>p.buttonsPendingPreviewRestoredRuntime===bootstrap.RUNTIME).length;
  assert.strictEqual((await buttons.screenForPayload({},{action:'button_admin_save'},{userId:USER_ID})).text,'need_preview');
  assert.strictEqual(patches.filter((p)=>p.buttonsPendingPreviewRestoredRuntime===bootstrap.RUNTIME).length,restoresAfterBack);

  state={activeAdminFlowKind:'button',buttonsActiveScreenMessageId:'callback-message',buttonFlow:READY_FLOW,buttonsPendingPreview:READY_FLOW,buttonsPendingPreviewAt:Date.now(),buttonsPendingPreviewSaveInFlightAt:Date.now(),buttonsPendingPreviewSaveInFlightToken:'x'};
  assert.strictEqual((await buttons.screenForPayload({},{action:'button_admin_cancel'},{userId:USER_ID})).text,'cancelled');
  assert.strictEqual(state.buttonsPendingPreview,null);
  assert.strictEqual(Number(state.buttonsPendingPreviewSaveInFlightAt||0),0);

  state={activeAdminFlowKind:'button',buttonsActiveScreenMessageId:'callback-message',buttonFlow:READY_FLOW,buttonsPendingPreview:READY_FLOW,buttonsPendingPreviewAt:Date.now(),buttonsPendingPreviewSaveInFlightAt:Date.now(),buttonsPendingPreviewSaveInFlightToken:'x'};
  store.setSetupState(USER_ID,{buttonFlow:null,activeAdminFlowKind:''});
  assert.strictEqual(state.buttonsPendingPreview,null);
  assert.strictEqual(Number(state.buttonsPendingPreviewSaveInFlightAt||0),0);
  console.log('PR199 buttons wizard assertions passed');
})().catch((error)=>{console.error(error&&error.stack||error);process.exit(1);});