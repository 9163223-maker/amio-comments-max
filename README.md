# АдминКИТ SP37

Сборка: `adminkit-SP37-fixmedia-gift-debug-token`

Фокус аварийной сборки:
- debug export снова вызывается старой короткой ссылкой `/debug/export?token=<GIFT_ADMIN_TOKEN>`;
- GitHub PAT больше не должен передаваться в ссылке и берётся только из env `GITHUB_DEBUG_TOKEN`;
- если GitHub вернул 403, endpoint всё равно отдаёт актуальный live-debug в ответе;
- добавлен прямой no-cache debug `/debug/store-live?token=<GIFT_ADMIN_TOKEN>`;
- добавлен `/debug/github-check?token=<GIFT_ADMIN_TOKEN>` для безопасной проверки repo/branch/path/token-present без раскрытия секрета;
- FixMedia: PDF/файлы открываются через same-origin download route с корректными заголовками;
- FixMedia: видео/публичные comment uploads отдаются с `Accept-Ranges` и `206 Partial Content`, чтобы iOS/MAX WebView мог открывать видео;
- FixMedia: клиентский hotfix защищает upload/comment-save fetch от общего AbortController, который давал `Fetch is aborted`.

Проверка после деплоя:

```text
/debug
/public/build-marker.txt
/debug/store-live?token=admin
/debug/github-check?token=admin
/debug/export?token=admin
```

Ожидаемый runtime:

```json
{
  "runtimeVersion": "SP37",
  "sourceMarker": "adminkit-SP37-fixmedia-gift-debug-token"
}
```
