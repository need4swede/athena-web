# athena/api/google/devices.py

# Standard Imports
import ast                                                          # For parsing strings
from concurrent.futures import ThreadPoolExecutor, as_completed     # For concurrent execution
import configparser                                                 # For config file
import json
import os                                                           # For file operations
import logging                                                      # For logging
import time                                                         # For time operations

# External Imports
from google.api_core import retry                                   # For retrying operations
from google.oauth2 import service_account                           # For service account credentials
from googleapiclient.discovery import build                         # For building API service
from google.auth.exceptions import RefreshError                     # For handling credential refresh errors
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account

# Set up logging
logging.basicConfig(level=logging.INFO)                             # Set logging level
logger = logging.getLogger(__name__)                                # Get logger

# Local Imports
from athena.api import _API_Path                                            # API path structure
from athena.utils.data_utils import DataUtilities                       # Data utilities for processing data


class Initialize:
    """
    Base class for initializing configuration and authentication.
    """

    def __init__(self):
        """
        Initialize the class with utility functions and configuration.
        """
        self.api_path = _API_Path()
        self.cwd = os.getcwd()
        # Load env early so env vars can override file-based config
        self._load_env_file()
        self.auth = self.read_auth()
        self.config = self.read_config()

    def _load_env_file(self) -> None:
        """
        Best-effort loader for a local .env file to populate os.environ.
        Looks in CWD, package root, and parent of package root.
        """
        def parse_and_set(env_path: str) -> None:
            try:
                with open(env_path, 'r') as f:
                    for line in f:
                        s = line.strip()
                        if not s or s.startswith('#') or '=' not in s:
                            continue
                        k, v = s.split('=', 1)
                        k = k.strip()
                        v = v.strip().strip("\"'")
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass

        candidates = [
            os.path.join(os.getcwd(), '.env'),
            os.path.join(self.api_path.root(), '.env'),
            os.path.join(os.path.dirname(self.api_path.root()), '.env'),
        ]
        for p in candidates:
            if os.path.isfile(p):
                parse_and_set(p)

    def read_auth(self):
        """
        Read authentication configuration from auth.ini file.

        Returns:
            configparser.ConfigParser: Parsed authentication configuration.
        """
        auth = configparser.ConfigParser()
        auth.read(os.path.join(self.api_path.root(), self.api_path.google(), 'auth.ini'))
        return auth

    def read_config(self):
        """
        Read general configuration from config.ini file.

        Returns:
            configparser.ConfigParser: Parsed general configuration.
        """
        # If env vars are provided, synthesize a ConfigParser
        env_admin = os.environ.get('GOOGLE_ADMIN_EMAIL')
        env_scopes = os.environ.get('GOOGLE_SCOPES')

        if env_admin or env_scopes:
            cfg = configparser.ConfigParser()
            cfg['Settings'] = {}
            if env_admin:
                cfg['Settings']['ADMIN'] = env_admin
            if env_scopes:
                cfg['Settings']['SCOPES'] = env_scopes
            return cfg

        # Fallback to legacy config.ini
        config = configparser.ConfigParser()
        config.read(os.path.join(self.api_path.root(), self.api_path.google(), 'config.ini'))
        return config

    def read_key(self):
        """
        Get the path to the service account key file.

        Returns:
            str: Path to the key.json file.
        """
        key = os.path.join(self.api_path.root(), self.api_path.google(), 'key.json')
        return key

    def read_credentials(self):
        """
        Read and parse credentials from the service account key file.

        Returns:
            google.oauth2.service_account.Credentials: Credentials object.
        """
        # Resolve scopes from config or env
        raw_scopes = None
        if self.config and self.config.has_section('Settings') and self.config.has_option('Settings', 'SCOPES'):
            raw_scopes = self.config.get('Settings', 'SCOPES')
        else:
            raw_scopes = os.environ.get('GOOGLE_SCOPES')

        scopes = []
        if raw_scopes:
            # Try JSON first, then Python literal, then comma-separated
            try:
                parsed = json.loads(raw_scopes)
                if isinstance(parsed, list):
                    scopes = [str(s) for s in parsed]
                else:
                    scopes = [str(parsed)]
            except Exception:
                try:
                    parsed = ast.literal_eval(raw_scopes)
                    if isinstance(parsed, list):
                        scopes = [str(s) for s in parsed]
                    else:
                        scopes = [str(parsed)]
                except Exception:
                    scopes = [s.strip() for s in raw_scopes.split(',') if s.strip()]

        # Prefer inline JSON credentials via env; then an explicit file path; then legacy key.json
        key_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
        key_file = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')

        if key_json:
            try:
                info = json.loads(key_json)
            except json.JSONDecodeError:
                raise ValueError('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
            return service_account.Credentials.from_service_account_info(info, scopes=scopes or None)

        if key_file and os.path.isfile(key_file):
            return service_account.Credentials.from_service_account_file(key_file, scopes=scopes or None)

        # Fallback to legacy bundled key.json
        return service_account.Credentials.from_service_account_file(self.read_key(), scopes=scopes or None)

class Devices(Initialize):
    """
    Class for interacting with Google Admin SDK's Device Management API.
    """

    # Constants for batching and retries
    MAX_BATCH_SIZE = 50
    MAX_RETRIES = 3
    RETRY_DELAY = 1  # seconds
    REBOOT_COMMAND_TYPE = "REBOOT"

    _instance = None

    def __init__(self):
        """
        Initialize the Devices class with necessary credentials and services.
        """
        super().__init__()
        self.credentials = self.read_credentials()
        self.admin = self.load_admin()
        self.service = None
        self.verify_configuration()
        self._device_cache = {}
        logging.getLogger('googleapiclient.discovery_cache').setLevel(logging.ERROR)

    ## GET INSTANCE
    @staticmethod
    def get_instance():
        if Devices._instance is None:
            Devices._instance = Devices()
        return Devices._instance

    def load_admin(self):
        """
        Load admin credentials for domain-wide delegation.

        Returns:
            google.oauth2.service_account.Credentials: Admin credentials.
        """
        # Resolve admin email from env or config
        admin_email = None
        if self.config and self.config.has_section('Settings') and self.config.has_option('Settings', 'ADMIN'):
            admin_email = self.config.get('Settings', 'ADMIN')
        if not admin_email:
            admin_email = os.environ.get('GOOGLE_ADMIN_EMAIL')
        return self.credentials.with_subject(admin_email)

    def verify_configuration(self):
        """
        Verify the configuration settings.
        """
        # Ensure required settings are present either in env or config
        admin_email = None
        if self.config and self.config.has_section('Settings') and self.config.has_option('Settings', 'ADMIN'):
            admin_email = self.config.get('Settings', 'ADMIN')
        if not admin_email:
            admin_email = os.environ.get('GOOGLE_ADMIN_EMAIL')
        if not admin_email or '@' not in admin_email:
            raise ValueError(f"Invalid admin email: {admin_email}")

    def load_service(self, service_name='admin', version='directory_v1', credentials=None):
        """
        Build and return the specified Google API service.

        Args:
            service_name (str): Name of the Google API service ('admin' or 'chromemanagement').
            version (str): Version of the Google API service.
            credentials (google.auth.credentials.Credentials): Credentials to use. Defaults to self.admin.

        Returns:
            googleapiclient.discovery.Resource: Google API service object.
        """
        if credentials is None:
            credentials = self.admin

        try:
            service = build(service_name, version, credentials=credentials)
        except RefreshError as e:
            logger.error(f"Failed to refresh credentials: {str(e)}")
            raise
        return service

    def process_device(self, device, keys, include_null):
        processed = {}
        for key in keys:
            value = self.get_nested_value(device, key)
            if include_null or value is not None:
                processed[key] = value
        return processed

    def get_nested_value(self, data, key):
        keys = key.split('.')
        for k in keys:
            if isinstance(data, dict):
                data = data.get(k)
            elif isinstance(data, list) and data:
                try:
                    data = data[0].get(k)
                except (IndexError, AttributeError):
                    return None
            else:
                return None
            if data is None:
                return None
        return data

    def find_device(self, identifier, identifier_type='annotatedAssetId', *args, include_null=False):
        """
        Find a device by its annotatedAssetId or serialNumber across all organizational units.
        Args:
        identifier (str): The annotatedAssetId or serialNumber of the device to find.
        identifier_type (str): The type of identifier being used.
            Either 'annotatedAssetId' or 'serialNumber'. Defaults to 'annotatedAssetId'.
        *args: Fields to retrieve for the device. If not specified, default fields will be used.
        include_null (bool): Whether to include fields with null values in the response.
        Returns:
        dict or str: The device information if found, None otherwise.
                    If only one field is requested, returns the value directly.
        """
        if identifier_type not in ['annotatedAssetId', 'serialNumber']:
            raise ValueError("identifier_type must be either 'annotatedAssetId' or 'serialNumber'")

        # Check cache first
        cache_key = f"{identifier_type}:{identifier}"
        if cache_key in self._device_cache:
            result = self._device_cache[cache_key]
            return list(result.values())[0] if len(args) == 1 else result

        try:
            self.service = self.load_service()

            # Updated default fields list to include more available information
            fields = args or [
                'deviceId', 'serialNumber', 'status', 'lastSync', 'annotatedUser',
                'annotatedAssetId', 'annotatedLocation', 'notes', 'model', 'osVersion',
                'platformVersion', 'firmwareVersion', 'macAddress', 'orgUnitPath',
                'recentUsers', 'lastKnownNetwork', 'bootMode', 'lastEnrollmentTime',
                'supportEndDate', 'orderNumber', 'willAutoRenew', 'meid', 'etag',
                'activeTimeRanges', 'cpuStatusReports', 'diskVolumeReports',
                'systemRamTotal', 'systemRamFreeReports'
            ]

            # Expand and join fields
            expanded_fields = DataUtilities.expand_dot_notation(fields)
            fields_param = ','.join(expanded_fields)

            # Map identifier_type to the correct query parameter
            query_param = 'asset_id' if identifier_type == 'annotatedAssetId' else 'id'

            results = self.service.chromeosdevices().list(
                customerId='my_customer',
                query=f'{query_param}:{identifier}',
                projection='FULL',
                fields=f'chromeosdevices({fields_param})'
            ).execute()

            devices = results.get('chromeosdevices', [])
            if devices:
                device = devices[0]
                processed_device = self.process_device(device, fields, include_null)
                self._device_cache[cache_key] = processed_device
                # logging.info(f"Device found with {identifier_type}: {identifier}")

                # If only one field was requested, return the value directly
                if len(args) == 1:
                    return list(processed_device.values())[0]
                return processed_device

            return None

        except RefreshError as e:
            error_message = f"Failed to refresh credentials: {str(e)}"
            logging.error(error_message)
            logging.error("Please check your ADMIN email in the configuration.")
            return None
        except Exception as e:
            error_message = f"An error occurred: {str(e)}"
            logging.error(error_message)
            logging.exception("Exception details:")
            return None

    def get_device_info(self, devices, identifier_type='annotatedAssetId'):
        """
        Retrieve device information including status.

        Args:
            devices (list): List of device identifiers.
            identifier_type (str): The type of identifier, default is 'annotatedAssetId'

        Returns:
            list: List of device information dictionaries.
        """
        device_info_list = []
        for device in devices:
            # Try to find the device by the specified identifier_type
            device_info = self.find_device(device, identifier_type, 'deviceId', 'annotatedAssetId', 'orgUnitPath', 'status')
            if device_info:
                device_info_list.append({
                    'deviceId': device_info['deviceId'],
                    'annotatedAssetId': device_info.get('annotatedAssetId'),
                    'orgUnitPath': device_info.get('orgUnitPath', 'Unknown'),
                    'status': device_info.get('status', 'Unknown')
                })
            else:
                logger.warning(f"Device not found: {device}")
        return device_info_list

    def update_os(self, devices):
        """
        For each device in devices, send a WIPE_USERS command,
        and move the Chromebook to '3110 (for updating)' OU.

        Args:
            devices (list or str): A list of device identifiers or a single identifier.

        Returns:
            dict: A dictionary containing success and failure information.
        """
        if isinstance(devices, str):
            devices = [devices]

        # Load the service
        self.service = self.load_service()

        # Get device info
        device_info_list = self.get_device_info(devices)

        results = {
            'success': [],
            'failure': []
        }

        with ThreadPoolExecutor() as executor:
            future_to_device = {
                executor.submit(self.process_reset_device, device_info): device_info
                for device_info in device_info_list
            }
            for future in as_completed(future_to_device):
                device_info = future_to_device[future]
                try:
                    result = future.result()
                    results['success'].append(result)
                except Exception as e:
                    logging.error(f"Failed to send WIPE_USERS command to device {device_info.get('annotatedAssetId', device_info['deviceId'])}: {str(e)}")
                    results['failure'].append({
                        'deviceId': device_info['deviceId'],
                        'annotatedAssetId': device_info.get('annotatedAssetId'),
                        'reason': str(e)
                    })

        # Move successfully reset devices to '3110 (for updating)' OU
        if results['success']:
            move_devices = [d['deviceId'] for d in results['success']]
            move_results = self.move_devices_to_ou(move_devices, '3110 (for updating)', identifier_type='deviceId')
            # Update the results with move operation outcomes
            results['move_success'] = move_results.get('success', [])
            results['move_failure'] = move_results.get('failure', [])

        return results

    @retry.Retry(predicate=retry.if_exception_type(Exception))
    def move_batch(self, device_batch, target_ou):
        device_ids = [d['deviceId'] for d in device_batch]
        # Move the devices
        self.service.chromeosdevices().moveDevicesToOu(
            customerId='my_customer',
            orgUnitPath=target_ou,
            body={"deviceIds": device_ids}
        ).execute()
        # Log the move for each device
        for d in device_batch:
            identifier = d['annotatedAssetId']
            source_ou = d.get('orgUnitPath', 'Unknown')
            if source_ou == f"/{target_ou}":
                logger.info(f"move:[{source_ou}]:exists:{identifier}")
                continue
            logger.info(f"move:[{source_ou}]:[/{target_ou}]:{identifier}")
        return {
            "success": [
                {
                    "deviceId": d['deviceId'],
                    "annotatedAssetId": d['annotatedAssetId'],
                    "newOrgUnit": target_ou
                } for d in device_batch
            ]
        }

    def process_batch(self, batch, target_ou):
        """
        Process a single batch with retries.

        Args:
            batch (list): List of device info dictionaries.
            target_ou (str): The target organizational unit path.

        Returns:
            dict: Result of the batch processing.
        """
        for attempt in range(self.MAX_RETRIES):
            try:
                result = self.move_batch(batch, target_ou)
                return result
            except Exception as e:
                if attempt == self.MAX_RETRIES - 1:
                    logger.error(f"Failed to move batch after {self.MAX_RETRIES} attempts: {str(e)}")
                    return {
                        "failure": [
                            {
                                "deviceId": d['deviceId'],
                                "annotatedAssetId": d['annotatedAssetId'],
                                "reason": str(e)
                            } for d in batch
                        ]
                    }
                time.sleep(self.RETRY_DELAY)
                logger.warning(f"Retrying batch due to error: {str(e)} (Attempt {attempt + 1})")

    def move_devices_to_ou(self, devices, target_ou, identifier_type='annotatedAssetId'):
        """
        Move multiple devices to a specified organizational unit using threading and batching.

        Args:
            devices (list or str): A list of device identifiers or a single identifier.
            target_ou (str): The target organizational unit path.
            identifier_type (str): The type of identifier being used to find devices. Defaults to 'annotatedAssetId'.

        Returns:
            dict: A dictionary containing success and failure information.
        """
        if isinstance(devices, str):
            devices = [devices]

        # Prepend 'Chromebooks/' to the target OU if not already present
        if not target_ou.startswith('Chromebooks/'):
            target_ou = f"Chromebooks/{target_ou}"

        # Load the service
        self.service = self.load_service()

        # If identifier_type is 'deviceId', create device_info_list directly
        if identifier_type == 'deviceId':
            device_info_list = [{'deviceId': device} for device in devices]
        else:
            # Get device info
            device_info_list = self.get_device_info(devices, identifier_type=identifier_type)

        # Split devices into batches
        batches = [
            device_info_list[i:i + self.MAX_BATCH_SIZE]
            for i in range(0, len(device_info_list), self.MAX_BATCH_SIZE)
        ]

        results = {
            "success": [],
            "failure": []
        }

        with ThreadPoolExecutor() as executor:
            future_to_batch = {
                executor.submit(self.process_batch, batch, target_ou): batch
                for batch in batches
            }
            for future in as_completed(future_to_batch):
                batch_result = future.result()
                if 'success' in batch_result:
                    results['success'].extend(batch_result['success'])
                if 'failure' in batch_result:
                    results['failure'].extend(batch_result['failure'])

        return results

    def deprovision(self, devices, target_ou=None):
        """
        Deprovision devices without factory reset and with 'different_model_replacement' reason.
        Optionally move devices to a specified OU after deprovisioning.

        Args:
            devices (list or str): A list of device identifiers or a single identifier.
            target_ou (str, optional): The target organizational unit path to move devices after deprovisioning.

        Returns:
            dict: A dictionary containing success and failure information.
        """
        if isinstance(devices, str):
            devices = [devices]

        # Load the service
        self.service = self.load_service()

        # Get device info (including status)
        device_info_list = self.get_device_info(devices)

        results = {
            "success": [],
            "already_deprovisioned": [],
            "failure": []
        }

        with ThreadPoolExecutor() as executor:
            future_to_device = {
                executor.submit(self.process_deprovision_device, device_info): device_info
                for device_info in device_info_list
            }
            for future in as_completed(future_to_device):
                device_info = future_to_device[future]
                try:
                    result = future.result()
                    status = result.get('status')
                    if status == "Already deprovisioned":
                        results['already_deprovisioned'].append(result)
                    else:
                        results['success'].append(result)
                except Exception as e:
                    logging.error(f"Failed to deprovision device {device_info['annotatedAssetId']}: {str(e)}")
                    results['failure'].append({
                        "deviceId": device_info['deviceId'],
                        "annotatedAssetId": device_info['annotatedAssetId'],
                        "reason": str(e)
                    })

        # If target_ou is provided, move the successfully deprovisioned devices to that OU
        if target_ou and results['success']:
            move_devices = [d['annotatedAssetId'] for d in results['success']]
            move_results = self.move_devices_to_ou(move_devices, target_ou)
            # Update the results with move operation outcomes
            results['move_success'] = move_results.get('success', [])
            results['move_failure'] = move_results.get('failure', [])

        return results

    def process_deprovision_device(self, device_info):
        """
        Deprovision a single device without factory reset.

        Args:
            device_info (dict): Dictionary containing device information.

        Returns:
            dict: Information about the deprovisioned device.
        """
        deviceId = device_info['deviceId']
        status = device_info.get('status')

        if status == 'DEPROVISIONED':
            logging.info(f"Device {device_info['annotatedAssetId']} is already deprovisioned.")
            return {
                "deviceId": device_info['deviceId'],
                "annotatedAssetId": device_info['annotatedAssetId'],
                "status": "Already deprovisioned"
            }

        body = {
            "action": "deprovision",
            "deprovisionReason": "different_model_replacement",
            "doNotErase": True
        }
        for attempt in range(self.MAX_RETRIES):
            try:
                self.service.chromeosdevices().action(
                    customerId='my_customer',
                    resourceId=deviceId,
                    body=body
                ).execute()
                logging.info(f"Deprovisioned device {device_info['annotatedAssetId']}")
                return {
                    "deviceId": device_info['deviceId'],
                    "annotatedAssetId": device_info['annotatedAssetId'],
                    "status": "Deprovisioned"
                }
            except Exception as e:
                if "Illegal device state transition" in str(e):
                    logging.info(f"Device {device_info['annotatedAssetId']} is already deprovisioned.")
                    return {
                        "deviceId": device_info['deviceId'],
                        "annotatedAssetId": device_info['annotatedAssetId'],
                        "status": "Already deprovisioned"
                    }
                if attempt == self.MAX_RETRIES - 1:
                    logging.error(f"Failed to deprovision device {device_info['annotatedAssetId']} after {self.MAX_RETRIES} attempts: {str(e)}")
                    raise
                time.sleep(self.RETRY_DELAY)
                logging.warning(f"Retrying deprovision of device {device_info['annotatedAssetId']} due to error: {str(e)} (Attempt {attempt + 1})")

    def reboot_devices(self, devices, identifier_type='annotatedAssetId', user_session_delay_seconds=0):
        """
        Reboot multiple devices remotely.

        Args:
            devices (list or str): A list of device identifiers or a single identifier.
            identifier_type (str): The type of identifier being used to find devices. Defaults to 'annotatedAssetId'.
            user_session_delay_seconds (int): Seconds to wait before rebooting if a user is logged in. Defaults to 0.

        Returns:
            dict: A dictionary containing success and failure information.
        """
        if isinstance(devices, str):
            devices = [devices]

        # Validate user_session_delay_seconds
        if not isinstance(user_session_delay_seconds, int) or not (0 <= user_session_delay_seconds <= 300):
            raise ValueError("user_session_delay_seconds must be an integer between 0 and 300.")

        # Load the service
        self.service = self.load_service()

        # If identifier_type is 'deviceId', create device_info_list directly
        if identifier_type == 'deviceId':
            device_info_list = [{'deviceId': device} for device in devices]
        else:
            # Get device info
            device_info_list = self.get_device_info(devices, identifier_type=identifier_type)

        # Split devices into batches
        batches = [
            device_info_list[i:i + self.MAX_BATCH_SIZE]
            for i in range(0, len(device_info_list), self.MAX_BATCH_SIZE)
        ]

        results = {
            "success": [],
            "failure": []
        }

        with ThreadPoolExecutor(max_workers=self.MAX_BATCH_SIZE) as executor:
            future_to_batch = {
                executor.submit(self.process_reboot_batch, batch, user_session_delay_seconds): batch
                for batch in batches
            }
            for future in as_completed(future_to_batch):
                batch_result = future.result()
                if 'success' in batch_result:
                    results['success'].extend(batch_result['success'])
                if 'failure' in batch_result:
                    results['failure'].extend(batch_result['failure'])

        return results

    def process_reboot_batch(self, batch, user_session_delay_seconds):
        """
        Process a single batch of devices to send reboot commands.

        Args:
            batch (list): List of device info dictionaries.
            user_session_delay_seconds (int): Seconds to wait before rebooting if a user is logged in.

        Returns:
            dict: Result of the batch processing.
        """
        batch_results = {
            "success": [],
            "failure": []
        }

        with ThreadPoolExecutor(max_workers=self.MAX_BATCH_SIZE) as executor:
            future_to_device = {
                executor.submit(self.process_reboot_device, device_info, user_session_delay_seconds): device_info
                for device_info in batch
            }
            for future in as_completed(future_to_device):
                device_info = future_to_device[future]
                try:
                    result = future.result()
                    batch_results['success'].append(result)
                except Exception as e:
                    logging.error(f"Failed to reboot device {device_info.get('annotatedAssetId', device_info['deviceId'])}: {str(e)}")
                    batch_results['failure'].append({
                        'deviceId': device_info['deviceId'],
                        'annotatedAssetId': device_info.get('annotatedAssetId'),
                        'reason': str(e)
                    })

        return batch_results

    def process_reboot_device(self, device_info, user_session_delay_seconds):
        """
        Send REBOOT command to the device.

        Args:
            device_info (dict): Dictionary containing device information.
            user_session_delay_seconds (int): Seconds to wait before rebooting if a user is logged in.

        Returns:
            dict: Information about the REBOOT command sent.
        """
        deviceId = device_info['deviceId']
        customerId = 'my_customer'
        payload = {"user_session_delay_seconds": user_session_delay_seconds}
        body = {
            "commandType": self.REBOOT_COMMAND_TYPE,
            "payload": json.dumps(payload)
        }

        for attempt in range(self.MAX_RETRIES):
            try:
                command = self.service.customer().devices().chromeos().issueCommand(
                    customerId=customerId,
                    deviceId=deviceId,
                    body=body
                ).execute()
                logging.info(f"Sent REBOOT command to device {device_info.get('annotatedAssetId', deviceId)} with Command ID: {command.get('commandId')}")
                return {
                    "deviceId": deviceId,
                    "annotatedAssetId": device_info.get('annotatedAssetId'),
                    "status": "REBOOT command sent",
                    "commandId": command.get('commandId')
                }
            except RefreshError as e:
                logging.error(f"Failed to refresh credentials: {str(e)}")
                raise
            except Exception as e:
                if attempt == self.MAX_RETRIES - 1:
                    logging.error(f"Failed to send REBOOT command to device {device_info.get('annotatedAssetId', deviceId)} after {self.MAX_RETRIES} attempts: {str(e)}")
                    raise
                time.sleep(self.RETRY_DELAY)
                logging.warning(f"Retrying REBOOT command for device {device_info.get('annotatedAssetId', deviceId)} due to error: {str(e)} (Attempt {attempt + 1})")

    def list_organizational_units(self, formatted=False):
        """
        List all organizational units under '/Chromebooks' by querying devices.

        Args:
            formatted (bool): Whether to return formatted JSON string or Python object.

        Returns:
            dict or str: Dictionary containing OU information or formatted JSON string.
        """
        try:
            service = self.load_service()

            # Query all devices to get their OUs with a high maxResults value
            results = service.chromeosdevices().list(
                customerId='my_customer',
                projection='BASIC',
                fields='chromeosdevices(orgUnitPath),nextPageToken',
                maxResults=1000  # Increased to get more devices
            ).execute()

            # Extract unique OUs
            unique_ous = set()

            # Process first page
            devices = results.get('chromeosdevices', [])
            for device in devices:
                ou_path = device.get('orgUnitPath', '')
                if ou_path and ou_path.startswith('/Chromebooks'):
                    unique_ous.add(ou_path)

            # Handle pagination if there are more devices
            while 'nextPageToken' in results:
                results = service.chromeosdevices().list(
                    customerId='my_customer',
                    projection='BASIC',
                    fields='chromeosdevices(orgUnitPath),nextPageToken',
                    maxResults=1000,
                    pageToken=results['nextPageToken']
                ).execute()

                devices = results.get('chromeosdevices', [])
                for device in devices:
                    ou_path = device.get('orgUnitPath', '')
                    if ou_path and ou_path.startswith('/Chromebooks'):
                        unique_ous.add(ou_path)

            # Format the data
            formatted_ous = []
            for ou_path in unique_ous:
                ou_name = ou_path.split('/')[-1] if ou_path else ''
                parent_path = '/'.join(ou_path.split('/')[:-1]) if '/' in ou_path else ''
                formatted_ou = {
                    'name': ou_name,
                    'orgUnitPath': ou_path,
                    'parentOrgUnitPath': parent_path
                }
                formatted_ous.append(formatted_ou)

            # Sort OUs by orgUnitPath for consistent ordering
            formatted_ous.sort(key=lambda x: x['orgUnitPath'])

            response = {
                'message': f'Successfully retrieved {len(formatted_ous)} organizational units',
                'organizationalUnits': formatted_ous
            }

            if formatted:
                return json.dumps(response, indent=4, ensure_ascii=False)

            return response

        except RefreshError as e:
            error_message = f"Failed to refresh credentials: {str(e)}"
            logging.error(error_message)
            logging.error("Please check your ADMIN email in the configuration.")
            return {"error": error_message}

        except Exception as e:
            error_message = f"An error occurred: {str(e)}"
            logging.error(error_message)
            logging.exception("Exception details:")
            return {"error": error_message}

    def reset_device(self, devices):
        """
        For each device in devices, send a WIPE_USERS command

        Args:
            devices (list or str): A list of device identifiers or a single identifier.

        Returns:
            dict: A dictionary containing success and failure information.
        """
        if isinstance(devices, str):
            devices = [devices]

        # Load the service
        self.service = self.load_service()

        # Get device info
        device_info_list = self.get_device_info(devices)

        results = {
            'success': [],
            'failure': []
        }

        with ThreadPoolExecutor() as executor:
            future_to_device = {
                executor.submit(self.process_reset_device, device_info): device_info
                for device_info in device_info_list
            }
            for future in as_completed(future_to_device):
                device_info = future_to_device[future]
                try:
                    result = future.result()
                    results['success'].append(result)
                except Exception as e:
                    logging.error(f"Failed to send WIPE_USERS command to device {device_info.get('annotatedAssetId', device_info['deviceId'])}: {str(e)}")
                    results['failure'].append({
                        'deviceId': device_info['deviceId'],
                        'annotatedAssetId': device_info.get('annotatedAssetId'),
                        'reason': str(e)
                    })

        return results

    def list_all_devices_by_ou(self, organizational_unit_path=None, batch_size=100, recent_users_limit=1, formatted=False, include_null=False):
        """
        List ALL devices in a specific organizational unit using pagination.

        Args:
            organizational_unit_path (str): The organizational unit path to search. Defaults to None (root).
            batch_size (int): The number of devices to retrieve per API call. Defaults to 100.
            recent_users_limit (int): Maximum number of recent users to include. Defaults to 1.
            formatted (bool): Whether to return formatted JSON string or Python object.
            include_null (bool): Whether to include fields with null values in the response.

        Returns:
            dict or str: Dictionary containing all device information or formatted JSON string.
        """
        try:
            service = self.load_service()

            if organizational_unit_path and organizational_unit_path != '/':
                if not organizational_unit_path.startswith('/'):
                    full_organizational_unit_path = f'/{organizational_unit_path}'
                else:
                    full_organizational_unit_path = organizational_unit_path
            else:
                full_organizational_unit_path = '/'

            logger.info(f"Retrieving all devices from organizational unit: {full_organizational_unit_path}")

            # Updated default fields list to include more available information
            fields = [
                'deviceId', 'serialNumber', 'status', 'lastSync', 'annotatedUser',
                'annotatedAssetId', 'annotatedLocation', 'notes', 'model', 'osVersion',
                'platformVersion', 'firmwareVersion', 'macAddress', 'orgUnitPath',
                'recentUsers', 'lastKnownNetwork', 'bootMode', 'lastEnrollmentTime',
                'supportEndDate', 'orderNumber', 'willAutoRenew', 'meid', 'etag',
                'activeTimeRanges', 'cpuStatusReports', 'diskVolumeReports',
                'systemRamTotal', 'systemRamFreeReports'
            ]

            expanded_fields = DataUtilities.expand_dot_notation(fields)
            fields_param = ','.join(expanded_fields)

            all_devices = []
            page_token = None
            total_requests = 0

            while True:
                total_requests += 1

                # Build the request parameters
                request_params = {
                    'customerId': 'my_customer',
                    'orgUnitPath': full_organizational_unit_path,
                    'maxResults': batch_size,
                    'projection': 'FULL',
                    'fields': f'chromeosdevices({fields_param}),nextPageToken'
                }

                if page_token:
                    request_params['pageToken'] = page_token

                # Make the API call
                results = service.chromeosdevices().list(**request_params).execute()
                devices = results.get('chromeosdevices', [])

                if devices:
                    # Process recent users for each device
                    for device in devices:
                        if 'recentUsers' in device:
                            device['recentUsers'] = device['recentUsers'][:recent_users_limit]

                        processed_device = self.process_device(device, fields, include_null)
                        all_devices.append(processed_device)

                # Check if there are more pages
                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            if not all_devices:
                response = {
                    "message": f"No devices found in the organizational unit: {full_organizational_unit_path}",
                    "devices": []
                }
            else:
                # Group devices by organizational unit if needed
                devices_by_ou = {}
                for device in all_devices:
                    ou_path = device.get('orgUnitPath', '/')
                    if ou_path not in devices_by_ou:
                        devices_by_ou[ou_path] = []
                    devices_by_ou[ou_path].append(device)

                response = {
                    "message": f"{len(all_devices)} devices retrieved successfully from {full_organizational_unit_path} in {total_requests} API calls.",
                    "devices": all_devices,
                    "devices_by_ou": devices_by_ou,
                    "total_devices": len(all_devices),
                    "api_calls": total_requests
                }

            if formatted:
                return json.dumps(response, indent=4, ensure_ascii=False)

            return response

        except RefreshError as e:
            error_message = f"Failed to refresh credentials: {str(e)}"
            logging.error(error_message)
            logging.error("Please check your ADMIN email in the configuration.")
            return {"error": error_message}

        except Exception as e:
            error_message = f"An error occurred: {str(e)}"
            logging.error(error_message)
            logging.exception("Exception details:")
            return {"error": error_message}

    def list_all_devices(self, batch_size=100, recent_users_limit=1, formatted=False, include_null=False):
        """
        List ALL devices across all organizational units using pagination and parallel execution.
        """
        try:
            logger.info("Retrieving all devices across all organizational units")

            # Step 1: Get all organizational units
            ou_response = self.list_organizational_units()
            if 'error' in ou_response:
                return ou_response

            organizational_units = ou_response.get('organizationalUnits', [])
            if not organizational_units:
                return {"message": "No organizational units found.", "devices": []}

            all_devices = []
            total_api_calls = 0

            # Step 2: Fetch devices from each OU in parallel
            with ThreadPoolExecutor() as executor:
                future_to_ou = {
                    executor.submit(
                        self.list_all_devices_by_ou,
                        ou['orgUnitPath'],
                        batch_size,
                        recent_users_limit,
                        False,  # formatted
                        include_null
                    ): ou for ou in organizational_units
                }

                for future in as_completed(future_to_ou):
                    ou = future_to_ou[future]
                    try:
                        result = future.result()
                        if 'error' in result:
                            logger.error(f"Error fetching devices for OU {ou['orgUnitPath']}: {result['error']}")
                        else:
                            all_devices.extend(result.get('devices', []))
                            total_api_calls += result.get('api_calls', 0)
                    except Exception as e:
                        logger.error(f"Exception fetching devices for OU {ou['orgUnitPath']}: {e}")

            # Step 3: Consolidate and format the results
            if not all_devices:
                response = {
                    "message": "No devices found across any organizational units",
                    "devices": []
                }
            else:
                devices_by_ou = {}
                for device in all_devices:
                    ou_path = device.get('orgUnitPath', '/')
                    if ou_path not in devices_by_ou:
                        devices_by_ou[ou_path] = []
                    devices_by_ou[ou_path].append(device)

                response = {
                    "message": f"{len(all_devices)} devices retrieved successfully in {total_api_calls} API calls.",
                    "devices": all_devices,
                    "devices_by_ou": devices_by_ou,
                    "total_devices": len(all_devices),
                    "api_calls": total_api_calls
                }

            if formatted:
                return json.dumps(response, indent=4, ensure_ascii=False)

            return response

        except RefreshError as e:
            error_message = f"Failed to refresh credentials: {str(e)}"
            logging.error(error_message)
            logging.error("Please check your ADMIN email in the configuration.")
            return {"error": error_message}

        except Exception as e:
            error_message = f"An error occurred: {str(e)}"
            logging.error(error_message)
            logging.exception("Exception details:")
            return {"error": error_message}

    def process_reset_device(self, device_info):
        """
        Send WIPE_USERS command to the device.

        Args:
            device_info (dict): Dictionary containing device information.

        Returns:
            dict: Information about the WIPE_USERS command sent.
        """
        deviceId = device_info['deviceId']
        customerId = 'my_customer'
        body = {
            "commandType": "WIPE_USERS"
        }

        for attempt in range(self.MAX_RETRIES):
            try:
                command = self.service.customer().devices().chromeos().issueCommand(
                    customerId=customerId,
                    deviceId=deviceId,
                    body=body
                ).execute()
                logging.info(f"Sent WIPE_USERS command to device {device_info.get('annotatedAssetId', deviceId)}")
                return {
                    "deviceId": deviceId,
                    "annotatedAssetId": device_info.get('annotatedAssetId'),
                    "status": "WIPE_USERS command sent",
                    "commandId": command.get('commandId')
                }
            except Exception as e:
                if attempt == self.MAX_RETRIES - 1:
                    logging.error(f"Failed to send WIPE_USERS command to device {device_info.get('annotatedAssetId', deviceId)} after {self.MAX_RETRIES} attempts: {str(e)}")
                    raise
                time.sleep(self.RETRY_DELAY)
                logging.warning(f"Retrying WIPE_USERS command for device {device_info.get('annotatedAssetId', deviceId)} due to error: {str(e)} (Attempt {attempt + 1})")

    def update_device_notes(self, identifier, notes_content, identifier_type='annotatedAssetId'):
        """
        Update the notes field for a device in Google Admin Console.

        Args:
            identifier (str): The device identifier (asset ID or serial number)
            notes_content (str): The new notes content to set
            identifier_type (str): Type of identifier ('annotatedAssetId' or 'serialNumber')

        Returns:
            dict: Success/failure information with detailed logging
        """
        try:
            logging.info(f"🔄 [Google API] Starting notes update for device {identifier}")

            # First, find the device to get its deviceId
            device_info = self.find_device(identifier, identifier_type, 'deviceId', 'notes')
            if not device_info:
                logging.error(f"❌ [Google API] Device not found: {identifier}")
                return {"success": False, "error": f"Device not found: {identifier}"}

            device_id = device_info['deviceId']
            current_notes = device_info.get('notes', '')

            logging.info(f"✅ [Google API] Device found - ID: {device_id}")
            logging.info(f"📝 [Google API] Current notes: {current_notes}")
            logging.info(f"📝 [Google API] New notes: {notes_content}")

            # Update the device notes using the Admin SDK
            self.service = self.load_service()

            body = {
                "notes": notes_content
            }

            for attempt in range(self.MAX_RETRIES):
                try:
                    result = self.service.chromeosdevices().update(
                        customerId='my_customer',
                        deviceId=device_id,
                        body=body
                    ).execute()

                    logging.info(f"✅ [Google API] Notes updated successfully for device {identifier}")
                    return {
                        "success": True,
                        "deviceId": device_id,
                        "identifier": identifier,
                        "previousNotes": current_notes,
                        "newNotes": notes_content
                    }

                except Exception as e:
                    if attempt == self.MAX_RETRIES - 1:
                        logging.error(f"❌ [Google API] Failed to update notes for device {identifier} after {self.MAX_RETRIES} attempts: {str(e)}")
                        raise
                    time.sleep(self.RETRY_DELAY)
                    logging.warning(f"🔄 [Google API] Retrying notes update for device {identifier} due to error: {str(e)} (Attempt {attempt + 1})")

        except Exception as e:
            logging.error(f"❌ [Google API] Failed to update notes for device {identifier}: {str(e)}")
            return {"success": False, "error": str(e), "identifier": identifier}

    def move_chrome_os_device(self, device_id, target_org_unit):
        """
        Move a single Chrome OS device to a different organizational unit.

        Args:
            device_id (str): The device ID from Google Admin Console
            target_org_unit (str): The target organizational unit path

        Returns:
            bool: True if successful, False otherwise
        """
        try:
            logging.info(f"🔄 [Google API] Moving device {device_id} to {target_org_unit}")

            # Prepend '/Chromebooks' to the target OU if not already present
            if not target_org_unit.startswith('/'):
                target_org_unit = '/' + target_org_unit

            if not target_org_unit.startswith('/Chromebooks'):
                target_org_unit = '/Chromebooks' + target_org_unit.replace('/Chromebooks', '')

            # Load the service
            self.service = self.load_service()

            # Use the moveDevicesToOu API with a single device
            body = {
                "deviceIds": [device_id]
            }

            for attempt in range(self.MAX_RETRIES):
                try:
                    result = self.service.chromeosdevices().moveDevicesToOu(
                        customerId='my_customer',
                        orgUnitPath=target_org_unit,
                        body=body
                    ).execute()

                    logging.info(f"✅ [Google API] Device {device_id} moved successfully to {target_org_unit}")
                    return True

                except Exception as e:
                    if attempt == self.MAX_RETRIES - 1:
                        logging.error(f"❌ [Google API] Failed to move device {device_id} after {self.MAX_RETRIES} attempts: {str(e)}")
                        raise
                    time.sleep(self.RETRY_DELAY)
                    logging.warning(f"🔄 [Google API] Retrying device move for {device_id} due to error: {str(e)} (Attempt {attempt + 1})")

            return False

        except Exception as e:
            logging.error(f"❌ [Google API] Failed to move device {device_id}: {str(e)}")
            return False
