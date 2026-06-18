'use strict';
const stats = require('./statsProductPerfectPr226');
function clean(v){return String(v||'').trim();}
function ctx(input={}){return {tenantKey:clean(input.tenantKey||input.ownerUserId||input.userId||'default'),ownerUserId:clean(input.ownerUserId||input.adminId||input.userId),channelId:clean(input.channelId||input.chatId),postId:clean(input.postId),messageId:clean(input.messageId),commentKey:clean(input.commentKey)};}
function recordAudienceUpdate(input={}){const c=ctx(input); const kind=clean(input.type||input.updateType||input.eventType).toLowerCase(); if(kind.includes('added')) return stats.recordMemberJoined(c,{userId:clean(input.memberUserId||input.userId),timestamp:input.timestamp,payload:input}); if(kind.includes('removed')) return stats.persistStatsEvent({...c,userId:clean(input.memberUserId||input.userId),eventType:'member_left',confidence:'exact',timestamp:input.timestamp,payload:input}); return null;}
function recordCtaClick(input={}){return stats.persistStatsEvent({...ctx(input),eventType:'cta_clicked',confidence:'exact',userId:clean(input.userId),linkId:clean(input.buttonId||input.linkId),content:clean(input.buttonText),payload:input});}
function recordGiftRequested(input={}){return stats.persistStatsEvent({...ctx(input),eventType:'gift_requested',confidence:'exact',userId:clean(input.userId),content:clean(input.campaignId||input.giftId),payload:input});}
function recordGiftClaimed(input={}){return stats.persistStatsEvent({...ctx(input),eventType:'gift_claimed',confidence:'exact',userId:clean(input.userId),content:clean(input.campaignId||input.giftId),payload:input});}
function recordCommentCreated(input={}){return stats.persistStatsEvent({...ctx(input),eventType:'comment_created',confidence:'exact',userId:clean(input.userId),payload:input});}
module.exports={recordAudienceUpdate,recordCtaClick,recordGiftRequested,recordGiftClaimed,recordCommentCreated};
