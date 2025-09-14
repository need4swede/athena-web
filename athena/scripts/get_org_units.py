#!/usr/bin/env python3
"""
Script to fetch organizational units from Google Admin API using Athena.
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
from athena.api.google_api.devices import Devices

def get_org_units():
    """
    Fetch all organizational units from Google Admin API.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Devices class
        devices = Devices.get_instance()

        # Fetch all organizational units
        results = devices.list_organizational_units()

        # Return the results
        return {
            "success": True,
            "message": f"Successfully retrieved {len(results.get('organizationalUnits', []))} organizational units from Google Admin API",
            "data": results.get('organizationalUnits', [])
        }
    except Exception as e:
        # Log to stderr for debugging but don't let it interfere with JSON output
        print(f"ERROR: {str(e)}", file=sys.stderr)
        return {
            "success": False,
            "message": f"Error fetching organizational units: {str(e)}",
            "data": []
        }

if __name__ == "__main__":
    # Get organizational units
    result = get_org_units()

    # Print the result as JSON to stdout only
    print(json.dumps(result, indent=None, separators=(',', ':')))
