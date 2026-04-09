# Experimental Modules

This directory contains research code that is **not** integrated into production API endpoints.

Production runtime entrypoints are limited to:
- `src/app.py`
- `src/audio_processor.py`
- `src/model_inference.py`

Any module here must be treated as prototype code until explicitly integrated with:
- API route wiring
- contract documentation
- automated tests
