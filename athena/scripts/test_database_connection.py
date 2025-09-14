#!/usr/bin/env python3
"""
Script to test database connectivity for debugging sync issues.
"""

import sys
import os
import json
import logging
import psycopg2
from psycopg2.extras import RealDictCursor

def test_database_connection():
    """
    Test database connectivity and basic operations.

    Returns:
        dict: A dictionary containing the test results.
    """
    try:
        # Get database connection parameters from environment variables
        db_host = os.environ.get('DB_HOST', 'postgres')
        db_port = os.environ.get('DB_PORT', '5432')
        db_name = os.environ.get('DB_NAME', 'chromebook_library')
        db_user = os.environ.get('DB_USER', 'postgres')
        db_password = os.environ.get('DB_PASSWORD', 'password')

        print(f"Testing database connection with:")
        print(f"  Host: {db_host}")
        print(f"  Port: {db_port}")
        print(f"  Database: {db_name}")
        print(f"  User: {db_user}")
        print(f"  Password: {'*' * len(db_password) if db_password else 'None'}")

        # Test connection
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            dbname=db_name,
            user=db_user,
            password=db_password
        )

        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Test basic query
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        print(f"PostgreSQL version: {version['version']}")

        # Check if required tables exist
        tables_to_check = ['chromebooks', 'google_users', 'org_units', 'users']
        existing_tables = {}

        for table in tables_to_check:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = %s
                );
            """, (table,))
            exists = cursor.fetchone()['exists']
            existing_tables[table] = exists
            print(f"Table '{table}' exists: {exists}")

        # Test insert capability (if chromebooks table exists)
        if existing_tables.get('chromebooks'):
            try:
                cursor.execute("SELECT COUNT(*) as count FROM chromebooks;")
                count = cursor.fetchone()['count']
                print(f"Current chromebooks count: {count}")
            except Exception as e:
                print(f"Error querying chromebooks table: {e}")

        # Test google_users table if it exists
        if existing_tables.get('google_users'):
            try:
                cursor.execute("SELECT COUNT(*) as count FROM google_users;")
                count = cursor.fetchone()['count']
                print(f"Current google_users count: {count}")
            except Exception as e:
                print(f"Error querying google_users table: {e}")

        # Test org_units table if it exists
        if existing_tables.get('org_units'):
            try:
                cursor.execute("SELECT COUNT(*) as count FROM org_units;")
                count = cursor.fetchone()['count']
                print(f"Current org_units count: {count}")
            except Exception as e:
                print(f"Error querying org_units table: {e}")

        cursor.close()
        conn.close()

        return {
            "success": True,
            "message": "Database connection test successful",
            "data": {
                "connection_params": {
                    "host": db_host,
                    "port": db_port,
                    "database": db_name,
                    "user": db_user
                },
                "postgresql_version": version['version'],
                "existing_tables": existing_tables
            }
        }

    except Exception as e:
        logging.exception("Error testing database connection")
        return {
            "success": False,
            "message": f"Database connection test failed: {str(e)}",
            "data": {
                "connection_params": {
                    "host": os.environ.get('DB_HOST', 'postgres'),
                    "port": os.environ.get('DB_PORT', '5432'),
                    "database": os.environ.get('DB_NAME', 'chromebook_library'),
                    "user": os.environ.get('DB_USER', 'postgres')
                },
                "error": str(e)
            }
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Test database connection
    result = test_database_connection()

    # Print the result as JSON
    print(json.dumps(result))
