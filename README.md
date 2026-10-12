# GenGen for Codex

Create video projects from ideas and original materials with your assistant and
[GENGEN](https://gengen.farm/remix-plugin). Published by **Sprout Technologies Inc.**

This repository is a GENGEN-maintained plugin marketplace. It is distributed
directly through GitHub, not listed or approved in OpenAI's public directory.
Only the plugin files are included; the hosted application is separate.

## Install

Use a current Codex CLI with `codex plugin marketplace` support:

```sh
codex plugin marketplace add https://github.com/Sprout-Technologies/gengen-plugins.git
```

Then open the desktop app's Plugins page, refresh or restart the app if needed,
select the **GENGEN** source, and install **GenGen**. CLI versions that expose
`codex plugin add` can also install it with:

```sh
codex plugin add gengen-ai-video@gengen
```

If `codex` is unavailable or does not recognize `plugin`, use the current Codex
CLI from [OpenAI's official setup instructions](https://developers.openai.com/codex/cli).
The optional original-file upload helper needs Node.js 18 or newer.

After installation, connect the GENGEN connector in your assistant. Sign in to
your GENGEN account and review the OAuth permissions. Start a new conversation
so the newly installed skill and tools are available. Installing a plugin does
not grant account access or authorize a paid generation.

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

Refresh or reopen the desktop Plugins page and update/reinstall GenGen as offered
by your client. CLI clients with `plugin add` can rerun the install command to
refresh the installed version. Start a new conversation after updating.

To pin a published version when first adding the marketplace, use `--ref v0.2.5`
instead of following the default branch. Release tags identify the packaged source.

## What is installed

- `.agents/plugins/marketplace.json`: the GENGEN marketplace catalog.
- `plugins/gengen-ai-video/.codex-plugin/plugin.json`: metadata and artwork paths.
- `plugins/gengen-ai-video/.mcp.json`: the OAuth MCP endpoint at `https://gengen.farm/api/mcp`.
- `plugins/gengen-ai-video/skills/ai-video/`: the workflow and original-file upload helper.
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
