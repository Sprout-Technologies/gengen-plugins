# Material review and automatic upload

Use the bundled `../scripts/upload-materials.mjs` with Node.js 18 or newer.
Resolve its absolute path from this installed skill directory; do not assume a
repository checkout, use a fixed workstation path, or ask the user to run commands.
The helper uses Node built-ins only and works with the existing GENGEN MCP tools.
It neither reads OAuth credentials nor calls paid generation tools.

## Prepare the review locally

Create a private task-local working directory for the selection, manifest,
reservations, and resumable state. Keep these out of Git. Save a selection JSON:

```json
{
  "projectId": "<existing project UUID>",
  "files": [
    {
      "path": "/absolute/path/to/original.png",
      "role": "product",
      "purpose": "Product appearance reference for the opening shot"
    }
  ]
}
```

`role` is `product`, `reference`, or `supporting`. Select the actual originals and
final generated materials needed for this video. Retain optional reference videos
when the user wants them saved; describe analysis-only use distinctly from video
generation bindings. Existing ready media can appear in the review as already
uploaded and must not be included in the new upload selection.

```sh
node /absolute/skill/scripts/upload-materials.mjs prepare \
  --input /private/task/selection.json --manifest /private/task/review.json
```

This performs no network calls. The result contains local preview paths, file
sizes, a SHA-256 for each original, stable request IDs, and a `reviewDigest` for
the entire batch including the destination project and each file's intended use.
An existing manifest is never overwritten. Keep it intact across retries.

Render the returned originals in the conversation using the host's media display
support. In Codex, use Markdown image embeds with absolute local paths for images
and supported video/audio previews; fall back to clickable file links if that
format cannot play inline. Do not claim playback or content inspection that did
not occur. Show a numbered inventory of **all** selected files with their sizes
and intended use, even when previews are unsupported. Never expose reservation
URLs, session URLs, or digests as user-facing setup requirements.

After the preview, ask for approval to upload this batch to the named GENGEN
project. Offer confirm / change materials / cancel where the question tool permits.
Wait for the user's answer; asking a question is not confirmation. Changes require
a new manifest and review. Upload no bytes or reservations before confirmation.
The digest checks file integrity; it does not prove human consent. The assistant
must obtain the explicit answer before passing it to the upload command.
If no files are needed, skip the material approval/upload workflow.

## Transfer the approved batch

For each new file in the approved manifest:

1. Call `create_ai_upload` with the manifest's `projectId` and the file's exact
   `requestId`, `fileName`, `mimeType`, `byteSize`, and `role`. Save the structured
   result to a private reservation JSON without printing signed URLs in chat.
2. Run the helper with the digest from the **user-confirmed** review:

   ```sh
   node /absolute/skill/scripts/upload-materials.mjs upload \
     --manifest /private/task/review.json --approved-digest <reviewDigest> \
     --file-id <fileId> --reservation /private/task/reservation-1.json \
     --state /private/task/upload-1.json
   ```

3. The helper rechecks the reviewed originals before any network transfer, sends
   exact bytes to the signed GCS destination, and retains the session privately.
   Its `uploaded` result means byte transfer only. Call `complete_ai_upload` with
   the returned `projectId` and `mediaId`, then `get_ai_project` until validation
   reports `ready`. Poll at sensible intervals and show concise batch progress.
4. Save the local file-to-media-ID mapping. Upload the remaining approved files
   automatically, then use their ready media IDs in the saved script and explicit
   generation bindings. A failed or still-validating material cannot be used yet.

Process a batch sequentially; never run concurrent attempts for the same file or
state path. Keep the selected originals available until the whole batch is ready.

## Recover without duplicate uploads

- Retry the same manifest, request ID, reservation, and state file. The helper
  queries GCS's committed offset, resumes incomplete chunks, and detects a final
  PUT that succeeded despite a lost response. It bounds automatic recovery attempts.
- If byte transfer succeeded but completion failed, retry `complete_ai_upload`
  before uploading again. `get_ai_project` and repeated `create_ai_upload` with
  the same request ID recover the existing media record.
- A signed initiation URL can be refreshed by repeating `create_ai_upload` with
  the same request ID. Keep any saved resumable session. If GCS no longer accepts
  that session, try completion to check whether the original already arrived.
  Do not silently discard state, allocate another media record, or loop forever;
  explain the remaining failure if neither recovery path succeeds.
- A changed file or manifest invalidates the digest. Show the revised materials
  and obtain fresh approval. Preserve ready media from the prior batch.
- Keep reservation and state files private (they contain upload capabilities).
  Remove them after the project confirms all selected media ready, retaining only
  the manifest/media-ID mapping needed for subsequent project work.

When the host only exposes an attachment preview without original bytes, use its
supported export first. If no export exists, explain which original is missing and
open the Materials chooser only for that file. Do not request re-selection of
files that the helper can already read, and do not invent an attachment download URL.
