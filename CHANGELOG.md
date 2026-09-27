# Changelog

## Version 0.1.0

First release outside of 'alpha' stage. This release is not considered stable and as such is not recommended for production use. Breaking changes may be introduced with only a minor version bump.
This will happen until v1.0.0 is released, which will be the first stable release.

Major refactor to modernize codebase, dependencies, and distribution:

- Node.js v22+ required
- Migrated to ESM: The library is published as an ECMAScript module. All imports use .js extensions.
- Upgraded dependencies: ioredis, detritus-client, discord-api-types, winston, TypeScript, and build/dev tooling are updated to recent versions.
- Deep/internal imports are no longer supported.

## Version 0.1.1

- Added ChannelNoteFound, GuildNotFound, GuildUnavailable, ShardInactive, MinimalChannel, MinimalRole, RolesObject to default exports

# Version 0.2.0

- Updated Discord channel types to their current names.
- Updated cached role data to use the `colors` object instead of the deprecated `color` property. **This is a breaking change for consumers using `CachedMinimalRole`.**
- Added typed ESLint project support and deprecated API detection.
- Replaced deprecated `substr()` usage with `substring()`.
- Fixed an asynchronous guild lookup to properly await the result.

# Version 0.2.1

- Added get shardsActive to guild manager
