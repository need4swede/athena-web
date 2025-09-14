#!/usr/bin/env python3
"""
Script to fetch ALL Chromebook devices from Google Admin API using pagination.
This script uses the new list_all_devices_by_ou method for better performance and complete data retrieval.
"""

import sys
import os
import json
import logging

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.devices import Devices

def get_all_chromebooks_by_ou(organizational_unit_path=None):
    """
    Fetch ALL Chromebook devices from Google Admin API using pagination.
    Groups devices by organizational unit for efficient filtering.

    Args:
        organizational_unit_path (str, optional): Specific OU path to filter by.
                                                If None, gets all devices from root.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Devices class
        devices = Devices.get_instance()

        # Fetch all devices using the new pagination method
        results = devices.list_all_devices_by_ou(
            organizational_unit_path=organizational_unit_path,
            batch_size=100,  # Optimal batch size for performance
            recent_users_limit=1,
            formatted=False,
            include_null=False
        )

        # Check if there was an error in the results
        if 'error' in results:
            return {
                "success": False,
                "message": f"Error from Google API: {results['error']}",
                "data": [],
                "devices_by_ou": {},
                "total_devices": 0,
                "api_calls": 0
            }

        # Extract the data
        all_devices = results.get('devices', [])
        devices_by_ou = results.get('devices_by_ou', {})
        total_devices = results.get('total_devices', len(all_devices))
        api_calls = results.get('api_calls', 1)

        # Return the results with enhanced structure
        return {
            "success": True,
            "message": f"Successfully retrieved {total_devices} Chromebooks from Google Admin API in {api_calls} API calls",
            "data": all_devices,
            "devices_by_ou": devices_by_ou,
            "total_devices": total_devices,
            "api_calls": api_calls,
            "organizational_units": list(devices_by_ou.keys()) if devices_by_ou else []
        }
    except Exception as e:
        logging.exception("Error fetching Chromebooks from Google Admin API")
        return {
            "success": False,
            "message": f"Error fetching Chromebooks: {str(e)}",
            "data": [],
            "devices_by_ou": {},
            "total_devices": 0,
            "api_calls": 0
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Get organizational unit path from command line arguments if provided
    org_unit_path = None
    if len(sys.argv) > 1:
        org_unit_path = sys.argv[1]
        logging.info(f"Filtering by organizational unit: {org_unit_path}")

    # Get all Chromebooks
    result = get_all_chromebooks_by_ou(org_unit_path)

    # Print the result as JSON
    print(json.dumps(result))
