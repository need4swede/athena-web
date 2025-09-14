#!/usr/bin/env python3

# Standard Imports
import json
import logging
import sys

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Google API Device imports
from athena.api.google_api.devices import Devices

def reset_devices(device_identifiers):
    """
    Reset multiple devices using the WIPE_USERS command.

    Args:
        device_identifiers (list): List of device asset tags or serial numbers

    Returns:
        dict: Result of the reset operation
    """
    try:
        # Initialize the Devices API
        devices_api = Devices.get_instance()

        # Call the reset_device method
        result = devices_api.reset_device(device_identifiers)

        # Format the response
        response = {
            "success": True,
            "message": f"Reset operation completed for {len(device_identifiers)} devices",
            "results": result
        }

        return response
    except Exception as e:
        logger.error(f"Error resetting devices: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to reset devices: {str(e)}"
        }

def main():
    """Main entry point for the script."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "No device identifiers provided"
        }))
        sys.exit(1)

    # Get device identifiers from command line arguments
    device_identifiers = sys.argv[1:]

    # Reset the devices
    result = reset_devices(device_identifiers)

    # Output as JSON
    print(json.dumps(result, indent=2))

    # Exit with appropriate code
    sys.exit(0 if result.get("success") else 1)

if __name__ == "__main__":
    main()
