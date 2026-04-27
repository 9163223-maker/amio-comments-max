function buildSetupHint(appBaseUrl) {
  return [
    "Чтобы связать пост канала с комментариями:",
    "1. Перешлите пост из канала в этого бота.",
    "2. Бот сохранит postId и попытается добавить кнопку 'Комментарии' под исходным постом.",
    `3. Mini App откроется по адресу ${appBaseUrl || "<APP_BASE_URL>"}/mini-app`
  ].join("\n");
}

module.exports = {
  buildSetupHint
};
