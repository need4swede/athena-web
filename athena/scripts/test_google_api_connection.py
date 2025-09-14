#!/usr/bin/env python3
"""
Script to test the Google API connection and credentials.
"""

import sys
import os
import json
import logging
from pathlib import Path

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

def test_google_api_connection():
    """
    Test the Google API connection and credentials.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Print environment information
        print(f"Python version: {sys.version}")
        print(f"Current working directory: {os.getcwd()}")
        print(f"PYTHONPATH: {os.environ.get('PYTHONPATH', 'Not set')}")
        print(f"GOOGLE_APPLICATION_CREDENTIALS: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', 'Not set')}")

        # Check if key.json exists
        key_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'api', 'google_api', 'key.json')
        print(f"Checking if key.json exists at: {key_path}")
        if os.path.exists(key_path):
            print(f"✅ key.json exists at {key_path}")
        else:
            print(f"❌ key.json does not exist at {key_path}")
            return {
                "success": False,
                "message": f"key.json not found at {key_path}",
                "data": {}
            }

        # Check if auth.ini exists
        auth_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'api', 'google_api', 'auth.ini')
        print(f"Checking if auth.ini exists at: {auth_path}")
        if os.path.exists(auth_path):
            print(f"✅ auth.ini exists at {auth_path}")
        else:
            print(f"❌ auth.ini does not exist at {auth_path}")
            return {
                "success": False,
                "message": f"auth.ini not found at {auth_path}",
                "data": {}
            }

        # Check if config.ini exists
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'api', 'google_api', 'config.ini')
        print(f"Checking if config.ini exists at: {config_path}")
        if os.path.exists(config_path):
            print(f"✅ config.ini exists at {config_path}")
        else:
            print(f"❌ config.ini does not exist at {config_path}")
            return {
                "success": False,
                "message": f"config.ini not found at {config_path}",
                "data": {}
            }

        # Try to import Google API libraries
        try:
            import google.auth
            print("✅ Successfully imported google.auth")
        except ImportError as e:
            print(f"❌ Failed to import google.auth: {str(e)}")
            return {
                "success": False,
                "message": f"Failed to import google.auth: {str(e)}",
                "data": {}
            }

        try:
            from google.oauth2 import service_account
            print("✅ Successfully imported google.oauth2.service_account")
        except ImportError as e:
            print(f"❌ Failed to import google.oauth2.service_account: {str(e)}")
            return {
                "success": False,
                "message": f"Failed to import google.oauth2.service_account: {str(e)}",
                "data": {}
            }

        try:
            from googleapiclient.discovery import build
            print("✅ Successfully imported googleapiclient.discovery")
        except ImportError as e:
            print(f"❌ Failed to import googleapiclient.discovery: {str(e)}")
            return {
                "success": False,
                "message": f"Failed to import googleapiclient.discovery: {str(e)}",
                "data": {}
            }

        # Try to authenticate with Google API
        try:
            # Load the service account key file
            credentials = service_account.Credentials.from_service_account_file(
                key_path,
                scopes=['https://www.googleapis.com/auth/admin.directory.device.chromeos']
            )
            print("✅ Successfully loaded service account credentials")

            # Create a delegated credentials object
            import configparser
            config = configparser.ConfigParser()
            config.read(config_path)
            admin_email = config.get('Settings', 'ADMIN', fallback=None)

            if admin_email:
                delegated_credentials = credentials.with_subject(admin_email)
                print(f"✅ Successfully created delegated credentials for {admin_email}")
            else:
                print("❌ Admin email not found in config.ini")
                return {
                    "success": False,
                    "message": "Admin email not found in config.ini",
                    "data": {}
                }

            # Try to build the service
            service = build('admin', 'directory_v1', credentials=delegated_credentials)
            print("✅ Successfully built the Admin SDK Directory service")

            # Try to list users
            results = service.users().list(customer='my_customer', maxResults=1).execute()
            users = results.get('users', [])

            if users:
                print(f"✅ Successfully retrieved {len(users)} users from Google Admin API")
                return {
                    "success": True,
                    "message": "Successfully connected to Google Admin API",
                    "data": {
                        "users_count": len(users)
                    }
                }
            else:
                print("❌ No users found in Google Admin API")
                return {
                    "success": True,
                    "message": "Successfully connected to Google Admin API, but no users found",
                    "data": {
                        "users_count": 0
                    }
                }
        except Exception as e:
            print(f"❌ Failed to authenticate with Google API: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "message": f"Failed to authenticate with Google API: {str(e)}",
                "data": {}
            }
    except Exception as e:
        print(f"❌ An error occurred: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"An error occurred: {str(e)}",
            "data": {}
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Test Google API connection
    result = test_google_api_connection()

    # Print the result as JSON
    print(json.dumps(result, indent=2))
