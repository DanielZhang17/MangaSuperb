"""
Database initialization script for MangaSuperb
Run this script to create all database tables
"""
import os
import sys
from config import Config
from models import db, MangaJob, User
from flask import Flask

def init_database():
    """Initialize the database and create all tables"""

    print("=" * 60)
    print("MangaSuperb Database Initialization")
    print("=" * 60)

    # Create Flask app
    app = Flask(__name__)
    app.config.from_object(Config)

    print(f"\nDatabase URL: {app.config['SQLALCHEMY_DATABASE_URI']}")

    # Initialize db with app
    db.init_app(app)

    with app.app_context():
        try:
            print("\n[1/3] Creating database tables...")

            # Create all tables
            db.create_all()

            print("✓ Tables created successfully:")
            print("  - manga_jobs")
            print("  - users")

            # Verify tables exist
            from sqlalchemy import inspect
            inspector = inspect(db.engine)
            tables = inspector.get_table_names()

            print(f"\n[2/3] Verifying tables...")
            print(f"✓ Found {len(tables)} table(s): {', '.join(tables)}")

            # Test connection
            print("\n[3/3] Testing database connection...")
            result = db.session.execute(db.text("SELECT 1"))
            print("✓ Database connection successful")

            print("\n" + "=" * 60)
            print("Database initialization completed successfully!")
            print("=" * 60)

            return True

        except Exception as e:
            print(f"\n✗ Error initializing database: {str(e)}")
            print("\nPlease ensure:")
            print("1. PostgreSQL is running")
            print("2. Database credentials in .env are correct")
            print("3. Database 'manga' exists (create with: createdb manga)")
            return False

def reset_database():
    """Drop all tables and recreate them (USE WITH CAUTION!)"""

    response = input("\n⚠️  WARNING: This will DELETE ALL DATA! Type 'yes' to confirm: ")

    if response.lower() != 'yes':
        print("Aborted.")
        return False

    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)

    with app.app_context():
        try:
            print("\n[1/2] Dropping all tables...")
            db.drop_all()
            print("✓ All tables dropped")

            print("\n[2/2] Creating fresh tables...")
            db.create_all()
            print("✓ Tables recreated")

            print("\nDatabase reset completed successfully!")
            return True

        except Exception as e:
            print(f"\n✗ Error resetting database: {str(e)}")
            return False

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--reset':
        success = reset_database()
    else:
        success = init_database()

    sys.exit(0 if success else 1)
