#!/usr/bin/env python3
"""
Script to fetch Chromebook devices from Google Admin API using Athena.
"""

import sys
import os
import json
import logging

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.devices import Devices

def get_chromebooks():
    """
    Fetch all Chromebook devices from Google Admin API.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Devices class
        devices = Devices.get_instance()

        # Fetch all devices (no specific OU)
        results = devices.list_devices_by_ou()

        # Return the results
        return {
            "success": True,
            "message": f"Successfully retrieved {len(results)} Chromebooks from Google Admin API",
            "data": results
        }
    except Exception as e:
        logging.exception("Error fetching Chromebooks from Google Admin API")
        return {
            "success": False,
            "message": f"Error fetching Chromebooks: {str(e)}",
            "data": []
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Get Chromebooks
    result = get_chromebooks()

    # Print the result as JSON
    print(json.dumps(result))
