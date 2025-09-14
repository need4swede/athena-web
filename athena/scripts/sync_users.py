#!/usr/bin/env python3
"""
Script to sync users from Google Admin API to the database.
"""

import sys
import os
import json
import logging
import psycopg2
import re
from psycopg2.extras import execute_values

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.directory import Directory

def extract_student_id_from_email(email):
    """
    Extract student ID from email address in format: firstname.studentid@domain

    Args:
        email (str): Email address like 'adam.156798@njesd.net'

    Returns:
        str: Student ID (e.g., '156798') or None if not found
    """
    if not email:
        return None

    # Match pattern: anything.digits@domain
    match = re.match(r'^[^.]+\.(\d+)@', email)
    return match.group(1) if match else None

def get_db_connection():
    """
    Get a connection to the PostgreSQL database.

    Returns:
        psycopg2.connection: A connection to the PostgreSQL database.
    """
    try:
        conn = psycopg2.connect(
            host=os.environ.get('DB_HOST', 'postgres'),
            port=os.environ.get('DB_PORT', '5432'),
            dbname=os.environ.get('DB_NAME', 'chromebook_library'),
            user=os.environ.get('DB_USER', 'postgres'),
            password=os.environ.get('DB_PASSWORD', 'password')
        )
        return conn
    except Exception as e:
        logging.error(f"Error connecting to database: {str(e)}")
        raise

