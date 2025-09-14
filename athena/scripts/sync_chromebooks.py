#!/usr/bin/env python3
"""
Script to sync Chromebook devices from Google Admin API to the database using Athena.
"""

import sys
import os
import json
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
import hashlib
import time

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.devices import Devices

def get_db_connection():
    """
    Get a connection to the PostgreSQL database.

    Returns:
        connection: A PostgreSQL database connection.
    """
    # Get database connection parameters from environment variables
    db_host = os.environ.get('DB_HOST', 'localhost')
    db_port = os.environ.get('DB_PORT', '5432')
    db_name = os.environ.get('DB_NAME', 'chromebook_library')
    db_user = os.environ.get('DB_USER', 'postgres')
    db_password = os.environ.get('DB_PASSWORD', 'password')

    # Connect to the database
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        dbname=db_name,
        user=db_user,
        password=db_password
    )

    return conn

def generate_unique_asset_tag(device, cursor):
    """
    Generate a unique asset tag for a device.

    Args:
        device: The device data from Google API
        cursor: Database cursor to check for existing tags

    Returns:
        str: A unique asset tag
    """
    # First try the annotated asset ID from Google
    if device.get('annotatedAssetId'):
        asset_tag = device['annotatedAssetId']
        cursor.execute("SELECT id FROM chromebooks WHERE asset_tag = %s", (asset_tag,))
        if not cursor.fetchone():
            return asset_tag

    # If that doesn't work, try serial number based tag
    serial_number = device.get('serialNumber', '')
    if serial_number:
        asset_tag = serial_number
        cursor.execute("SELECT id FROM chromebooks WHERE asset_tag = %s", (asset_tag,))
        if not cursor.fetchone():
            return asset_tag

    # If still not unique, use device ID
    device_id = device.get('deviceId', '')
    if device_id:
        asset_tag = device_id[-8:]
        cursor.execute("SELECT id FROM chromebooks WHERE asset_tag = %s", (asset_tag,))
        if not cursor.fetchone():
            return asset_tag

    # Last resort: use a hash of the serial number + device ID
    unique_string = f"{serial_number}-{device_id}"
    hash_suffix = hashlib.md5(unique_string.encode()).hexdigest()[:8]
    asset_tag = f"CB-{hash_suffix}"

    # Check if this hash-based tag is unique, if not add a counter
    counter = 1
    original_tag = asset_tag
    while True:
        cursor.execute("SELECT id FROM chromebooks WHERE asset_tag = %s", (asset_tag,))
        if not cursor.fetchone():
            return asset_tag
        asset_tag = f"{original_tag}-{counter}"
        counter += 1
        if counter > 1000:  # Safety break
            break

    return asset_tag

