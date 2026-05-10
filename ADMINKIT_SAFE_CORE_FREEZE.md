# AdminKIT Safe Core Freeze

Server startup is a protected layer.

Rules:
1. Do not change Dockerfile for menu work.
2. Do not change package.json or npm start for menu work.
3. Do not change main boot or entrypoint for menu work.
4. Do not patch express, Module._load, app.post, or webhook bootstrap for menu work.
5. Do not change debug/store or debug/ping for menu work.
6. Menu V3 must be connected only through a safe feature adapter.
7. Feature errors must return a screen-level error, not crash the server.
8. Production Menu Map V3 is the source of truth for menu routes.

Short rule: menu may fail, server must not fail.
