'use strict';
const runtimeExport = require('./runtimeExportService');
const DEFAULT_PATH = 'runtime/process-events.json';
const LIMIT = 80;
const state = { installed:false, bootedAt:new Date().toISOString(), events:[] };
function clean(v){return String(v||'').trim().slice(0,200);}
function add(event, details={}){const item={at:new Date().toISOString(),event:clean(event),pid:process.pid,node:process.version,details:{}};for(const [k,v] of Object.entries(details||{})) item.details[clean(k)]=clean(v&&v.stack||v&&v.message||v);state.events=[item,...state.events].slice(0,LIMIT);return item;}
async function exportEvents(){const payload={ok:true,runtime:'PR259-PROCESS-EVENTS',updatedAt:new Date().toISOString(),bootedAt:state.bootedAt,events:state.events};return runtimeExport.exportJson({path:DEFAULT_PATH,payload,message:`process events ${state.events[0]&&state.events[0].event||'startup'}`});}
function record(event,details){add(event,details); exportEvents().catch(()=>{});}
function install(){if(state.installed)return {ok:true,already:true};state.installed=true;record('startup',{entrypoint:'clean-entrypoint-1.53.10-pr89.js'});process.on('uncaughtException',(error)=>{record('uncaughtException',{error});process.exitCode=1;setTimeout(()=>process.exit(1),250);});process.on('unhandledRejection',(reason)=>{record('unhandledRejection',{reason});});process.once('SIGTERM',()=>{record('SIGTERM',{});setTimeout(()=>process.exit(0),250);});process.once('beforeExit',(code)=>{record('beforeExit',{code});});process.once('exit',(code)=>{add('exit',{code});});return {ok:true,installed:true};}
function info(){return {...state, path:DEFAULT_PATH};}
module.exports={DEFAULT_PATH,install,record,info,exportEvents};
