# GitHub debug export

1. Создайте fine-grained GitHub token для нужного репозитория.
2. Дайте доступ `Contents: Read and write`.
3. Добавьте переменные в Northflank:

```txt
GITHUB_DEBUG_TOKEN=...
GITHUB_DEBUG_REPO=owner/repo
GITHUB_DEBUG_BRANCH=main
GITHUB_DEBUG_PATH=debug/latest.json
GITHUB_DEBUG_LITE_PATH=debug/latest-lite.json
GIFT_ADMIN_TOKEN=...
DEBUG_EXPORT_ALLOW_PUBLIC=0
```

4. После ошибки или теста откройте:

```txt
/debug/export?token=<GIFT_ADMIN_TOKEN>
```

В репозитории обновятся:

```txt
debug/latest.json
debug/latest-lite.json
```

`latest.json` очищается от токенов, base64 и больших payload перед отправкой.