def sync_chromebooks():
    """
    Sync Chromebook devices from Google Admin API to the database.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    # Performance tracking
    start_time = time.time()
    perf_stats = {
        'start_time': datetime.now().isoformat(),
        'google_api_fetch_time': 0,
        'db_connection_time': 0,
        'processing_time': 0,
        'avg_device_processing_time': 0,
        'devices_per_second': 0
    }

    try:
        logging.info("Starting Chromebook sync process...")

        # Track Google API fetch time
        api_start = time.time()
        logging.info("Fetching devices from Google Admin API...")

        # Initialize the Devices class
        devices = Devices.get_instance()

        # Fetch all devices using the new list_all_devices method
        # Increase recent_users_limit to get all recent users
        results = devices.list_all_devices(
            batch_size=500,
            recent_users_limit=100,  # Get up to 100 recent users per device
            formatted=False,
            include_null=False
        )

        api_end = time.time()
        perf_stats['google_api_fetch_time'] = round(api_end - api_start, 2)
        logging.info(f"Google API fetch completed in {perf_stats['google_api_fetch_time']} seconds")

        # Check if there was an error in the results
        if 'error' in results:
            return {
                "success": False,
                "message": f"Error from Google API: {results['error']}",
                "data": {},
                "performance": perf_stats
            }

        # Extract the devices from the results
        google_devices = results.get('devices', [])
        logging.info(f"Retrieved {len(google_devices)} devices from Google Admin API")

        # Track database connection time
        db_start = time.time()
        logging.info("Connecting to database...")

        # Connect to the database
        conn = get_db_connection()

        # Set autocommit to handle individual transactions
        conn.autocommit = True
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        db_end = time.time()
        perf_stats['db_connection_time'] = round(db_end - db_start, 2)
        logging.info(f"Database connection established in {perf_stats['db_connection_time']} seconds")

        # Statistics
        stats = {
            "total": len(google_devices),
            "created": 0,
            "updated": 0,
            "unchanged": 0,
            "errors": 0,
            "protected": 0
        }

        # Track processing time
        processing_start = time.time()
        logging.info(f"Processing {len(google_devices)} devices...")

        # Process each device with individual transaction handling
        device_count = 0
        for device in google_devices:
            device_start = time.time()
            device_count += 1
            device_serial = device.get('serialNumber', 'Unknown')
            device_model = device.get('model', 'Unknown')
            device_status = device.get('status', 'Unknown')

            try:
                # Start a new transaction for this device
                conn.autocommit = False

                # Check if the device already exists in the database
                cursor.execute(
                    "SELECT id, asset_tag, status, current_user_id, status_source FROM chromebooks WHERE serial_number = %s",
                    (device_serial,)
                )
                existing_device = cursor.fetchone()

                # Map Google device data to database fields with safe defaults
                serial_number = device_serial if device_serial != 'Unknown' else f"UNKNOWN-{device.get('deviceId', 'NO-ID')}"

                # Generate unique asset tag
                if existing_device:
                    # Keep existing asset tag for updates
                    asset_tag = existing_device['asset_tag']
                    action = "update"
                else:
                    # Generate new unique asset tag for new devices
                    asset_tag = generate_unique_asset_tag(device, cursor)
                    action = "create"

                # Determine status - respect status_source priority
                if existing_device and existing_device.get('status_source') == 'local':
                    # Preserve local status (checked-out, maintenance set locally)
                    final_status = existing_device['status']
                else:
                    # Use Google status for devices with 'google' status_source or new devices
                    final_status = map_status(device.get('status'))

                device_data = {
                    'asset_tag': asset_tag,
                    'serial_number': serial_number,
                    'model': device.get('model') or 'Unknown',
                    'org_unit': device.get('orgUnitPath') or '/',
                    'status': final_status,
                    'is_insured': False,  # Default to False, do not override local values
                    'assigned_location': (device.get('orgUnitPath') or '/').split('/')[-1] or 'Unknown',
                    # Google Admin specific fields
                    'device_id': device.get('deviceId'),
                    'last_sync': device.get('lastSync'),
                    'platform_version': device.get('platformVersion'),
                    'os_version': device.get('osVersion'),
                    'firmware_version': device.get('firmwareVersion'),
                    'mac_address': device.get('macAddress'),
                    'last_known_network': json.dumps(device.get('lastKnownNetwork')) if device.get('lastKnownNetwork') else None,
                    'last_known_user': device.get('annotatedUser'),
                    # New Google API fields
                    'annotated_user': device.get('annotatedUser'),
                    'annotated_asset_id': device.get('annotatedAssetId'),
                    'recent_users': json.dumps(device.get('recentUsers')) if device.get('recentUsers') else None,
                    'org_unit_path': device.get('orgUnitPath'),
                    # Additional Google API fields from migration
                    'notes': device.get('notes'),
                    'boot_mode': device.get('bootMode'),
                    'last_enrollment_time': device.get('lastEnrollmentTime'),
                    'support_end_date': device.get('supportEndDate'),
                    'order_number': device.get('orderNumber'),
                    'will_auto_renew': device.get('willAutoRenew'),
                    'meid': device.get('meid'),
                    'etag': device.get('etag'),
                    'active_time_ranges': json.dumps(device.get('activeTimeRanges')) if device.get('activeTimeRanges') else None,
                    'cpu_status_reports': json.dumps(device.get('cpuStatusReports')) if device.get('cpuStatusReports') else None,
                    'disk_volume_reports': json.dumps(device.get('diskVolumeReports')) if device.get('diskVolumeReports') else None,
                    'system_ram_total': device.get('systemRamTotal'),
                    'system_ram_free_reports': json.dumps(device.get('systemRamFreeReports')) if device.get('systemRamFreeReports') else None
                }

                if existing_device:
                    # For existing devices, exclude fields that should be preserved locally
                    excluded_fields = []

                    # Protected statuses that should never have their status overwritten by Google sync
                    PROTECTED_STATUSES = ['checked_out', 'pending_signature']

                    # Always protect status field for checked-out/pending devices regardless of status_source
                    if existing_device['status'] in PROTECTED_STATUSES:
                        excluded_fields.extend(['status', 'current_user_id', 'checked_out_date', 'status_source', 'status_override_date'])
                        stats["protected"] += 1
                        logging.info(f"🔒 Protecting checkout status for device {device_serial} (status: {existing_device['status']})")

                    # Additional protection for devices with local status source (legacy protection)
                    elif existing_device.get('status_source') == 'local':
                        excluded_fields.extend(['status', 'status_source', 'status_override_date', 'is_insured'])

                        # If device is checked out or pending, also preserve checkout-related fields
                        if existing_device['status'] in ('checked_out', 'pending_signature'):
                            excluded_fields.extend(['current_user_id', 'checked_out_date'])

                    # Update existing device
                    update_fields = []
                    update_values = []

                    for key, value in device_data.items():
                        if key not in excluded_fields:
                            update_fields.append(f"{key} = %s")
                            update_values.append(value)

                    # Add the device ID to the values
                    update_values.append(existing_device['id'])

                    # Build and execute the update query
                    update_query = f"""
                        UPDATE chromebooks
                        SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING id
                    """

                    cursor.execute(update_query, update_values)
                    updated_device = cursor.fetchone()

                    if updated_device:
                        stats["updated"] += 1
                        result = "updated"
                    else:
                        stats["unchanged"] += 1
                        result = "unchanged"
                else:
                    # Create new device
                    insert_fields = list(device_data.keys())
                    placeholders = ["%s"] * len(insert_fields)

                    # Build and execute the insert query
                    insert_query = f"""
                        INSERT INTO chromebooks ({', '.join(insert_fields)})
                        VALUES ({', '.join(placeholders)})
                        RETURNING id
                    """

                    cursor.execute(insert_query, list(device_data.values()))
                    new_device = cursor.fetchone()

                    if new_device:
                        stats["created"] += 1
                        result = "created"
                    else:
                        stats["errors"] += 1
                        result = "error"

                # Commit this device's transaction
                conn.commit()

                # Track device processing time for performance metrics
                device_end = time.time()
                device_processing_time = round(device_end - device_start, 3)

                # Log progress every 100 devices
                if device_count % 100 == 0:
                    elapsed_time = round(time.time() - processing_start, 1)
                    rate = round(device_count / elapsed_time, 1) if elapsed_time > 0 else 0
                    logging.info(f"Processed {device_count}/{len(google_devices)} devices... ({rate} devices/sec)")

            except Exception as e:
                # Rollback the failed transaction
                conn.rollback()
                error_msg = f"Error processing device {device_serial}: {str(e)}"
                logging.error(error_msg)
                stats["errors"] += 1

            finally:
                # Reset to autocommit for the next device
                conn.autocommit = True

        # Calculate processing performance
        processing_end = time.time()
        perf_stats['processing_time'] = round(processing_end - processing_start, 2)

        if len(google_devices) > 0:
            perf_stats['avg_device_processing_time'] = round(perf_stats['processing_time'] / len(google_devices), 3)
            perf_stats['devices_per_second'] = round(len(google_devices) / perf_stats['processing_time'], 2)

        # Close the database connection
        cursor.close()
        conn.close()

        # Calculate total time
        total_time = time.time() - start_time
        perf_stats['total_time'] = round(total_time, 2)
        perf_stats['end_time'] = datetime.now().isoformat()

        logging.info(f"Sync completed in {perf_stats['total_time']} seconds")
        logging.info(f"API fetch: {perf_stats['google_api_fetch_time']}s, DB connection: {perf_stats['db_connection_time']}s, Processing: {perf_stats['processing_time']}s")
        logging.info(f"Performance: {perf_stats['devices_per_second']} devices/sec, {perf_stats['avg_device_processing_time']}s avg per device")
        logging.info(f"Results: {stats['created']} created, {stats['updated']} updated, {stats['unchanged']} unchanged, {stats['protected']} protected, {stats['errors']} errors")

        # Return the results
        return {
            "success": True,
            "message": f"Successfully synced {stats['total']} Chromebooks from Google Admin API in {perf_stats['total_time']} seconds",
            "data": stats,
            "performance": perf_stats
        }
    except Exception as e:
        total_time = time.time() - start_time
        perf_stats['total_time'] = round(total_time, 2)
        perf_stats['end_time'] = datetime.now().isoformat()

        logging.exception("Error syncing Chromebooks from Google Admin API")
        return {
            "success": False,
            "message": f"Error syncing Chromebooks: {str(e)}",
            "data": {},
            "performance": perf_stats
        }

def map_status(google_status):
    """
    Map Google device status to database status.

    Args:
        google_status (str): The status from Google Admin API.

    Returns:
        str: The corresponding status for the database.
    """
    status_map = {
        'ACTIVE': 'available',
        'DEPROVISIONED': 'deprovisioned',
        'DISABLED': 'disabled',
        'UNKNOWN': 'available'
    }

    return status_map.get(google_status, 'available')

if __name__ == "__main__":
    # Configure logging with more detailed format
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Sync Chromebooks
    result = sync_chromebooks()

    # Print the result as JSON
    print(json.dumps(result, indent=2))
