#!/usr/bin/env node
// Local originals stay on disk until the user approves the reviewed manifest.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const formats = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav',
};
const limits = { image: 29_999_999, video: 200_000_000, audio: 15_000_000 };
const hash = value => createHash('sha256').update(value).digest('hex');
export const manifestDigest = manifest => hash(JSON.stringify(manifest));
class UploadError extends Error {}
const check = (condition, message) => { if (!condition) throw new UploadError(message); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

async function fileHash(filePath) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}

export async function saveJson(filePath, value) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}

export async function prepareManifest(input) {
  check(uuid(input.projectId), 'A saved project ID is required.');
  check(Array.isArray(input.files) && input.files.length > 0, 'Select at least one local original.');
  const files = [];
  const seen = new Set();
  for (const candidate of input.files) {
    check(typeof candidate.path === 'string' && path.isAbsolute(candidate.path), 'Use an absolute local file path.');
    const filePath = await realpath(candidate.path);
    check(!seen.has(filePath), 'The same file was selected twice.');
    seen.add(filePath);
    check(['product', 'reference', 'supporting'].includes(candidate.role), 'Choose product, reference, or supporting.');
    check(typeof candidate.purpose === 'string' && candidate.purpose.trim(), 'Describe how each material will be used.');
    const mimeType = formats[path.extname(filePath).slice(1).toLowerCase()];
    check(mimeType, 'Use a supported original image, MP4/MOV video, or MP3/WAV audio file.');
    const info = await stat(filePath);
    check(info.isFile() && info.size > 0 && info.size <= limits[mimeType.split('/')[0]], 'A selected file is empty, not a regular file, or exceeds the upload size limit.');
    files.push({ fileId: randomUUID(), requestId: randomUUID(), path: filePath,
      fileName: path.basename(filePath), mimeType, byteSize: info.size,
      sha256: await fileHash(filePath), role: candidate.role, purpose: candidate.purpose.trim() });
  }
  return { version: 1, projectId: input.projectId, files };
}

export async function verifyManifest(manifest, approvedDigest) {
  check(manifest.version === 1 && uuid(manifest.projectId) && manifest.files?.length > 0, 'Invalid upload manifest.');
  check(typeof approvedDigest === 'string' && approvedDigest === manifestDigest(manifest), 'The manifest does not match the user-approved review. Review it again before uploading.');
  for (const file of manifest.files) {
    check(await fileHash(file.path) === file.sha256 && (await stat(file.path)).size === file.byteSize,
      'A reviewed original changed. Prepare a new review and obtain approval before uploading.');
  }
}

function storageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new UploadError('Invalid GCS upload URL.'); }
  check(url.protocol === 'https:' && !url.username && !url.password && !url.hash && (!url.port || url.port === '443')
    && (url.hostname === 'storage.googleapis.com' || url.hostname.endsWith('.storage.googleapis.com')), 'Upload destination must be HTTPS GCS storage.');
  return url.href;
}

