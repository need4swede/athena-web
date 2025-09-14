#!/usr/bin/env python3

import sys
import json
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """
    Update device notes in Google Admin Console using the athena Devices class.

    Usage: python update_device_notes.py <asset_id> <notes_content>
    """
    try:
        if len(sys.argv) != 3:
            result = {
                "success": False,
                "error": "Usage: python update_device_notes.py <asset_id> <notes_content>"
            }
            print(json.dumps(result))
            sys.exit(1)

        asset_id = sys.argv[1]
        notes_content = sys.argv[2]

        logger.info(f"🔄 [Script] Starting notes update for asset: {asset_id}")
        logger.info(f"📝 [Script] Notes content: {notes_content}")

        # Import the Devices class from athena
        from athena.api.google_api.devices import Devices

        # Initialize the Devices class
        devices = Devices()

        # Update the device notes using the existing method
        result = devices.update_device_notes(
            identifier=asset_id,
            notes_content=notes_content,
            identifier_type='annotatedAssetId'
        )

        # Output the result as JSON
        print(json.dumps(result))

        if result.get('success'):
            logger.info(f"✅ [Script] Notes updated successfully for asset: {asset_id}")
            sys.exit(0)
        else:
            logger.error(f"❌ [Script] Notes update failed for asset: {asset_id} - {result.get('error')}")
            sys.exit(1)

    except ImportError as e:
        error_result = {
            "success": False,
            "error": f"Import error: {str(e)}. Please check Python environment and dependencies.",
            "identifier": sys.argv[1] if len(sys.argv) > 1 else "unknown"
        }
        logger.error(f"❌ [Script] Import error: {str(e)}")
        print(json.dumps(error_result))
        sys.exit(1)

    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "identifier": sys.argv[1] if len(sys.argv) > 1 else "unknown"
        }
        logger.error(f"❌ [Script] Exception occurred: {str(e)}")
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
