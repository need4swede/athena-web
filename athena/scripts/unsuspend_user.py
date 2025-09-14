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
        if len(sys.argv) < 2:
            result = {
                "success": False,
                "error": "Missing required argument: user_key",
                "message": "Usage: python unsuspend_user.py <user_key>"
            }
            print(json.dumps(result))
            sys.exit(1)

        user_key = sys.argv[1]

        logger.info(f"Unsuspending user: {user_key}")

        # Initialize the Directory API
        directory = Directory()

        # Unsuspend the user
        result = directory.unsuspend_user(user_key)

        if "error" in result:
            logger.error(f"Failed to unsuspend user {user_key}: {result['error']}")
            output = {
                "success": False,
                "error": result["error"],
                "message": f"Failed to unsuspend user {user_key}"
            }
        else:
            logger.info(f"Successfully unsuspended user: {user_key}")
            output = {
                "success": True,
                "message": result.get("message", f"User {user_key} unsuspended successfully"),
                "user": result.get("user"),
                "user_key": user_key
            }

        print(json.dumps(output))

    except Exception as e:
        logger.error(f"Error unsuspending user: {str(e)}")
        result = {
            "success": False,
            "error": str(e),
            "message": "An unexpected error occurred while unsuspending the user"
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    main()
