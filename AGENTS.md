# Repository Guidelines

## Project Structure & Module Organization
The Flask factory in `mangasuperb/__init__.py` wires logging, Swagger, and blueprints. Domain routes reside in `mangasuperb/routes/` (`auth`, `characters`, `scripts`, `comics`, `jobs`, `system`) while long-running tasks and Gemini helpers live in `mangasuperb/services/`. ORM models sit in `models.py`; keep `init.sql` and `init_db.py` in sync with every schema change. Static assets, including default avatars (`static/avatars/avatar-{index}.png`), live under `static/`. Background processing boots from `worker.py`, and reusable R2 logic is collected in `storage.py`.

## Build, Test, and Development Commands
Create an isolated environment with `python -m venv .venv && source .venv/bin/activate`. Install dependencies via `pip install -r requirements.txt` (add `-r requirements-dev.txt` for lint tooling). Initialise the database using `python init_db.py`, then run the API through `python app.py` and drain Redis jobs with `python worker.py`. Swagger lives at `/api/docs/` and `/health` reports database, Redis, and R2 status; tail `logs/mangasuperb.log` when debugging production-like issues.

## Coding Style & Naming Conventions
Follow PEP 8 with 4-space indents, `snake_case` functions, and `CamelCase` SQLAlchemy models. Add type hints for public functions, prefer module-level `logger` instances, and rely on f-strings. Guard external calls (Gemini, R2) with explicit error messages. Keep the SPA framework-free—semantic HTML, lowercase-kebab IDs, and small, reusable CSS classes. Use Ruff (`ruff check .`) to enforce import order and lightweight static analysis.

## Testing Guidelines
Place backend tests in `tests/` using `pytest`. Exercise routes with `app.test_client()` and mock Gemini/R2 clients to avoid network calls. Queue handlers should run against a temporary SQLite database and be invoked directly to assert status transitions. Run `pytest` before opening a PR and document any manual checks or coverage gaps.

## Commit & Pull Request Guidelines
Adopt the concise, present-tense history already in use. Keep subjects ≤72 characters (e.g., `auth: allow username login`). Reference related issues, note schema/config changes, and list commands executed or tests added. PRs should describe motivation, include screenshots for UI tweaks, and request cross-stack review when both backend and frontend change.

## Security & Configuration Tips
Store secrets (PostgreSQL, Redis, Gemini, R2) in `.env` and never commit real values. Gemini credentials are consumed exclusively server-side; avoid introducing frontend UI for API keys. Avatars are assigned by storing `users.avatar_index` (1–4); ensure assets remain aligned with those indices during deployments. Run `/health` after configuration changes to confirm downstream services. Gate new integrations behind `Config` switches and extend the health check when adding dependencies.
