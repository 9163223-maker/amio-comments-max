# PR240 polls unified workflow

Goal: restore polls/голосования as a live pilot workflow instead of a dev placeholder.

Scope:
- canonical polls root create action now routes to `polls:create`, not the old comments picker;
- V3 actions adapter handles polls through channel -> post -> question -> options -> preview -> create/results;
- single connected channel auto-opens post picker;
- selected post opens `polls:post`, not `comments:post`;
- poll creation uses `src/core/pollsDataAdapter.createPoll`.

Archive is intentionally out of scope.
