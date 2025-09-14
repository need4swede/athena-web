#!/usr/bin/env python3
"""
Script to sync organizational units from Google Admin API to the database.
"""

import sys
import os
import json
import logging
import psycopg2
from psycopg2.extras import execute_values

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.devices import Devices

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

def sync_org_units():
    """
    Sync organizational units from Google Admin API to the database.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Devices class
        devices = Devices.get_instance()

        # Fetch all organizational units
        results = devices.list_organizational_units()
        org_units = results.get('organizationalUnits', [])

        if not org_units:
            return {
                "success": False,
                "message": "No organizational units found in Google Admin API",
                "data": {
                    "org_units_count": 0,
                    "inserted_count": 0,
                    "updated_count": 0
                }
            }

        # Connect to the database
        conn = get_db_connection()
        cursor = conn.cursor()

        # Create the org_units table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS org_units (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                org_unit_path VARCHAR(255) NOT NULL UNIQUE,
                parent_org_unit_path VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
                    WHERE tgname = 'update_org_units_updated_at'
                ) THEN
                    CREATE TRIGGER update_org_units_updated_at
                    BEFORE UPDATE ON org_units
                    FOR EACH ROW
                    EXECUTE FUNCTION update_updated_at_column();
                END IF;
            END;
            $$;
        """)

        # Prepare data for insertion/update
        org_units_data = []
        for ou in org_units:
            org_units_data.append((
                ou['name'],
                ou['orgUnitPath'],
                ou['parentOrgUnitPath']
            ))

        # Insert or update org_units
        inserted_count = 0
        updated_count = 0

        for name, org_unit_path, parent_org_unit_path in org_units_data:
            # Check if the org_unit already exists
            cursor.execute(
                "SELECT id FROM org_units WHERE org_unit_path = %s",
                (org_unit_path,)
            )
            result = cursor.fetchone()

            if result:
                # Update existing org_unit
                cursor.execute(
                    """
                    UPDATE org_units
                    SET name = %s, parent_org_unit_path = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE org_unit_path = %s
                    """,
                    (name, parent_org_unit_path, org_unit_path)
                )
                updated_count += 1
            else:
                # Insert new org_unit
                cursor.execute(
                    """
                    INSERT INTO org_units (name, org_unit_path, parent_org_unit_path)
                    VALUES (%s, %s, %s)
                    """,
                    (name, org_unit_path, parent_org_unit_path)
                )
                inserted_count += 1

        # Commit the transaction
        conn.commit()

        # Close the cursor and connection
        cursor.close()
        conn.close()

        return {
            "success": True,
            "message": f"Successfully synced {len(org_units)} organizational units from Google Admin API",
            "data": {
                "org_units_count": len(org_units),
                "inserted_count": inserted_count,
                "updated_count": updated_count
            }
        }
    except Exception as e:
        logging.exception("Error syncing organizational units from Google Admin API")
        return {
            "success": False,
            "message": f"Error syncing organizational units: {str(e)}",
            "data": {
                "org_units_count": 0,
                "inserted_count": 0,
                "updated_count": 0
            }
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Sync organizational units
    result = sync_org_units()

    # Print the result as JSON
    print(json.dumps(result))
