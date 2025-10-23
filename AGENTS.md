# Repository Guidelines

## Project Structure & Module Organization
- `app.py` hosts the Flask API, health checks, and queue wiring; keep endpoints thin and push long tasks to workers.
- `worker.py` runs Redis RQ jobs and updates `Comic`/`ComicPage`; reuse its utilities for new background flows.
- Domain models live in `models.py`; mirror schema changes in `init.sql` and document them in `init_db.py`.
- SPA assets sit in `static/`; environment defaults stay in `config.py`—add new keys there with `.env` guidance.

## Build, Test, and Development Commands
- `python -m venv .venv && source .venv/bin/activate` prepares an isolated Python environment.
- `pip install -r requirements.txt` installs Flask, RQ, Gemini, and R2 dependencies.
- `python init_db.py` creates PostgreSQL tables per `Config`; rerun after altering models.
- `python app.py` serves the app on `http://localhost:5000`; run `python worker.py` in parallel to drain the queue.
- Tail logs via `tail -f logs/mangasuperb.log` when debugging production-like issues.

## Coding Style & Naming Conventions
- Follow PEP 8, 4-space indentation, `snake_case` functions, and `CamelCase` SQLAlchemy models with explicit relationships.
- Prefer type hints, module-level `logger`, and f-strings; guard high-latency calls with clear error messages.
- Keep the frontend framework-free: semantic HTML, minimal inline JS, lowercase-kebab IDs, and reusable CSS classes.

## Testing Guidelines
- No suite exists yet; add `pytest` cases under `tests/` for each backend change.
- Exercise endpoints with `app.test_client()` and mock Gemini/R2 integrations to avoid external calls.
- For queue work, seed a temporary SQLite database, run handlers directly, and assert status transitions before/after commits.
- Run `pytest` locally and record coverage gaps or manual checks in your PR.

## Commit & Pull Request Guidelines
- Match the concise, present-tense history (`构建基本原型框架`, `更改为单页生成`); keep subjects ≤ 72 characters (e.g., `worker: handle empty panel list`).
- Reference issues, flag schema/config updates, and list commands executed or tests added.
- PRs should include motivation, manual/automated test evidence, and screenshots for UI edits; request both backend and frontend review on cross-stack work.

## User Avatar Handling
- `users.avatar_index` stores a 1–4 selector for default avatars; mirror the schema change in `init.sql` and backfill existing records when migrating.
- Registration randomly assigns the index; keep logic server-side and expose only the integer in responses so the frontend can map to static assets.
- Default avatar art should live under `static/avatars/avatar-{index}.png`; update `Config` or deployment assets if you add or renumber variants.

## Security & Configuration Tips
- Keep API keys, database passwords, and R2 credentials in `.env`; never commit secrets or sample secrets with real values.
- Treat R2 URLs as public surfaces; sanitize uploaded assets and delete debugging files promptly.
- Gate new external services behind `Config` switches and extend `/health` checks when infrastructure dependencies grow.
