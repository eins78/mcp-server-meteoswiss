# Releasing

This project uses [changesets](https://github.com/changesets/changesets) to track changes, manage version bumps, and generate changelogs. Releases are published as Docker images to Docker Hub.

## Overview

1. Contributors add changesets during development (`pnpm changeset`)
2. Changesets accumulate on `main`
3. `pnpm release` does the rest: version bump → commit → tag → Docker publish

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

## Releasing

When ready to release, run:

```bash
pnpm release
```

This single command (`scripts/release.sh`) does:
1. Consumes pending `.changeset/*.md` files
2. Bumps the version in `package.json`
3. Updates `CHANGELOG.md` with entries linked to GitHub PRs
4. Commits the version bump
5. Creates a git tag (`v<version>`)
6. Pushes commit and tag to origin
7. Builds and publishes the Docker image to Docker Hub

### Prerequisites

- Clean working tree (no uncommitted changes)
- At least one pending changeset
- Docker Hub login (`docker login`)

### Dry Run

Preview what would happen without pushing anything:

```bash
pnpm release -- --dry-run
```

## Quick Reference

```bash
# During development — add a changeset
pnpm changeset

# Release — version bump, tag, and Docker publish
pnpm release
```
