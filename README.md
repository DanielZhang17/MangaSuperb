# MangaSuperb - AI Manga Generator

An AI-powered manga generation tool that uses Google's Gemini API to create manga scripts and generate panel images.

## Features

- 🎨 Generate complete manga scripts with multiple panels
- 🖼️ AI-generated manga panel images (when available)
- 💾 Server-side environment configuration for API access and generated content
- 👤 Randomly assigned default user avatars (index 1–4) surfaced via the REST API
- 🔄 Regenerate stories on demand
- ⬇️ Download individual or all panel images
- 🔑 Support for multiple Gemini models

## Setup

### Prerequisites

- Python 3.10 or higher
- Redis instance for background jobs
- Google Gemini API key configured as `GEMINI_API_KEY` in your `.env` file (get one at [Google AI Studio](https://makersuite.google.com/app/apikey))

### Installation

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # optional: development tooling
```

Create a `.env` file in the project root and add your Gemini credentials so the backend can authenticate without prompting end users:

```bash
echo "GEMINI_API_KEY=your-key-here" >> .env
```

### Running the application

```bash
flask --app app run
# or
python app.py
```

### Linting

Ruff is used to enforce import order and lightweight static analysis:

```bash
ruff check .
```

## Backend modernization plan

The current iteration focuses on laying foundations for a modular, maintainable backend. The plan is split into iterative tracks so future contributors can continue scaling functionality.

1. **Stabilise core services** – Extract Gemini, validation, and job orchestration helpers into dedicated service modules. This keeps the Flask layer thin and testable.
2. **Modularise HTTP endpoints** – Replace the monolithic Flask app with blueprints grouped by concern (auth, characters, scripts, comics, jobs, and system). This enables targeted iteration on each API surface.
3. **Harden asynchronous workflows** – Centralise RQ job implementations so both the API and worker share identical logic, reducing drift and making retries/reporting easier to extend.
4. **Automate quality gates** – Introduce Ruff configuration and development requirements so linting is consistent across environments. This should be integrated into CI in a follow-up.
5. **Observe and iterate** – With dependencies abstracted, upcoming work can focus on pagination, richer PDF generation, and collaborative editing without reworking the entire stack.

Each item above is documented in greater detail inside the codebase and the system design notes below, ensuring the roadmap remains visible alongside the implementation.

## Project Structure

```
MangaSuperb/
├── app.py                   # WSGI entry point
├── mangasuperb/
│   ├── __init__.py          # Flask application factory
│   ├── extensions.py        # Shared extensions (db, login, queue)
│   ├── routes/              # Blueprint modules grouped by domain
│   └── services/            # Gemini helpers and background jobs
├── models.py                # SQLAlchemy models
├── storage.py               # Cloudflare R2 helper
├── worker.py                # RQ worker bootstrap
├── requirements*.txt        # Runtime and development dependencies
├── docs/
│   └── system_design.md     # Data-flow and architecture overview
└── static/                  # Frontend assets
```

## Usage

1. **Launch the App**: Start the backend after configuring your `.env`; the Gemini API key is loaded server-side so no user input is required.
2. **Select Model**: Choose between Gemini 2.5 Flash Image or Gemini 2.5 Pro.
3. **Enter Story Idea**: Type your manga story concept in the text box at the bottom.
4. **Generate**: Click "Generate Manga" or press Enter to create your manga.
5. **Download**: Download individual panels or all images at once.

## Documentation

A detailed systems overview, including data-flow diagrams and component responsibilities, is available at [`docs/system_design.md`](docs/system_design.md).

## License

Apache License 2.0
