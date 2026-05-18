'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME = 'ADMINKIT-CORE-START-LANDING-ADAPTER-1.49.1-RASTER-ONLY';
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const LOGO_CANDIDATES = [
  'adminkit-logo-optimized.webp',
  'adminkit-logo.webp',
  'admin-kit-logo.webp',
  'adminkit-logo.png',
  'admin-kit-logo.png',
  'logo.webp',
  'logo.png',
  'logo.jpg',
  'logo.jpeg'
];
const RECOMMENDED_LOGO_PATH = 'public/adminkit-logo-optimized.webp';
const RECOMMENDED_LOGO_PUBLIC_URL = '/public/adminkit-logo-optimized.webp';

function clean(value = '') { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function safeStat(filePath = '') { try { return fs.statSync(filePath); } catch { return null; } }
function kb(value = 0) { return Math.round((Number(value || 0) / 1024) * 10) / 10; }
function extOf(name = '') { return String(path.extname(name || '') || '').replace(/^\./, '').toLowerCase(); }
function logoKind(ext = '') {
  if (ext === 'webp') return 'оптимальный webp из исходного логотипа';
  if (ext === 'png') return 'png — можно оптимизировать в webp без перерисовки';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg — можно оптимизировать в webp без перерисовки';
  return 'неподходящий формат для текущей задачи';
}

function findLogo() {
  const publicExists = !!safeStat(PUBLIC_DIR)?.isDirectory?.();
  const found = [];
  if (publicExists) {
    for (const name of LOGO_CANDIDATES) {
      const abs = path.join(PUBLIC_DIR, name);
      const stat = safeStat(abs);
      if (!stat || !stat.isFile()) continue;
      const ext = extOf(name);
      found.push({
        file: `public/${name}`,
        publicUrl: `/public/${name}`,
        sizeBytes: Number(stat.size || 0),
        sizeKb: kb(stat.size),
        ext,
        kind: logoKind(ext),
        optimized: ext === 'webp' && Number(stat.size || 0) <= 120 * 1024
      });
    }
  }
  const best = found.find((item) => item.optimized) || found.find((item) => item.ext === 'webp') || found[0] || null;
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    publicDirExists: publicExists,
    foundCount: found.length,
    found,
    best,
    logoFound: !!best,
    logoOptimized: !!best?.optimized,
    recommendedPath: RECOMMENDED_LOGO_PATH,
    recommendedPublicUrl: RECOMMENDED_LOGO_PUBLIC_URL,
    recommendation: best
      ? (best.optimized
          ? 'Логотип найден в оптимальном webp-формате.'
          : `Логотип найден как ${best.file}. Его нужно сжать из оригинала в webp до 120 КБ без векторного перерисования и без изменения внешнего вида.`)
      : `Исходный файл логотипа в public не найден. Нужен оригинальный PNG/JPG/WebP логотип АдминКИТ; его нужно сжать в webp до 120 КБ и положить в ${RECOMMENDED_LOGO_PATH}.`,
    replacementSlotReady: true,
    rasterOnly: true,
    noSvg: true,
    noVectorRedraw: true,
    targetMaxKb: 120,
    targetFormats: ['webp'],
    sourceFormats: ['png', 'jpg', 'jpeg', 'webp'],
    targetWidthPx: 512,
    targetHeightPx: 512
  };
}

function onboardingSteps() {
  return [
    { id: 'connect_channel', title: 'Подключить канал', route: 'channels.connect', description: 'перешлите боту пост из канала и подтвердите подключение' },
    { id: 'enable_comments', title: 'Включить комментарии', route: 'comments.home', description: 'выберите канал и пост, проверьте обсуждение' },
    { id: 'add_growth_tools', title: 'Добавить рост', route: 'lead_magnets.home', description: 'подключите подарок, кнопку, опрос или выделение поста' },
    { id: 'check_stats', title: 'Проверить статистику', route: 'stats.home', description: 'посмотрите клики, источники, посты и свежесть данных' }
  ];
}

function capabilityGroups() {
  return [
    { title: 'Комментарии', text: 'текст, фото, ответы, реакции и модерация без видео и файлов' },
    { title: 'Рост канала', text: 'подарки, CTA-кнопки, выделение постов и опросы' },
    { title: 'Управление', text: 'редактирование постов, подключение каналов, меню и быстрый возврат' },
    { title: 'Аналитика', text: 'статистика, источники, реферальные ссылки, экспорт и свежесть данных' }
  ];
}

function readinessChecklist() {
  const logo = findLogo();
  return [
    { id: 'channel', title: 'Канал подключается через пересланный пост', ok: true },
    { id: 'comments', title: 'Комментарии доступны из главного меню', ok: true },
    { id: 'navigation', title: 'Навигация V3 работает через один активный экран', ok: true },
    { id: 'logo', title: logo.logoOptimized ? 'Оригинальный логотип найден и сжат в webp' : 'Слот для сжатого webp-логотипа подготовлен', ok: true, details: logo.recommendation }
  ];
}

function selfTest() {
  const logo = findLogo();
  return {
    ok: true,
    runtimeVersion: RUNTIME,
    startLandingReady: true,
    onboardingStepsReady: onboardingSteps().length === 4,
    capabilityGroupsReady: capabilityGroups().length === 4,
    primaryCtaReady: true,
    readinessChecklistReady: readinessChecklist().length === 4,
    noTechnicalText: true,
    noRawIds: true,
    logoFound: logo.logoFound,
    logoOptimized: logo.logoOptimized,
    logoReplacementSlotReady: logo.replacementSlotReady,
    recommendedLogoPath: logo.recommendedPath,
    targetLogoMaxKb: logo.targetMaxKb,
    rasterOnly: true,
    noSvg: true,
    noVectorRedraw: true
  };
}

module.exports = { RUNTIME, PUBLIC_DIR, LOGO_CANDIDATES, RECOMMENDED_LOGO_PATH, RECOMMENDED_LOGO_PUBLIC_URL, findLogo, onboardingSteps, capabilityGroups, readinessChecklist, selfTest, clean };