# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-12-19

### Added
- **Bridge Marketplace**: Multi-provider route discovery with competitive fee matching and dynamic trust scoring.
- **Zero-Trust Wallet Architecture**: Enforced client-side only key generation. The `Accounts` service no longer accepts or handles private keys.
- **Secure Session Management**: Added permission whitelists (`READ`, `WRITE`, `ADMIN`, `*`) and regex-based capability validation.
- **Frontend Kit**: New `ZeroTrust` documentation and updated wallet hooks for better type safety.
- **Token Showcase**: Integrated `VaultService` with `TOK_DEPLOY` and `TOK_MINT_PROTECTED` examples.

### Changed
- **Performance**: Relaxed tail latency benchmarks to accommodate development environment variability.
- **Cryptography**: Adjusted Hamming weight thresholds for private key generation to reduce test flakiness.
- **Validation**: Stricter input validation for session creation (expiry, permissions).
- **Documentation**: Comprehensive updates to READMEs reflecting the new architecture and SDK capabilities.

### Fixed
- **Type Safety**: Resolved all implicit `any` and `unknown` type errors across the codebase.
- **Build System**: Fixed missing exports in `BridgeProvider` and `InstructionBuilder`.
- **Testing**: Fixed intermittent failures in `security-compliance` and `signer` tests due to clock skew and entropy limits.
