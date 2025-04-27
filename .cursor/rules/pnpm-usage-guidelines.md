# PNPM Usage Guidelines

This project uses pnpm as the package manager. Here are the key guidelines:

## Key Benefits of pnpm

1. **Efficient disk space usage**: pnpm uses a content-addressable store to avoid duplication of dependencies
2. **Strict dependency resolution**: Prevents using undeclared dependencies
3. **Fast installation**: Generally faster than npm and yarn
4. **Workspace support**: Better monorepo management

## Required Usage

1. Always use pnpm commands instead of npm:
   - Use `pnpm install` instead of `npm install`
   - Use `pnpm add <pkg>` instead of `npm i <pkg>`
   - Use `pnpm run <command>` instead of `npm run <command>`

2. For adding dependencies:
   - Production dependencies: `pnpm add <package-name>`
   - Development dependencies: `pnpm add -D <package-name>`

3. Workspaces:
   - Use `-w` or `--workspace-root` flag when operating at workspace root

## Migration from npm

When migrating from npm, remember:

1. Delete `node_modules` and `package-lock.json` before running `pnpm install`
2. Update CI/CD pipelines to use pnpm commands
3. Update documentation and scripts to reference pnpm

## Commit Rules

1. Always commit `pnpm-lock.yaml`
2. Do not commit the `.pnpm` directory

## References

- [pnpm CLI documentation](https://pnpm.io/pnpm-cli)
- [pnpm vs npm comparison](https://pnpm.io/feature-comparison)
