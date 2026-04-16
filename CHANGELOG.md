# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.13] - 2024-04-16

### Fixed
- **CI/CD**: Fixed pnpm version mismatch in GitHub Actions workflow (updated from v9 to v10.33.0)
- **Version Sync**: Created missing `server/src/config/version.ts` file for version consistency checks
- **Build Process**: Ensured all version files are synchronized across monorepo packages

### Changed
- **CI Configuration**: Updated `.github/workflows/ci.yml` to use exact pnpm version matching root `package.json`
- **Documentation**: Enhanced README with clearer development setup instructions

### Technical Debt
- Synchronized all version metadata files using `sync:version` script
- Verified version consistency across TypeScript, Python, and package.json files

## [1.0.12] - Previous Release

### Added
- Rate limiter with LRU-style eviction for memory safety
- Comprehensive test coverage for audio validation and conversion
- Docker multi-stage build optimization

### Fixed
- CSS variable definitions for Tailwind theme
- Theme detection race condition in Toaster component
- TypeScript module resolution inconsistencies

---

## Version History Summary

| Version | Date | Key Changes |
|---------|------|-------------|
| 1.0.13 | 2024-04-16 | CI/CD fixes, version sync improvements |
| 1.0.12 | Previous | Rate limiting, test coverage, Docker optimization |

For detailed changes in previous versions, see `CHANGES_SUMMARY.md`.
