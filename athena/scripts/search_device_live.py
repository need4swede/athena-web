#!/usr/bin/env python3
"""
Script to search for Chromebook devices from Google Admin API using Athena.
Supports search by asset tag, serial number, or model.
"""

import sys
import os
import json
import logging
import re

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.devices import Devices

def search_device(query):
    """
    Search for Chromebook devices from Google Admin API.

    Args:
        query (str): Search query (asset tag, serial number, or model)

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        logging.info(f"🔍 Searching for device: {query}")

        # Initialize the Devices class
        devices = Devices.get_instance()

        results = []

        # Determine search type based on query pattern
        query_lower = query.lower().strip()

        # Try exact asset tag search first (most specific)
        if re.match(r'^[a-zA-Z0-9-]+$', query_lower):
            logging.info(f"🏷️ Trying asset tag search for: {query}")
            device_result = devices.find_device(
                query,
                'annotatedAssetId',
                'deviceId', 'serialNumber', 'annotatedAssetId', 'model',
                'status', 'orgUnitPath', 'annotatedUser', 'annotatedLocation',
                'notes', 'lastSync', 'osVersion', 'platformVersion'
            )
            if device_result:
                # Convert single device result to expected format
                formatted_device = {
                    'device_id': device_result['deviceId'],
                    'serial_number': device_result['serialNumber'],
                    'annotated_asset_id': device_result.get('annotatedAssetId', ''),
                    'model': device_result.get('model', ''),
                    'status': device_result.get('status', ''),
                    'org_unit_path': device_result.get('orgUnitPath', ''),
                    'annotated_user': device_result.get('annotatedUser', ''),
                    'annotated_location': device_result.get('annotatedLocation', ''),
                    'notes': device_result.get('notes', ''),
                    'last_sync': device_result.get('lastSync', ''),
                    'os_version': device_result.get('osVersion', ''),
                    'platform_version': device_result.get('platformVersion', '')
                }
                results.append(formatted_device)
                logging.info(f"✅ Found device by asset tag: {device_result.get('annotatedAssetId')}")

        # Try serial number search if asset tag didn't work
        if not results and re.match(r'^[a-zA-Z0-9]+$', query_lower):
            logging.info(f"🔢 Trying serial number search for: {query}")
            device_result = devices.find_device(
                query,
                'serialNumber',
                'deviceId', 'serialNumber', 'annotatedAssetId', 'model',
                'status', 'orgUnitPath', 'annotatedUser', 'annotatedLocation',
                'notes', 'lastSync', 'osVersion', 'platformVersion'
            )
            if device_result:
                # Convert single device result to expected format
                formatted_device = {
                    'device_id': device_result['deviceId'],
                    'serial_number': device_result['serialNumber'],
                    'annotated_asset_id': device_result.get('annotatedAssetId', ''),
                    'model': device_result.get('model', ''),
                    'status': device_result.get('status', ''),
                    'org_unit_path': device_result.get('orgUnitPath', ''),
                    'annotated_user': device_result.get('annotatedUser', ''),
                    'annotated_location': device_result.get('annotatedLocation', ''),
                    'notes': device_result.get('notes', ''),
                    'last_sync': device_result.get('lastSync', ''),
                    'os_version': device_result.get('osVersion', ''),
                    'platform_version': device_result.get('platformVersion', '')
                }
                results.append(formatted_device)
                logging.info(f"✅ Found device by serial number: {device_result.get('serialNumber')}")

        # If still no results and query looks like a model search, get all devices and filter
        if not results and len(query) >= 3:
            logging.info(f"📱 Trying model/broad search for: {query}")

            # Get all devices and filter by model or other fields
            all_devices_result = devices.list_all_devices(
                batch_size=100,
                recent_users_limit=1,
                formatted=False,
                include_null=False
            )

            if all_devices_result.get('devices'):
                for device in all_devices_result['devices']:
                    # Search in model, asset tag, serial number, location, or user
                    model = device.get('model', '').lower()
                    asset_tag = device.get('annotatedAssetId', '').lower()
                    serial = device.get('serialNumber', '').lower()
                    location = device.get('annotatedLocation', '').lower()
                    user = device.get('annotatedUser', '').lower()

                    if (query_lower in model or
                        query_lower in asset_tag or
                        query_lower in serial or
                        query_lower in location or
                        query_lower in user):

                        formatted_device = {
                            'device_id': device['deviceId'],
                            'serial_number': device['serialNumber'],
                            'annotated_asset_id': device.get('annotatedAssetId', ''),
                            'model': device.get('model', ''),
                            'status': device.get('status', ''),
                            'org_unit_path': device.get('orgUnitPath', ''),
                            'annotated_user': device.get('annotatedUser', ''),
                            'annotated_location': device.get('annotatedLocation', ''),
                            'notes': device.get('notes', ''),
                            'last_sync': device.get('lastSync', ''),
                            'os_version': device.get('osVersion', ''),
                            'platform_version': device.get('platformVersion', '')
                        }
                        results.append(formatted_device)

                        # Limit results to avoid overwhelming response
                        if len(results) >= 10:
                            break

                if results:
                    logging.info(f"✅ Found {len(results)} devices by broad search")

        # Return the results
        if results:
            return {
                "success": True,
                "message": f"Successfully found {len(results)} devices matching '{query}'",
                "data": results
            }
        else:
            return {
                "success": True,
                "message": f"No devices found matching '{query}'",
                "data": []
            }

    except Exception as e:
        logging.exception("Error searching devices from Google Admin API")
        return {
            "success": False,
            "message": f"Error searching devices: {str(e)}",
            "data": []
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Get search query from command line argument
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "message": "Usage: python search_device_live.py <search_query>",
            "data": []
        }))
        sys.exit(1)

    search_query = sys.argv[1]

    # Search for devices
    result = search_device(search_query)

    # Print the result as JSON
    print(json.dumps(result))
