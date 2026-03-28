# Releasing

This project uses [changesets](https://github.com/changesets/changesets) to track changes, manage version bumps, and generate changelogs. Releases are published as Docker images to Docker Hub.

## Overview

1. Contributors add changesets during development
2. Changesets accumulate on `main`
3. `pnpm version` consumes changesets, bumps `package.json`, and updates `CHANGELOG.md`
4. `scripts/publish.sh` builds and pushes the Docker image

## Adding a Changeset

After making a meaningful change, run:

```bash
pnpm changeset
```

This prompts you to:
- Select the semver bump type (patch / minor / major)
- Write a short summary of the change

A markdown file is created in `.changeset/`. Commit it alongside your code.

### When to Add a Changeset

- **Yes**: New features, bug fixes, breaking changes, dependency updates that affect behavior
- **No**: CI changes, docs-only changes, refactors with no user-facing effect, test-only changes

### Semver Guidelines

| Type | When |
|-------|------|
| **patch** | Bug fixes, minor improvements, dependency bumps |
| **minor** | New tools, new parameters, new features |
| **major** | Breaking changes to tool interfaces, removed tools, config changes that require migration |

## Versioning

When ready to release, consume accumulated changesets:

```bash
pnpm version
```

This:
- Deletes consumed `.changeset/*.md` files
- Bumps the version in `package.json`
- Updates `CHANGELOG.md` with entries linked to GitHub PRs

Commit the result:

```bash
git add -A && git commit -m "Version Packages"
git tag v<new-version>
git push && git push --tags
```

## Publishing

Build and push the Docker image:

```bash
./scripts/publish.sh v<new-version>
```

This builds the image, tags it (and `latest` for non-prerelease versions), and pushes to Docker Hub (`eins78/meteoswiss-mcp-server`).

## Quick Reference

```bash
# During development — add a changeset
pnpm changeset

# At release time — bump version and update changelog
pnpm version

# Publish Docker image
./scripts/publish.sh v1.2.0
```
