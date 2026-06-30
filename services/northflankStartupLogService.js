'use strict';
const runtimeExport = require('./runtimeExportService');
const DEFAULT_PATH = 'runtime/northflank-startup-log.json';
function clean(v){return String(v||'').trim();}
function configured(){const missing=['NORTHFLANK_API_TOKEN','NORTHFLANK_PROJECT_ID','NORTHFLANK_SERVICE_ID'].filter((k)=>!clean(process.env[k]));return {ok:missing.length===0,missing};}
function sanitizeLine(line=''){return clean(line).replace(/[A-Za-z0-9_=-]{48,}/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').slice(0,500);}
function payload(input={}){const cfg=configured();if(!cfg.ok)return {ok:true,runtime:'PR259-NORTHFLANK-STARTUP-LOG',configured:false,reason:`missing ${cfg.missing.join(',')}`,updatedAt:new Date().toISOString()};return {ok:true,runtime:'PR259-NORTHFLANK-STARTUP-LOG',configured:true,updatedAt:new Date().toISOString(),status:sanitizeLine(input.status||process.env.NORTHFLANK_SERVICE_STATUS||''),exitReason:sanitizeLine(input.exitReason||''),healthcheck:sanitizeLine(input.healthcheck||''),buildFailure:sanitizeLine(input.buildFailure||''),lastLines:Array.isArray(input.lastLines)?input.lastLines.slice(-80).map(sanitizeLine):[]};}
async function exportLog(input={}){const p=payload(input);return runtimeExport.exportJson({path:DEFAULT_PATH,payload:p,message:'northflank startup log'});}
module.exports={DEFAULT_PATH,payload,exportLog,sanitizeLine};
