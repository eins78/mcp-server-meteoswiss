# Releasing

Releases are triggered by creating a GitHub Release. The tag name determines the version.

## How to Release

1. Ensure `main` is in a releasable state (CI green)
2. Create a GitHub Release:
   - Via CLI: `gh release create v2.0.1 --title "v2.0.1" --generate-notes`
   - Via GitHub UI: Releases → Draft a new release → Choose tag (create new: `v2.0.1`) → Write release notes → Publish
3. The [release workflow](../../.github/workflows/release.yml) automatically:
   - Runs full CI validation (lint, build, test)
   - Publishes `meteoswiss-mcp` to npm
   - Builds and pushes `ghcr.io/eins78/meteoswiss-mcp` to GHCR (linux/amd64 + linux/arm64)
4. Deploy manually by pulling the new image

## Version Convention

The tag name must start with `v` followed by a valid semver version:

| Tag | npm version | Docker tags | npm dist-tag |
|-----|-------------|-------------|--------------|
| `v2.0.1` | `2.0.1` | `2.0.1`, `latest` | `latest` |
| `v2.1.0-rc.1` | `2.1.0-rc.1` | `2.1.0-rc.1` | `next` |

Pre-release versions (containing a hyphen) do **not** update the `latest` tag on npm or Docker.

## Security

The release workflow follows [npm security best practices](https://www.zachleat.com/web/npm-security/):

- **No npm tokens** — uses OIDC Trusted Publishers instead of long-lived `NPM_TOKEN`
- **npm provenance** — packages include signed attestation linking to the source commit
- **Pinned action SHAs** — all `uses:` references are pinned to full commit SHA, not mutable tags
- **Minimal permissions** — each job requests only the permissions it needs
- **Separate publish jobs** — npm and Docker publish run in isolated jobs with different permission sets
- **GitHub environment** — npm publish runs in an `npm` environment (can add required reviewers)

### Setup: npm Trusted Publishers (OIDC)

npm Trusted Publishers require the package to exist first. One-time bootstrap:

1. **First publish (manual, one-time only):**
   ```bash
   npm adduser  # or: npm login
   cd packages/meteoswiss-mcp
   npm publish --access public --provenance
   ```
2. **Configure Trusted Publishers** on npmjs.com:
   - Go to https://www.npmjs.com/package/meteoswiss-mcp → **Settings** tab
   - Under **Trusted Publishers**, add:
     - **Repository owner:** `eins78`
     - **Repository name:** `meteoswiss-llm-tools`
     - **Workflow filename:** `release.yml`
     - **Environment:** `npm`
3. **Create GitHub environment** named `npm`:
   - Repo Settings → Environments → New environment → `npm`
   - Optionally add required reviewers for an approval gate
4. **Lock down the package** on npmjs.com:
   - Settings → Publishing access → "Require two-factor authentication and disallow tokens"
5. **Delete any npm tokens** you created for the bootstrap

After this, all future publishes use OIDC — no tokens stored anywhere.

GHCR push uses the built-in `GITHUB_TOKEN` — no configuration needed.

## Version in package.json

The `version` field in `package.json` is updated automatically during CI from the release tag. You do not need to bump it manually before releasing.

## Quick Reference

```bash
# Create a release (triggers workflow)
gh release create v2.0.1 --title "v2.0.1" --generate-notes

# Create a pre-release
gh release create v2.1.0-rc.1 --title "v2.1.0-rc.1" --prerelease --generate-notes

# Check workflow status
gh run list --workflow=release.yml

# Pull the published image
docker pull ghcr.io/eins78/meteoswiss-mcp:2.0.1
```
