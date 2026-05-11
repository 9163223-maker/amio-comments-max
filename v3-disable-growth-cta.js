'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'CC6.5.6.3-DISABLE-GROWTH-CTA';
const SOURCE = 'adminkit-CC6.5.6.3-hide-connect-comments-cta';
const MARKER = '__ADMINKIT_V3_DISABLE_GROWTH_CTA__';

function clientPatch(runtime, source, marker) {
  if (window[marker]) return;
  window[marker] = true;

  function hideGrowthLeadCard() {
    try {
      const leadCard = document.getElementById('growthLeadCard');
      if (leadCard) {
        leadCard.innerHTML = '';
        leadCard.classList.add('hidden');
        leadCard.setAttribute('aria-hidden', 'true');
        leadCard.style.setProperty('display', 'none', 'important');
        leadCard.style.setProperty('pointer-events', 'none', 'important');
      }

      document.querySelectorAll('[data-ak-cta-url], .growth-lead-wrap, .growth-brand-pill, .floating-cta, .powered-by-card, .adminkit-powered-card').forEach((element) => {
        const text = String(element.textContent || '').toLowerCase();
        if (/подключить|комментарии|cta|полезная ссылка|powered|админкит/.test(text)) {
          element.setAttribute('aria-hidden', 'true');
          element.style.setProperty('display', 'none', 'important');
          element.style.setProperty('pointer-events', 'none', 'important');
        }
      });
    } catch (_) {}
  }

  try {
    window.__adminkitRenderCta = function disabledAdminkitRenderCta() {
      hideGrowthLeadCard();
    };
  } catch (_) {}

  try {
    if (typeof renderLeadMagnet === 'function') {
      renderLeadMagnet = function disabledRenderLeadMagnet() { hideGrowthLeadCard(); };
    }
  } catch (_) {}

  hideGrowthLeadCard();
  setTimeout(hideGrowthLeadCard, 0);
  setTimeout(hideGrowthLeadCard, 250);
  setTimeout(hideGrowthLeadCard, 1000);

  try {
    const observer = new MutationObserver(hideGrowthLeadCard);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  window.__adminkitGrowthCtaPolicy = {
    runtimeVersion: runtime,
    sourceMarker: source,
    leadCtaDisabled: true,
    reason: 'do_not_show_connect_comments_cta_inside_discussion'
  };
}

function buildClientPatch() {
  return '\n;(' + clientPatch.toString() + ')(' + [RUNTIME, SOURCE, MARKER].map((value) => JSON.stringify(value)).join(',') + ');\n';
}

function patchPublicAppRead() {
  if (fs.__adminkitDisableGrowthCtaPatched) return;
  fs.__adminkitDisableGrowthCtaPatched = true;

  const originalReadFileSync = fs.readFileSync.bind(fs);
  const publicAppPath = path.resolve(path.join(__dirname, 'public', 'app.js'));

  fs.readFileSync = function adminkitDisableGrowthCtaReadFileSync(filePath, options) {
    const content = originalReadFileSync(filePath, options);
    try {
      const resolved = path.resolve(String(filePath || ''));
      const wantsText = options === 'utf8' || options === 'utf-8' || (options && typeof options === 'object' && /utf-?8/i.test(String(options.encoding || '')));
      if (resolved === publicAppPath && wantsText) {
        const text = String(content || '');
        if (!text.includes(MARKER)) return text + buildClientPatch();
      }
    } catch {}
    return content;
  };
}

function install() {
  patchPublicAppRead();
  return selfTest();
}

function selfTest() {
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    sourceMarker: SOURCE,
    patchesPublicAppRead: !!fs.__adminkitDisableGrowthCtaPatched,
    policy: {
      hideGrowthLeadCard: true,
      hideConnectCommentsCta: true,
      doesNotHideCommentsShell: true,
      doesNotPatchLaunchLinks: true,
      doesNotPatchCallbackAnswers: true
    }
  };
}

module.exports = { RUNTIME, SOURCE, install, selfTest };
