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
                "message": "Usage: python suspend_user.py <user_key> [reason]"
            }
            print(json.dumps(result))
            sys.exit(1)

        user_key = sys.argv[1]
        reason = sys.argv[2] if len(sys.argv) > 2 else ""

        logger.info(f"Suspending user: {user_key}")
        if reason:
            logger.info(f"Suspension reason: {reason}")

        # Initialize the Directory API
        directory = Directory()

        # Suspend the user
        result = directory.suspend_user(user_key, reason)

        if "error" in result:
            logger.error(f"Failed to suspend user {user_key}: {result['error']}")
            output = {
                "success": False,
                "error": result["error"],
                "message": f"Failed to suspend user {user_key}"
            }
        else:
            logger.info(f"Successfully suspended user: {user_key}")
            output = {
                "success": True,
                "message": result.get("message", f"User {user_key} suspended successfully"),
                "user": result.get("user"),
                "user_key": user_key,
                "reason": reason
            }

        print(json.dumps(output))

    except Exception as e:
        logger.error(f"Error suspending user: {str(e)}")
        result = {
            "success": False,
            "error": str(e),
            "message": "An unexpected error occurred while suspending the user"
        }
        print(json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    main()
