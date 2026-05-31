# Changelog

## Version 0.1.0

First release outside of 'alpha' stage. This release is not considered stable and as such is not recommended for production use. Breaking changes may be introduced with only a minor version bump.
This will happen until v1.0.0 is released, which will be the first stable release.

Major refactor to modernize codebase, dependencies, and distribution:

- Node.js v22+ required
- Migrated to ESM: The library is published as an ECMAScript module. All imports use .js extensions.
- Upgraded dependencies: ioredis, detritus-client, discord-api-types, winston, TypeScript, and build/dev tooling are updated to recent versions.
- Deep/internal imports are no longer supported.
