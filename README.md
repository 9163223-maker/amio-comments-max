# АдминКИТ SP36

Сборка: `adminkit-SP36-silent-native-media-full`

Фокус сборки:
- тихий Telegram/MAX-like UX медиа без лишних подписей;
- фото в комментариях остаётся только лёгким preview;
- документы открываются через приватный same-origin fallback-route, при этом MAX payload сохраняется;
- видео публикуется как processing-card и обрабатывается в фоне;
- debug export в GitHub сохранён.

Проверка после деплоя:

```
/debug
/public/build-marker.txt
/debug/export?token=<GIFT_ADMIN_TOKEN>
```
