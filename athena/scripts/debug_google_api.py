#!/usr/bin/env python3
"""
Debug script to test Google API connection and credentials.
"""
import os
import sys
import json
import traceback
from pathlib import Path

# Add the parent directory to the Python path
current_dir = Path(__file__).resolve().parent
parent_dir = current_dir.parent
sys.path.append(str(parent_dir))

def debug_environment():
    """Debug the Python environment and paths."""
    debug_info = {
        "environment": {
            "python_version": sys.version,
            "python_path": sys.executable,
            "sys_path": sys.path,
            "current_dir": str(current_dir),
            "parent_dir": str(parent_dir),
            "cwd": os.getcwd(),
            "env_vars": {
                "PYTHONPATH": os.environ.get("PYTHONPATH", "Not set"),
                "VIRTUAL_ENV": os.environ.get("VIRTUAL_ENV", "Not set"),
                "PATH": os.environ.get("PATH", "Not set")
            }
        },
        "file_system": {
            "api_dir_exists": os.path.exists(os.path.join(parent_dir, "api")),
            "google_api_dir_exists": os.path.exists(os.path.join(parent_dir, "api", "google_api")),
            "key_json_exists": os.path.exists(os.path.join(parent_dir, "api", "google_api", "key.json")),
            "auth_ini_exists": os.path.exists(os.path.join(parent_dir, "api", "google_api", "auth.ini")),
            "config_ini_exists": os.path.exists(os.path.join(parent_dir, "api", "google_api", "config.ini"))
        }
    }

    # List files in the api/google_api directory if it exists
    google_api_dir = os.path.join(parent_dir, "api", "google_api")
    if os.path.exists(google_api_dir):
        debug_info["file_system"]["google_api_dir_contents"] = os.listdir(google_api_dir)

    return debug_info

def test_google_auth():
    """Test Google API authentication."""
    try:
        # Try to import Google API libraries
        import_results = {
            "imports": {}
        }

        try:
            import google.auth
            import_results["imports"]["google.auth"] = "OK"
        except ImportError as e:
            import_results["imports"]["google.auth"] = f"Error: {str(e)}"

        try:
            from google.oauth2 import service_account
            import_results["imports"]["google.oauth2.service_account"] = "OK"
        except ImportError as e:
            import_results["imports"]["google.oauth2.service_account"] = f"Error: {str(e)}"

        try:
            from googleapiclient.discovery import build
            import_results["imports"]["googleapiclient.discovery"] = "OK"
        except ImportError as e:
            import_results["imports"]["googleapiclient.discovery"] = f"Error: {str(e)}"

        # Try to authenticate with Google API
        if all(result == "OK" for result in import_results["imports"].values()):
            try:
                # Path to the service account key file
                key_path = os.path.join(parent_dir, "api", "google_api", "key.json")

                # Check if key file exists
                if not os.path.exists(key_path):
                    import_results["auth"] = {
                        "status": "Error",
                        "message": f"Service account key file not found at {key_path}"
                    }
                    return import_results

                # Load the service account key file
                credentials = service_account.Credentials.from_service_account_file(
                    key_path,
                    scopes=['https://www.googleapis.com/auth/admin.directory.device.chromeos']
                )

                # Create a delegated credentials object
                try:
                    import configparser
                    config = configparser.ConfigParser()
                    config_path = os.path.join(parent_dir, "api", "google_api", "config.ini")
                    config.read(config_path)
                    admin_email = config.get('Settings', 'ADMIN', fallback=None)

                    if admin_email:
                        delegated_credentials = credentials.with_subject(admin_email)
                        import_results["auth"] = {
                            "status": "OK",
                            "admin_email": admin_email,
                            "message": "Successfully created delegated credentials"
                        }
                    else:
                        import_results["auth"] = {
                            "status": "Error",
                            "message": "Admin email not found in config.ini"
                        }
                except Exception as e:
                    import_results["auth"] = {
                        "status": "Error",
                        "message": f"Error reading config.ini: {str(e)}"
                    }
                    return import_results

                # Try to build the service
                try:
                    service = build('admin', 'directory_v1', credentials=delegated_credentials)
                    import_results["service"] = {
                        "status": "OK",
                        "message": "Successfully built the Admin SDK Directory service"
                    }
                except Exception as e:
                    import_results["service"] = {
                        "status": "Error",
                        "message": f"Error building service: {str(e)}"
                    }
            except Exception as e:
                import_results["auth"] = {
                    "status": "Error",
                    "message": f"Authentication error: {str(e)}",
                    "traceback": traceback.format_exc()
                }

        return import_results
    except Exception as e:
        return {
            "status": "Error",
            "message": f"Unexpected error: {str(e)}",
            "traceback": traceback.format_exc()
        }

def main():
    """Main function to run the debug tests."""
    try:
        # Collect all debug information
        debug_info = {
            "environment": debug_environment(),
            "google_api": test_google_auth()
        }

        # Print the debug information as JSON
        print(json.dumps(debug_info, indent=2))
    except Exception as e:
        error_info = {
            "status": "Error",
            "message": f"Debug script failed: {str(e)}",
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_info, indent=2))

if __name__ == "__main__":
    main()