async function request(fetcher, url, init) {
  let response;
  try {
    // GCS uses 308 for Resume Incomplete. Node fetch rejects it in error mode,
    // even without Location; manual mode exposes it without following redirects.
    response = await fetcher(storageUrl(url), { ...init, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  } catch {
    // Network exceptions can contain the signed URL. Never print them or provider bodies.
    throw new UploadError('Storage request interrupted. Retry with the same manifest, reservation, and state file.');
  }
  check(response.status < 300 || response.status >= 400
    || (response.status === 308 && !response.headers.has('location')),
  'Storage redirects are not allowed. Keep the same upload request ID and saved session.');
  return response;
}

function offsetOf(response, total) {
  if ([200, 201].includes(response.status)) return total;
  check(response.status === 308, `Storage returned HTTP ${response.status}. Keep the same upload request ID; do not create a replacement upload.`);
  const range = response.headers.get('range');
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const offset = match ? Number(match[1]) + 1 : NaN;
  check(Number.isSafeInteger(offset) && offset > 0 && offset < total, 'Storage returned an invalid upload offset.');
  return offset;
}

// OAuth stays in the host MCP connection. This helper receives only a reservation
// and sends original bytes to its signed GCS target, without application credentials.
export async function uploadMaterial({ manifest, approvedDigest, fileId, reservation, statePath, fetcher = fetch }) {
  await verifyManifest(manifest, approvedDigest);
  const file = manifest.files.find(item => item.fileId === fileId);
  check(file, 'The file is not in the approved manifest.');
  check(reservation.projectId === manifest.projectId && uuid(reservation.mediaId), 'The reservation must belong to the reviewed project.');
  const identity = { approvedDigest, fileId, requestId: file.requestId, mediaId: reservation.mediaId };
  let state;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new UploadError('Upload state is unreadable; preserve it for recovery.'); }
  if (state) check(Object.entries(identity).every(([key, value]) => state[key] === value), 'This state file belongs to another upload.');
  else state = { ...identity, complete: false };
  const result = () => ({ projectId: manifest.projectId, fileId, fileName: file.fileName,
    mediaId: reservation.mediaId, requestId: file.requestId, byteSize: file.byteSize,
    status: 'uploaded', next: 'Call complete_ai_upload, then get_ai_project until this mediaId is ready.' });
  if (state.complete || ['ready', 'validating'].includes(reservation.status)) return result();
  const target = reservation.target;
  check(reservation.status === 'uploading' && target?.protocol === 'gcs-resumable', 'A resumable upload reservation is required.');
  check(target.contentType === file.mimeType, 'The reservation MIME type differs from the reviewed original.');
  check(Number.isSafeInteger(target.chunkSizeBytes) && target.chunkSizeBytes > 0
    && target.chunkSizeBytes <= 32 * 1024 * 1024 && target.chunkSizeBytes % (256 * 1024) === 0, 'Invalid GCS chunk size.');
  storageUrl(target.initiationUrl);
  // Keep a verified snapshot in memory so a local rewrite cannot change later chunks.
  const bytes = await readFile(file.path);
  check(bytes.length === file.byteSize && hash(bytes) === file.sha256, 'The original changed after review. Prepare a new review.');
  if (!state.sessionUrl) {
    const started = await request(fetcher, target.initiationUrl, { method: 'POST', headers: { 'Content-Type': target.contentType, 'x-goog-resumable': 'start' } });
    check([200, 201].includes(started.status), `Storage could not start the upload (HTTP ${started.status}). Retry the same reservation request ID.`);
    state.sessionUrl = storageUrl(started.headers.get('location'));
    await saveJson(statePath, state);
  }
  // Probe after every invocation, including after a lost final PUT response.
  const probe = () => request(fetcher, state.sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${bytes.length}`, 'Content-Length': '0' } });
  let offset = offsetOf(await probe(), bytes.length);
  let recoveries = 0;
  while (offset < bytes.length) {
    const end = Math.min(offset + target.chunkSizeBytes, bytes.length);
    let next;
    try {
      const response = await request(fetcher, state.sessionUrl, { method: 'PUT',
        headers: { 'Content-Type': file.mimeType, 'Content-Range': `bytes ${offset}-${end - 1}/${bytes.length}` }, body: bytes.subarray(offset, end) });
      if (response.status === 429 || response.status >= 500) throw new UploadError(`Storage returned HTTP ${response.status}. Retry with the saved session.`);
      next = offsetOf(response, bytes.length);
    } catch (error) {
      if (recoveries++ >= 2) throw error;
      next = offsetOf(await probe(), bytes.length);
    }
    check(next >= offset && next <= end, 'Storage returned an unexpected upload offset.');
    if (next === offset) {
      check(recoveries++ < 2, 'Upload made no progress. Retry with the saved session.');
    }
    offset = next;
  }
  state.complete = true;
  await saveJson(statePath, state);
  return result();
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: Object.fromEntries(
    ['input', 'manifest', 'approved-digest', 'file-id', 'reservation', 'state'].map(key => [key, { type: 'string' }])) });
  const json = async key => JSON.parse(await readFile(values[key], 'utf8'));
  if (positionals[0] === 'prepare') {
    const manifest = await prepareManifest(await json('input'));
    // Never silently replace an earlier review and its stable upload IDs.
    await writeFile(values.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ manifestPath: path.resolve(values.manifest), reviewDigest: manifestDigest(manifest),
      projectId: manifest.projectId, totalBytes: manifest.files.reduce((sum, file) => sum + file.byteSize, 0), files: manifest.files }, null, 2));
  } else if (positionals[0] === 'upload') {
    check(values.state && values.reservation && values.manifest, 'Manifest, reservation, and state paths are required.');
    console.log(JSON.stringify(await uploadMaterial({ manifest: await json('manifest'), approvedDigest: values['approved-digest'],
      fileId: values['file-id'], reservation: await json('reservation'), statePath: values.state }), null, 2));
  } else throw new UploadError('Usage: upload-materials.mjs prepare --input <selection.json> --manifest <review.json> | upload --manifest <review.json> --approved-digest <sha256> --file-id <id> --reservation <reservation.json> --state <state.json>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    // Keep potentially sensitive paths, URLs, and tool responses out of CLI errors.
    console.error(error instanceof UploadError ? error.message : 'Upload helper failed. Check the local inputs; preserve the manifest and state for retry.');
    process.exitCode = 1;
  });
}
