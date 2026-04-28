# Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for version management and changelog generation.

## Adding a changeset

When making changes that should be released:

```bash
bun changeset
```

This will prompt you to:
1. Select which packages have changed
2. Choose a version bump type (patch/minor/major)
3. Write a summary of the changes

## Releasing

To version and publish:

```bash
bun changeset version   # Update versions and CHANGELOG.md
bun changeset publish   # Publish to npm
```
