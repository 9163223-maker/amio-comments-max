# PR96 photo timing diagnostics

Purpose: make slow photo-comment sends diagnosable in production without changing the working PR95 upload/create flow.

This PR keeps video/file comments out of scope. Comments still support text, photo, reactions, replies, and predefined stickers only.

## Client trace events

The photo flow now emits timing data for the main phases:

- `photo_selected`
- `photo_preview_opened`
- `photo_compress_ok` / `photo_compress_failed`
- `photo_upload_started`
- `photo_upload_ok` / `photo_upload_failed`
- `photo_comment_create_started`
- `photo_comment_create_ok` / `photo_comment_create_failed`
- `photo_timing_summary`

## Timing fields

The final summary contains:

- `previewMs`
- `compressMs`
- `uploadMs`
- `createMs`
- `renderMs`
- `totalMs`
- `originalSize`
- `compressedSize`
- `uploadSize`
- `width`, `height`, `quality`, `maxSide`
- `uploadId`
- `serverCommentId`

Raw `dataUrl`, `thumbDataUrl`, `previewDataUrl`, and `base64` are still stripped before trace submission.
