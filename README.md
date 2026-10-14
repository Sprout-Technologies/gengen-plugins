# GENGEN for Codex

Create video projects from ideas and original materials with your assistant and
[GENGEN](https://gengen.farm/remix-plugin). Published by **Sprout Technologies Inc.**

This repository is a GENGEN-maintained plugin marketplace. It is distributed
directly through GitHub, not listed or approved in OpenAI's public directory.
Only the plugin files are included; the hosted application is separate.

## Install

Open the [plugin homepage](https://gengen.farm/remix-plugin), choose **Set up
Codex**, and send the prepared request. Codex installs GENGEN, starts account
authorization when needed, and checks the live connection after you consent.
**Manual installation** on the homepage copies the same complete request if the
desktop link does not open. The request is not sent automatically.

For manual terminal installation, use a current Codex CLI with plugin support:

```sh
codex plugin marketplace add https://github.com/Sprout-Technologies/gengen-plugins.git &&
codex plugin add gengen-ai-video@gengen &&
codex mcp login gengen --scopes openid --oauth-client-registration dcr
```

These commands stop if installation fails and otherwise open browser authorization.
Keep the terminal running while you sign in and approve the connection. The
`127.0.0.1` success page returns authorization to Codex; close it and return to
Codex. Ask Codex to "Check my GENGEN connection" using `$gengen-connect` to verify
access after manual installation. You can also install GENGEN from the GENGEN
source on the desktop Plugins page, then use this same connection skill.

If `codex` is unavailable or does not recognize `plugin`, use the current Codex
CLI from [OpenAI's official setup instructions](https://developers.openai.com/codex/cli).
The connection check and optional original-file upload helper need Node.js 18+.

Start a new conversation if the newly installed skills and tools are not available.
Installing a plugin does not grant account access or authorize a paid generation.

## Connect again

In Codex, say **Reconnect GENGEN** or invoke **`$gengen-connect`**. This starts a
fresh authorization attempt and verifies the connection afterward. The plugin's
starter prompts and the homepage's **Reconnect in Codex** button also provide
this entry, including when the website already shows an account authorization.
The homepage button opens a request for you to send.

If sign-in is cancelled, times out, or verification fails, the helper stops and
offers this retry entry. Use a new attempt rather than reopening an expired
authorization link. A website authorization record or saved OAuth status alone
does not prove the current device can connect. If the helper cannot run, open
the installed GENGEN plugin's connection controls in Codex or rerun the manual
`codex mcp login gengen --scopes openid --oauth-client-registration dcr` command,
then ask Codex to check the connection.

## Try it

> Create a GENGEN project called Soda Demo. Write a six-second vertical video
> script for an imaginary orange soda bottle. Save the script, but do not generate.

You can then attach product materials. The assistant previews the selected
originals and asks before uploading them. If original bytes are unavailable in
your assistant, use the project's Materials tab. Select a supported video model,
review the script and estimate, and approve generation only when ready. Generation
uses existing GENGEN account access and balance; the final charge follows usage.
Review generated text, speech, and product details before using the output.

## Updates

```sh
codex plugin marketplace upgrade gengen
```

Refresh or reopen the desktop Plugins page and update/reinstall GENGEN as offered
by your client. CLI clients with `plugin add` can rerun the install command to
refresh the installed version. Start a new conversation after updating.

To pin a published version when first adding the marketplace, use `--ref v0.2.7`
instead of following the default branch. Release tags identify the packaged source.

## What is installed

- `.agents/plugins/marketplace.json`: the GENGEN marketplace catalog.
- `plugins/gengen-ai-video/.codex-plugin/plugin.json`: metadata and artwork paths.
- `plugins/gengen-ai-video/.mcp.json`: the OAuth MCP endpoint at `https://gengen.farm/api/mcp`.
- `plugins/gengen-ai-video/skills/ai-video/`: the workflow and original-file upload helper.
- `plugins/gengen-ai-video/skills/gengen-connect/`: account connection, verification, and recovery in Codex.
- `plugins/gengen-ai-video/assets/`: GENGEN artwork.

The package does not include server credentials, API keys, application source,
customer projects, or account data. Source files are supplied for installing and
using the GENGEN integration, subject to the [Terms of Service](https://gengen.farm/terms).
Claude support remains coming soon and is not included in this marketplace release.

## Support and privacy

- [Plugin homepage](https://gengen.farm/remix-plugin)
- [Support](https://gengen.farm/support) · support@gengen.farm
- [Privacy Policy](https://gengen.farm/privacy)
- [Terms of Service](https://gengen.farm/terms)
- [Official Codex marketplace documentation](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)

Disconnect the assistant from the GENGEN plugin homepage to revoke account access.
This does not delete projects or cancel submitted videos. For private account or
security issues, email support. Do not post credentials, signed URLs, or private
materials in GitHub issues.
