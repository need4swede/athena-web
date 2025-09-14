#!/usr/bin/env python3
"""
Script to fetch users from Google Admin API using Athena.
"""

import sys
import os
import json
import logging

# Suppress all logging to stderr to avoid interfering with JSON output
logging.basicConfig(level=logging.CRITICAL)
logging.getLogger().setLevel(logging.CRITICAL)

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.directory import Directory

def get_users(max_results=100, use_pagination=False):
    """
    Fetch users from Google Admin API with organizational units.

    Args:
        max_results (int): Maximum number of users to retrieve (ignored if use_pagination=True).
        use_pagination (bool): Whether to fetch all users using pagination.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Directory class
        directory = Directory()

        # Fetch users with organizational units
        if use_pagination:
            results = directory.list_all_users_with_ou(batch_size=500)
        else:
            # For limited results, still use the regular method but with projection=full to get orgUnitPath
            results = directory.list_users(max_results=max_results)

        # Return the results
        return {
            "success": True,
            "message": f"Successfully retrieved {len(results.get('users', []))} users from Google Admin API",
            "data": results.get('users', [])
        }
    except Exception as e:
        # Log to stderr for debugging but don't let it interfere with JSON output
        print(f"ERROR: {str(e)}", file=sys.stderr)
        return {
            "success": False,
            "message": f"Error fetching users: {str(e)}",
            "data": []
        }

if __name__ == "__main__":
    # Get users (default max_results=100)
    result = get_users()

    # Print the result as JSON to stdout only
    print(json.dumps(result, indent=None, separators=(',', ':')))
