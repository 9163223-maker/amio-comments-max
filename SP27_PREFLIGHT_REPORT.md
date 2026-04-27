# SP27 — extra preflight

- Archive base: SP25 clean full.
- Runtime/displayVersion: SP27.
- Syntax checks: passed.
- Comments/media stress: 25/25 passed.
- Global menu stress: 32/32 passed.
- Upload path changed to File → FormData/multipart → backend → MAX upload.
- Mini-app no longer posts attachment JSON with `dataUrl: ready.dataUrl`.
- Reaction handlers update cache locally and do not force a full comments reload.
- HD/crop/rotate tools are disabled for stability.

Known verification boundary: final picker/keyboard behavior must be checked inside MAX WebView after deploy.
