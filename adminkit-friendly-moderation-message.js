'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.7.5-FRIENDLY-MODERATION-MESSAGE';
const MARKER = '__ADMINKIT_FRIENDLY_MODERATION_MESSAGE_675__';

let status = { installed: false, patched: false, error: '', at: '' };

function clientPatch() {
  return `\n;(() => {\n  if (window.${MARKER}) return;\n  window.${MARKER} = true;\n  const RT = '${RUNTIME}';\n  const friendly = (payload = {}, fallback = '') => {\n    const code = String(payload.error || payload.code || payload.reason || fallback || '').toLowerCase();\n    const text = String(payload.publicMessage || payload.message || payload.error_description || fallback || '');\n    if (code.includes('comments_disabled')) return 'Комментарии к этому посту сейчас закрыты.';\n    if (code.includes('moderation') || code.includes('stopword') || code.includes('blocked') || /модерац|стоп|запрещ/i.test(text)) {\n      return 'Комментарий не опубликован: сработала модерация. Измените текст и попробуйте ещё раз.';\n    }\n    return '';\n  };\n  const remember = (message) => {\n    if (!message) return;\n    window.__ADMINKIT_LAST_FRIENDLY_COMMENT_ERROR__ = { message, at: Date.now(), runtimeVersion: RT };\n  };\n  const recent = () => {\n    const x = window.__ADMINKIT_LAST_FRIENDLY_COMMENT_ERROR__;\n    return x && Date.now() - Number(x.at || 0) < 12000 ? x.message : '';\n  };\n  const install = () => {\n    try {\n      if (typeof apiRequestJson === 'function' && !apiRequestJson.__adminkitFriendlyModeration675) {\n        const original = apiRequestJson;\n        apiRequestJson = async function adminkitFriendlyApiRequestJson(url, options = {}) {\n          try {\n            return await original.apply(this, arguments);\n          } catch (error) {\n            const msg = friendly(error?.payload || {}, error?.message || error?.code || '');\n            if (msg && /\\/api\\/comments/i.test(String(url || ''))) remember(msg);\n            throw error;\n          }\n        };\n        apiRequestJson.__adminkitFriendlyModeration675 = true;\n      }\n    } catch (_) {}\n    try {\n      if (typeof setCommentStatus === 'function' && !setCommentStatus.__adminkitFriendlyModeration675) {\n        const originalStatus = setCommentStatus;\n        setCommentStatus = function adminkitFriendlySetCommentStatus(message, isError = false) {\n          let next = message;\n          if (isError && /не удалось отправить комментарий|попробуйте ещё раз/i.test(String(message || ''))) {\n            next = recent() || 'Комментарий не опубликован. Проверьте текст и попробуйте ещё раз.';\n          }\n          return originalStatus.call(this, next, isError);\n        };\n        setCommentStatus.__adminkitFriendlyModeration675 = true;\n      }\n    } catch (_) {}\n  };\n  [0, 50, 150, 400, 900, 1800].forEach((ms) => setTimeout(install, ms));\n})();\n`;
}

function install() {
  const file = path.resolve(__dirname, 'public', 'app.js');
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(MARKER)) {
      status = { installed: true, patched: false, alreadyPresent: true, at: new Date().toISOString(), error: '' };
      return selfTest();
    }
    fs.writeFileSync(file, text + clientPatch(), 'utf8');
    status = { installed: true, patched: true, at: new Date().toISOString(), error: '' };
  } catch (error) {
    status = { installed: false, patched: false, at: new Date().toISOString(), error: error?.message || String(error) };
  }
  return selfTest();
}

function selfTest() {
  return { ok: true, runtimeVersion: RUNTIME, marker: MARKER, status, behavior: 'friendly_comment_moderation_error' };
}

module.exports = { RUNTIME, MARKER, install, selfTest };