def sync_users(use_pagination=True, batch_size=500):
    """
    Sync users from Google Admin API to the database.

    Args:
        use_pagination (bool): Whether to use pagination to fetch ALL users. Defaults to True.
        batch_size (int): Batch size for pagination. Defaults to 500.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Directory class
        directory = Directory()

        # Fetch users from Google Admin API with organizational units
        if use_pagination:
            logging.info("🔄 Fetching ALL users with organizational units using pagination...")
            results = directory.list_all_users_with_ou(batch_size=batch_size)
        else:
            logging.info(f"🔄 Fetching up to {batch_size} users with organizational units (no pagination)...")
            results = directory.list_users(max_results=batch_size)

        users = results.get('users', [])
        api_calls = results.get('api_calls', 1)
        total_users = results.get('total_users', len(users))

        if not users:
            return {
                "success": False,
                "message": "No users found in Google Admin API",
                "data": {
                    "users_count": 0,
                    "inserted_count": 0,
                    "updated_count": 0,
                    "api_calls": api_calls
                }
            }

        logging.info(f"📊 Retrieved {total_users} users in {api_calls} API calls")

        # Connect to the database
        conn = get_db_connection()
        cursor = conn.cursor()

        # Create the users table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS google_users (
                id SERIAL PRIMARY KEY,
                google_id VARCHAR(255) NOT NULL UNIQUE,
                primary_email VARCHAR(255) NOT NULL UNIQUE,
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                full_name VARCHAR(255),
                org_unit_path VARCHAR(255),
                is_admin BOOLEAN DEFAULT FALSE,
                is_suspended BOOLEAN DEFAULT FALSE,
                student_id VARCHAR(50),
                creation_time TIMESTAMP WITH TIME ZONE,
                last_login_time TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Add student_id column if it doesn't exist (for existing installations)
        cursor.execute("""
            ALTER TABLE google_users ADD COLUMN IF NOT EXISTS student_id VARCHAR(50)
        """)

        # Create index for student_id if it doesn't exist
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_google_users_student_id ON google_users(student_id)
        """)

        # Ensure students table exists for auto-creation
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                student_id VARCHAR(50) UNIQUE NOT NULL,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                grade_level INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create a trigger to update the updated_at column
        cursor.execute("""
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)

        # Create the trigger if it doesn't exist
        cursor.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_trigger
                    WHERE tgname = 'update_google_users_updated_at'
                ) THEN
                    CREATE TRIGGER update_google_users_updated_at
                    BEFORE UPDATE ON google_users
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
                END IF;
            END;
            $$;
        """)

        # Insert or update users
        inserted_count = 0
        updated_count = 0
        students_created = 0
        processed_count = 0

        logging.info("💾 Processing users for database insertion/update...")

        for user in users:
            processed_count += 1

            # Extract user data
            google_id = user.get('id')
            primary_email = user.get('primaryEmail')

            # Skip if missing required fields
            if not google_id or not primary_email:
                continue

            first_name = user.get('name', {}).get('givenName')
            last_name = user.get('name', {}).get('familyName')
            full_name = user.get('name', {}).get('fullName')
            org_unit_path = user.get('orgUnitPath')
            is_admin = user.get('isAdmin', False)
            is_suspended = user.get('suspended', False)
            creation_time = user.get('creationTime')
            last_login_time = user.get('lastLoginTime')

            # Extract student ID from email
            student_id = extract_student_id_from_email(primary_email)

            # Auto-create student record if student ID is found
            if student_id and first_name and last_name:
                try:
                    # Check if student record already exists
                    cursor.execute(
                        "SELECT id FROM students WHERE student_id = %s",
                        (student_id,)
                    )
                    if not cursor.fetchone():
                        # Create new student record
                        cursor.execute(
                            """
                            INSERT INTO students (student_id, first_name, last_name, email)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (student_id) DO UPDATE SET
                                first_name = EXCLUDED.first_name,
                                last_name = EXCLUDED.last_name,
                                email = EXCLUDED.email,
                                updated_at = CURRENT_TIMESTAMP
                            """,
                            (student_id, first_name, last_name, primary_email)
                        )
                        students_created += 1
                        logging.info(f"📚 Created student record for {first_name} {last_name} (ID: {student_id})")
                except Exception as e:
                    logging.warning(f"⚠️ Failed to create student record for {primary_email}: {str(e)}")

            # Check if the user already exists
            cursor.execute(
                "SELECT id, is_suspended FROM google_users WHERE google_id = %s",
                (google_id,)
            )
            result = cursor.fetchone()

            if result:
                current_user_id, current_suspended = result

                # Always use Google's suspension status as the source of truth
                # Log if there's a difference between local and Google status
                if current_suspended != is_suspended:
                    logging.info(f"🔄 Updating suspension status for {primary_email}: {current_suspended} -> {is_suspended} (Google is source of truth)")

                # Update existing user with Google's current status including student_id
                cursor.execute(
                    """
                    UPDATE google_users
                    SET primary_email = %s, first_name = %s, last_name = %s, full_name = %s,
                        org_unit_path = %s, is_admin = %s, is_suspended = %s, student_id = %s,
                        creation_time = %s, last_login_time = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE google_id = %s
                    """,
                    (primary_email, first_name, last_name, full_name, org_unit_path,
                     is_admin, is_suspended, student_id, creation_time, last_login_time, google_id)
                )
                updated_count += 1
            else:
                # Insert new user including student_id
                cursor.execute(
                    """
                    INSERT INTO google_users (google_id, primary_email, first_name, last_name, full_name,
                                            org_unit_path, is_admin, is_suspended, student_id, creation_time, last_login_time)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (google_id, primary_email, first_name, last_name, full_name,
                     org_unit_path, is_admin, is_suspended, student_id, creation_time, last_login_time)
                )
                inserted_count += 1

        # Commit the transaction
        conn.commit()

        # Close the cursor and connection
        cursor.close()
        conn.close()

        logging.info(f"✅ Sync completed! Inserted: {inserted_count}, Updated: {updated_count}, Students Created: {students_created}")

        return {
            "success": True,
            "message": f"Successfully synced {len(users)} users from Google Admin API. Created {students_created} student records.",
            "data": {
                "users_count": len(users),
                "inserted_count": inserted_count,
                "updated_count": updated_count,
                "students_created": students_created,
                "api_calls": api_calls,
                "total_users": total_users
            }
        }
    except Exception as e:
        logging.exception("Error syncing users from Google Admin API")
        return {
            "success": False,
            "message": f"Error syncing users: {str(e)}",
            "data": {
                "users_count": 0,
                "inserted_count": 0,
                "updated_count": 0,
                "api_calls": 0
            }
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    # Parse command line arguments
    use_pagination = True
    batch_size = 500

    if len(sys.argv) > 1:
        if sys.argv[1].lower() == 'no-pagination':
            use_pagination = False
            logging.info("🚫 Pagination disabled - will fetch limited users only")
        else:
            try:
                batch_size = int(sys.argv[1])
                logging.info(f"📦 Using batch size: {batch_size}")
            except ValueError:
                logging.warning(f"Invalid batch_size value: {sys.argv[1]}. Using default: 500")

    # Sync users
    result = sync_users(use_pagination=use_pagination, batch_size=batch_size)

    # Print the result as JSON
    print(json.dumps(result))
