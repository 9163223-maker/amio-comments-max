'use strict';

const { sendMessage, answerCallback } = require('../services/maxApi');
const { upsertChannel } = require('../repositories/channelsRepo');
const { upsertPost } = require('../repositories/postsRepo');
const { patchPostCommentsButton } = require('../services/postPatcher');
const {
  getText,
  getUserId,
  getUserName,
  getChatId,
  getCallbackId,
  getPayload,
  getForwardedPost
} = require('./updateExtractors');

function button(text, action, extra = {}) {
  return { type: 'callback', text, payload: JSON.stringify({ action, ...extra }) };
}

function keyboard(rows) {
  return [{ type: 'inline_keyboard', payload: { buttons: rows } }];
}

function mainMenu() {
  return {
    text: [
      'АдминКИТ clear-core-v1',
      '',
      'Чистое ядро: Postgres, понятные callbacks, без legacy overlay.',
      '',
      'Для подключения комментариев перешлите пост из канала в этот бот.'
    ].join('\n'),
    attachments: keyboard([
      [button('➕ Подключить канал / пост', 'connect_post')],
      [button('🛡 Модерация', 'moderation_start')],
      [button('💬 Комментарии: статус', 'comments_status')]
    ])
  };
}

async function reply(config, update, message) {
  const userId = getUserId(update);
  const chatId = getChatId(update);
  return sendMessage({
    botToken: config.botToken,
    userId: userId || undefined,
    chatId: userId ? undefined : chatId || undefined,
    text: message.text,
    attachments: message.attachments
  });
}

async function safeAnswer(config, update, notification) {
  const callbackId = getCallbackId(update);
  if (!callbackId) return null;
  try {
    return await answerCallback({ botToken: config.botToken, callbackId, notification });
  } catch (error) {
    console.warn('[clear-core-v1] answerCallback failed:', error.message || error);
    return null;
  }
}

async function handleForwardedPost(config, update) {
  const forwarded = getForwardedPost(update);
  if (!forwarded) return false;
  const userId = getUserId(update);
  const userName = getUserName(update);

  const channel = await upsertChannel({
    channelId: forwarded.channelId,
    title: forwarded.channelTitle,
    linkedByUserId: userId,
    linkedByName: userName,
    botAccess: true
  });

  const post = await upsertPost({
    channelId: forwarded.channelId,
    postId: forwarded.postId,
    messageId: forwarded.messageId,
    originalText: forwarded.originalText,
    sourceAttachments: forwarded.sourceAttachments,
    originalLink: forwarded.originalLink,
    originalFormat: forwarded.originalFormat
  });

  const patch = await patchPostCommentsButton({ config, post });
  await reply(config, update, {
    text: [
      'Пост сохранён в clear-core-v1.',
      '',
      `Канал: ${channel.title || channel.id}`,
      `commentKey: ${post.comment_key}`,
      patch.ok ? 'Кнопка комментариев добавлена/обновлена.' : `Кнопку пока не удалось обновить: ${patch.error?.message || patch.reason || 'unknown'}`
    ].join('\n'),
    attachments: keyboard([
      [button('🛡 Модерация этого поста', 'moderation_post', { commentKey: post.comment_key, channelId: post.channel_id })],
      [button('🛡 Модерация всего канала', 'moderation_channel', { channelId: post.channel_id })],
      [button('🏠 Главное меню', 'main_menu')]
    ])
  });
  return true;
}

async function handleCallback(config, update) {
  const payload = getPayload(update);
  const action = String(payload.action || '').trim();
  if (!action) return false;

  if (action === 'main_menu') {
    await safeAnswer(config, update, 'Главное меню');
    await reply(config, update, mainMenu());
    return true;
  }

  if (action === 'connect_post') {
    await safeAnswer(config, update, 'Перешлите пост');
    await reply(config, update, {
      text: 'Перешлите сюда пост из канала. Я сохраню канал и пост в Postgres и добавлю кнопку комментариев.',
      attachments: keyboard([[button('🏠 Главное меню', 'main_menu')]])
    });
    return true;
  }

  if (action === 'moderation_start') {
    await safeAnswer(config, update, 'Модерация');
    await reply(config, update, {
      text: 'Модерация clear-core-v1 работает по областям: весь канал или конкретный пост. Сначала перешлите пост, чтобы появилась область поста.',
      attachments: keyboard([[button('🏠 Главное меню', 'main_menu')]])
    });
    return true;
  }

  if (action === 'moderation_post' || action === 'moderation_channel') {
    await safeAnswer(config, update, 'Открываю модерацию');
    const isPost = action === 'moderation_post';
    await reply(config, update, {
      text: [
        'Модерация clear-core-v1',
        '',
        `Область: ${isPost ? 'конкретный пост' : 'весь канал'}`,
        isPost ? `commentKey: ${payload.commentKey || ''}` : `channelId: ${payload.channelId || ''}`,
        '',
        'Следующий шаг — подключить полноценное меню стоп-слов к таблице moderation_settings.'
      ].join('\n'),
      attachments: keyboard([[button('🏠 Главное меню', 'main_menu')]])
    });
    return true;
  }

  if (action === 'comments_status') {
    await safeAnswer(config, update, 'Статус');
    await reply(config, update, {
      text: 'Комментарии clear-core-v1 уже имеют API на Postgres: GET/POST /api/comments/:commentKey.',
      attachments: keyboard([[button('🏠 Главное меню', 'main_menu')]])
    });
    return true;
  }

  return false;
}

async function handleUpdate(config, update) {
  if (await handleCallback(config, update)) return { ok: true, handled: 'callback' };
  if (await handleForwardedPost(config, update)) return { ok: true, handled: 'forwarded_post' };

  const text = getText(update).toLowerCase();
  if (text === '/start' || text === 'старт' || text === 'start' || text === '') {
    await reply(config, update, mainMenu());
    return { ok: true, handled: 'main_menu' };
  }

  await reply(config, update, {
    text: 'Я работаю в clear-core-v1. Для подключения комментариев перешлите пост из канала.',
    attachments: keyboard([[button('🏠 Главное меню', 'main_menu')]])
  });
  return { ok: true, handled: 'fallback' };
}

module.exports = { handleUpdate };
