#!/usr/bin/env python3
"""
Move a Chrome device to a different organizational unit in Google Admin Console
"""
import sys
import json
from athena.api.google_api.devices import Devices

def move_device(device_id, target_org_unit):
    """
    Move a device to a new organizational unit

    Args:
        device_id: The device ID (from Google Admin Console)
        target_org_unit: The target organizational unit path (e.g., '/Students/Grade 9')

    Returns:
        dict: Result of the operation
    """
    try:
        # Initialize Google Devices API client
        devices_client = Devices()

        # Call the move_chrome_os_device method
        result = devices_client.move_chrome_os_device(device_id, target_org_unit)

        if result:
            return {
                'success': True,
                'message': f'Successfully moved device {device_id} to {target_org_unit}',
                'device_id': device_id,
                'org_unit': target_org_unit
            }
        else:
            return {
                'success': False,
                'error': f'Failed to move device {device_id}',
                'device_id': device_id
            }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'device_id': device_id
        }

def main():
    """Main function to handle command line arguments"""
    if len(sys.argv) != 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python move_device.py <device_id> <target_org_unit>'
        }))
        sys.exit(1)

    device_id = sys.argv[1]
    target_org_unit = sys.argv[2]

    result = move_device(device_id, target_org_unit)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
