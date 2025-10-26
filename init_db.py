"""
Database initialization script for MangaSuperb.

Usage:
    source .venv/bin/activate
    pip install -r requirements.txt
    python init_db.py
"""
from __future__ import annotations

import sys

from sqlalchemy import inspect, text

from mangasuperb import create_app
from mangasuperb.extensions import db


def init_database() -> bool:
    """Initialise the database and create all tables."""

    print("=" * 60)
    print("MangaSuperb Database Initialization")
    print("=" * 60)

    app = create_app()
    print(f"\nDatabase URL: {app.config['SQLALCHEMY_DATABASE_URI']}")

    with app.app_context():
        try:
            print("\n[1/3] Creating database tables...")
            db.create_all()

            inspector = inspect(db.engine)
            tables = inspector.get_table_names()
            print(f"✓ Tables present ({len(tables)}): {', '.join(sorted(tables))}")

            print("\n[2/3] Testing database connection...")
            db.session.execute(text("SELECT 1"))
            print("✓ Database connection successful")

            print("\n[3/3] Ready to use!")
            return True
        except Exception as exc:  # pragma: no cover - setup aid
            print(f"\n✗ Error initialising database: {exc}")
            print("\nTroubleshooting checklist:")
            print("  1. PostgreSQL is running and reachable.")
            print("  2. Credentials in .env match the database.")
            print("  3. The target database exists (create with: createdb manga).")
            return False


def reset_database() -> bool:
    """Drop and recreate the schema (USE WITH CAUTION!)."""

    confirmation = input("\n⚠️  This will DELETE ALL DATA. Type 'yes' to continue: ")
    if confirmation.lower() != "yes":
        print("Aborted.")
        return False

    app = create_app()
    with app.app_context():
        try:
            print("\n[1/2] Dropping all tables...")
            db.drop_all()
            print("✓ Tables dropped")

            print("\n[2/2] Recreating tables...")
            db.create_all()
            print("✓ Tables recreated")
            return True
        except Exception as exc:  # pragma: no cover - setup aid
            print(f"\n✗ Error resetting database: {exc}")
            return False


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--reset":
        success = reset_database()
    else:
        success = init_database()

    sys.exit(0 if success else 1)
