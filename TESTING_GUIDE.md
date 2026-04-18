# Testing Guide

## Overview

This document describes the testing strategy, commands, and quality gates for the COVID-19 Cough Detection platform.

## Test Framework Strategy

| Layer | Framework | Purpose |
|-------|-----------|---------|
| Client | Vitest + jsdom | Unit tests, component tests |
| Server | node:test (built-in) | Unit tests, integration tests |
| Python | pytest | Unit tests, contract tests |
| E2E | Custom (fetch) | Full-stack integration (opt-in) |

**Key Principle**: No mixed framework execution within the same package-level test entrypoint.

## Quick Start - Run All Tests

```bash
# From repository root

# 1. Type checking
corepack pnpm check

# 2. Linting
corepack pnpm lint

# 3. Build
corepack pnpm build

# 4. Unit tests (Client + Server)
corepack pnpm test

# 5. Smoke tests (build contract)
corepack pnpm test:smoke

# 6. Version consistency check
corepack pnpm check:version

# 7. Python tests
python -m pytest python_project/tests -q

# 8. Python compilation check
python -m compileall python_project/src/covid_cough_detection
```

## Client Testing (Vitest)

### Run Tests

```bash
cd client
corepack pnpm test
```

### Test Files

| File | Coverage |
|------|----------|
| `src/lib/api.test.ts` | API response formatting, error handling |
| `src/lib/audio-format.test.ts` | MIME type detection, filename generation |
| `src/pages/home-state.test.ts` | State transitions, recording flow |
| `src/components/ErrorBoundary.test.tsx` | Error boundary rendering |

### Watch Mode

```bash
cd client
corepack pnpm test -- --watch
```

## Server Testing (node:test)

### Run Tests

```bash
cd server
corepack pnpm test
```

### Test Files

| File | Coverage |
|------|----------|
| `src/index.test.ts` | API endpoints, CORS, rate limiting |
| `src/audio-validator.test.ts` | Audio validation logic |
| `src/audio-converter.test.ts` | FFmpeg conversion |
| `src/rate-limiter.test.ts` | Rate limiting algorithm |
| `src/delivery-contract.test.ts` | Release boundary checks |
| `src/build-smoke.test.ts` | Build output verification |

### Smoke Tests

```bash
cd server
corepack pnpm test:smoke
```

Smoke tests verify:
- Build artifacts exist
- Required files are present
- Version information is accessible

## Python Testing (pytest)

### Run Tests

```bash
cd python_project
python -m pytest tests/ -q
```

### Test Files

| File | Coverage |
|------|----------|
| `test_model_startup_contract.py` | Strict startup behavior |
| `test_api_contract.py` | API response shapes |
| `test_audio_processor_edge_cases.py` | Audio processing edge cases |
| `test_model_mel_shape_contract.py` | Feature extraction shapes |

### With Coverage

```bash
python -m pytest python_project/tests -q \
  --cov=covid_cough_detection \
  --cov-report=term-missing
```

### Compilation Check

```bash
python -m compileall python_project/src/covid_cough_detection
```

## End-to-End Testing

E2E tests are **opt-in** and excluded from default test runs because they require running services. When `RUN_E2E` is not set or services are unavailable, tests will be automatically skipped with a clear message.

### Prerequisites

1. Node gateway running at `http://localhost:3000`
2. Python backend running at `http://localhost:8000`

### Run E2E Tests

```bash
RUN_E2E=1 corepack pnpm test:e2e
```

### Custom URLs

```bash
RUN_E2E=1 \
E2E_NODE_URL=http://localhost:3000 \
E2E_PYTHON_URL=http://localhost:8000 \
corepack pnpm test:e2e
```

### Automatic Service Detection

The E2E test suite includes automatic service availability checks:
- If `RUN_E2E` is not set, tests are skipped with message: "ℹ️ E2E tests skipped. Set RUN_E2E=1 to enable."
- If services are not responding, tests are skipped with warnings showing which service failed
- This prevents false failures in CI environments where services may not be running
- The skip is handled gracefully using `describe.skip()` - no errors are thrown

### E2E Test Coverage

| Test | Description |
|------|-------------|
| Health endpoints | Verify `/api/healthz` and `/healthz` return 200 |
| Readiness endpoints | Verify `/api/readyz` and `/readyz` return service status |
| Version consistency | Verify Node and Python report matching API versions |
| Error handling | Verify consistent error response formats |
| CORS headers | Verify CORS headers are present |

## CI/CD Integration

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs these jobs:

1. **js-check** - TypeScript type checking
2. **js-lint** - ESLint validation
3. **js-build** - Build verification
4. **js-test** - Unit tests
5. **js-version-contract** - Version consistency
6. **js-smoke-contract** - Build smoke tests
7. **python-quality** - Python tests and compilation
8. **docker-build-validation** - Docker image build

## Test Organization Principles

### Unit Tests
- Test individual functions/components in isolation
- Mock external dependencies
- Fast execution (< 100ms per test)

### Integration Tests
- Test component interactions
- Use real dependencies where practical
- Moderate execution time

### Contract Tests
- Verify API request/response shapes
- Validate error envelopes
- Check version synchronization

### E2E Tests
- Test complete user flows
- Require running services
- Slower but highest confidence

## Writing Effective Tests

### Test Naming Convention

```typescript
// Good: Describes behavior
it('returns positive label when probability >= 0.5', () => { ... })

// Bad: Too vague
it('works correctly', () => { ... })
```

### Assertion Guidelines

```typescript
// Good: Specific assertions
expect(response.label).toBe('positive')
expect(response.prob).toBeGreaterThanOrEqual(0)
expect(response.prob).toBeLessThanOrEqual(1)

// Bad: Overly broad
expect(response).toBeDefined()
```

### Test Structure

```typescript
describe('ApiClient', () => {
  describe('predict', () => {
    it('formats response correctly', () => { ... })
    it('handles errors gracefully', () => { ... })
    it('respects timeout configuration', () => { ... })
  })
})
```

## Troubleshooting

### Common Issues

**Tests fail after dependency update:**
```bash
# Clear caches
corepack pnpm clean
corepack pnpm install
```

**TypeScript errors in tests:**
```bash
# Regenerate types
corepack pnpm check
```

**Python import errors:**
```bash
# Reinstall in development mode
python -m pip install -e "./python_project[dev]"
```

**E2E connection refused:**
```bash
# Verify services are running
curl http://localhost:3000/api/healthz
curl http://localhost:8000/healthz
```

## Coverage Goals

| Component | Target | Current |
|-----------|--------|---------|
| Client | 80% | ~75% |
| Server | 85% | ~80% |
| Python | 90% | ~85% |

---
Last Updated: 2024
Version: 1.0.13
