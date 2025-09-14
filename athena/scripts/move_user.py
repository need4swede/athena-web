#!/usr/bin/env python3

import sys
import json
import logging
from athena.api.google_api.directory import Directory

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    try:
        # Check if we have the required arguments
        if len(sys.argv) < 3:
            result = {
                "success": False,
                "error": "Missing required arguments: user_key and org_unit_path",
                "message": "Usage: python move_user.py <user_key> <org_unit_path>"
            }
            print(json.dumps(result))
            sys.exit(1)

        user_key = sys.argv[1]
        org_unit_path = sys.argv[2]

        logger.info(f"Moving user: {user_key} to organizational unit: {org_unit_path}")

        # Initialize the Directory API
        directory = Directory()

        # Move the user to the specified organizational unit
        result = directory.move_users_to_ou([user_key], org_unit_path)

        if result.get("failure") and len(result["failure"]) > 0:
            error_info = result["failure"][0]
            logger.error(f"Failed to move user {user_key}: {error_info.get('reason', 'Unknown error')}")
            output = {
                "success": False,
                "error": error_info.get('reason', 'Unknown error'),
                "message": f"Failed to move user {user_key} to {org_unit_path}"
            }
        elif result.get("success") and len(result["success"]) > 0:
            success_info = result["success"][0]
            logger.info(f"Successfully moved user: {user_key} to {org_unit_path}")
            output = {
                "success": True,
                "message": f"User {user_key} moved successfully to {org_unit_path}",
                "user_key": user_key,
                "new_org_unit": success_info.get("newOrgUnit", org_unit_path)
            }
        else:
            logger.error(f"Unexpected result format when moving user {user_key}")
            output = {
                "success": False,
                "error": "Unexpected result format",
                "message": f"Failed to move user {user_key} to {org_unit_path}"
            }

        print(json.dumps(output))

    except Exception as e:
        logger.error(f"Error moving user: {str(e)}")
        result = {
            "success": False,
            "error": str(e),
            "message": "An unexpected error occurred while moving the user"
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    main()
