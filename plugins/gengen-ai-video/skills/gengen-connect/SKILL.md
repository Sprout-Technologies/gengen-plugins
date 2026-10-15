---
name: gengen-connect
description: Connect, check, or reauthorize a GENGEN account in Codex after installing GENGEN, when login did not finish, or when GENGEN tools require authentication. Handles requests such as "Connect GENGEN" and "Reconnect GENGEN" without creating a video.
---

# Connect GENGEN

Use this workflow for account setup and recovery. The user can invoke
`$gengen-connect` or ask "Reconnect GENGEN" in Codex.

Before a normal connection or reconnection in Codex, run
`node scripts/update.mjs` from this skill's directory. This is a best-effort daily
update of the official unpinned GitHub package using the Codex CLI. Respect host
approvals and user opt-outs; skip it for `--check` status-only requests so those
remain read-only. Continue connection setup if updating is unavailable. Do not
retry denied updates or silently start a different installation mechanism. The
helper accepts `--disable` and `--enable` when the user requests that preference.
Cached/no-change checks need no narration; newly installed skills may require a
new host session before they are loaded.

Run the bundled helper with Node.js 18+ from this skill's directory:

```sh
node scripts/connect.mjs
```

It checks the installed `gengen` MCP connection, starts Codex's browser OAuth
login if needed, waits for the user to sign in and consent, then verifies live
authenticated tool discovery and a read of the GENGEN project panel resource.
It uses Codex's credential storage; it does not read or print tokens, list private
projects, create projects, upload files, or start paid generation.

For an explicit request to authorize again or change the connected account, run
`node scripts/connect.mjs --reauthorize`. For a status-only request, run
`node scripts/connect.mjs --check`; this never starts login. `--codex /path/to/codex`
selects the same current Codex CLI used to install the plugin. The helper also
checks the desktop-bundled CLI on macOS when no path is supplied.

Keep the process alive while the user completes browser consent. If browser
opening fails, present the authorization link printed by Codex from that still
running attempt. A successful `127.0.0.1` page is the local callback; the user can
close it and return to Codex. Never invent an authorization URL, reuse a link from
an exited attempt, collect passwords or tokens in chat, or approve consent for
the user. Run on the user's local Codex computer, not a remote worker.

Report connection success only when the helper exits with code 0 and confirms
the authenticated check. An installed plugin, saved OAuth status, browser success
page, or website authorization record alone is not that check. After a timeout,
cancelled login, or failed check, explain the reported failure and offer
`$gengen-connect` / "Reconnect GENGEN" as the retry entry. Do not repeat login
automatically after a failed attempt or log the user out to fix it.

If Node.js or a supported CLI is unavailable, use the installed GENGEN plugin's
GENGEN connection controls in Codex. The manual CLI alternative is:

```sh
codex mcp login gengen --scopes openid --oauth-client-registration dcr
```

Then run the helper with `--check`, or call the read-only `get_ai_workflow` tool
if available. If neither check can run, say verification is still pending. A
new Codex conversation may be needed to load newly installed skills and tools;
once available, call `get_ai_workflow` before resuming the user's video request.
