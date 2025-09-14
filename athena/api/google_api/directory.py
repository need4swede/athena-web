# athena/api/google/directory.py

# Standard Imports
import ast                                              # For parsing strings
import configparser                                     # For config file
import os                                               # For file operations
import logging                                          # For logging
from typing import Optional, List, Dict, Any, Union    # For type hints

# External Imports
from google.oauth2 import service_account               # For service account credentials
from googleapiclient.discovery import build             # For building API service
from google.auth.exceptions import RefreshError         # For handling credential refresh errors
from googleapiclient.errors import HttpError            # For handling API errors

# Set up logging
logging.basicConfig(level=logging.INFO)                 # Set logging level
logger = logging.getLogger(__name__)                    # Get logger

# Local Imports
from .. import _API_Path                       # API path structure

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
        self.auth = self.read_auth()
        self.config = self.read_config()

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
        scopes = self.config['Settings']['SCOPES']
        # Try to parse as a list, if it fails, treat as a single string
        try:
            scopes = ast.literal_eval(scopes)
        except (ValueError, SyntaxError):
            scopes = [scopes]  # Wrap single scope in a list

        credentials = service_account.Credentials.from_service_account_file(
            self.read_key(), scopes=scopes)
        return credentials

class Directory(Initialize):
    """
    Class for interacting with Google Admin Directory API.
    """

    def __init__(self):
        """
        Initialize the Directory class with necessary credentials and services.
        """
        super().__init__()
        self.credentials = self.read_credentials()
        self.admin = self.load_admin()
        self.service = None  # Initialize as None
        self.verify_configuration()  # Verify configuration before loading service
        logging.getLogger('googleapiclient.discovery_cache').setLevel(logging.ERROR)

    def load_admin(self):
        """
        Load admin credentials for domain-wide delegation.

        Returns:
            google.oauth2.service_account.Credentials: Admin credentials.
        """
        admin_email = self.config['Settings']['ADMIN']
        return self.credentials.with_subject(admin_email)

    def verify_configuration(self):
        """
        Verify the configuration settings.
        """
        required_settings = ['SCOPES', 'ADMIN']
        for setting in required_settings:
            if setting not in self.config['Settings']:
                raise ValueError(f"Missing required setting: {setting}")

        admin_email = self.config['Settings']['ADMIN']
        if not admin_email or '@' not in admin_email:
            raise ValueError(f"Invalid admin email: {admin_email}")

    def load_service(self):
        """
        Build and return the Google Admin Directory service.

        Returns:
            googleapiclient.discovery.Resource: Google Admin Directory service object.
        """
        if self.service is None:
            try:
                self.service = build('admin', 'directory_v1', credentials=self.admin)
            except RefreshError as e:
                logger.error(f"Failed to refresh credentials: {str(e)}")
                raise
        return self.service

    def _handle_error(self, e: Exception, operation: str) -> Dict[str, str]:
        """
        Handle and format errors consistently.

        Args:
            e: The exception that occurred
            operation: The operation being performed

        Returns:
            Dict containing error information
        """
        if isinstance(e, RefreshError):
            error_message = f"Failed to refresh credentials during {operation}: {str(e)}"
            logger.error(error_message)
            logger.error("Please check your ADMIN email in the configuration.")
        elif isinstance(e, HttpError):
            error_message = f"HTTP error during {operation}: {e.resp.status} - {e.content.decode()}"
            logger.error(error_message)
        else:
            error_message = f"An error occurred during {operation}: {str(e)}"
            logger.error(error_message)

        return {"error": error_message}

    # ===== USER RETRIEVAL METHODS =====

    def list_users(self, max_results=10):
        """
        List users in the domain, ordered by email.

        Args:
        max_results (int): The maximum number of users to retrieve. Defaults to 10.

        Returns:
        dict: A dictionary with user information.
        """
        try:
            service = self.load_service()
            results = service.users().list(
                customer='my_customer',
                maxResults=max_results,
                orderBy='email',
                projection='full'  # Get all user properties including orgUnitPath
            ).execute()
            users = results.get('users', [])

            if not users:
                return {"message": "No users found in the domain.", "users": []}
            else:
                # Return all properties of each user
                user_list = users
                return {"message": f"{len(users)} users retrieved successfully.", "users": user_list}

        except Exception as e:
            return self._handle_error(e, "list_users")

    def list_all_users(self, batch_size=500):
        """
        List ALL users in the domain using pagination, ordered by email.

        Args:
        batch_size (int): The number of users to retrieve per API call. Defaults to 500 (max allowed).

        Returns:
        dict: A dictionary with all user information.
        """
        try:
            service = self.load_service()
            all_users = []
            page_token = None
            total_requests = 0

            while True:
                total_requests += 1

                # Build the request parameters
                request_params = {
                    'customer': 'my_customer',
                    'maxResults': batch_size,
                    'orderBy': 'email'
                }

                if page_token:
                    request_params['pageToken'] = page_token

                # Make the API call
                results = service.users().list(**request_params).execute()
                users = results.get('users', [])

                if users:
                    all_users.extend(users)

                # Check if there are more pages
                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            if not all_users:
                return {"message": "No users found in the domain.", "users": []}
            else:
                return {
                    "message": f"{len(all_users)} users retrieved successfully in {total_requests} API calls.",
                    "users": all_users,
                    "total_users": len(all_users),
                    "api_calls": total_requests
                }

        except Exception as e:
            return self._handle_error(e, "list_all_users")

    def get_user(self, user_key: str, projection: str = 'full') -> Dict[str, Any]:
        """
        Retrieve a specific user by user key.

        Args:
            user_key (str): The user key (email or unique ID).
            projection (str): What subset of fields to fetch. Options: basic, custom, full

        Returns:
            dict: A dictionary with user information.
        """
        try:
            service = self.load_service()
            user = service.users().get(
                userKey=user_key,
                projection=projection
            ).execute()
            return {"message": "User retrieved successfully.", "user": user}

        except Exception as e:
            return self._handle_error(e, f"get_user for {user_key}")

    def search_email(self, user_key):
        """
        Retrieve a user by user key.

        Args:
        user_key (str): The user key (email or unique ID).

        Returns:
        dict: A dictionary with user information.
        """
        return self.get_user(user_key)

    def search_student_id(self, student_id):
        """
        Retrieve a user by student ID number.

        Args:
        student_id (str): The student ID number.

        Returns:
        dict: A dictionary with user information.
        """
        try:
            service = self.load_service()
            logger.info(f" Searching for Student ID: {student_id}")

            query = f"email:.{student_id}@"

            results = service.users().list(
                customer='my_customer',
                query=query,
                orderBy='email',
                projection='full',
                maxResults=2
            ).execute()

            users = results.get('users', [])
            logger.info(f" Found {len(users)} users matching the student ID")

            if not users:
                return {"message": f"No user found with student ID: {student_id}", "user": None}
            elif len(users) > 1:
                return {"message": f"Multiple users found with student ID: {student_id}", "users": users}
            else:
                return {"message": "User retrieved successfully.", "user": users[0]}

        except Exception as e:
            return self._handle_error(e, f"search_student_id for {student_id}")

    # ===== USER CREATION AND MODIFICATION =====

    def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new user account.

        Args:
            user_data (dict): User data dictionary. Required fields:
                - primaryEmail: User's primary email
                - name: Dict with givenName and familyName
                - password: User's password (8-100 characters)
                Optional fields include orgUnitPath, suspended, etc.

        Returns:
            dict: Result of user creation operation.
        """
        try:
            service = self.load_service()

            # Validate required fields
            required_fields = ['primaryEmail', 'name', 'password']
            for field in required_fields:
                if field not in user_data:
                    return {"error": f"Missing required field: {field}"}

            # Validate name structure
            if not isinstance(user_data['name'], dict) or 'givenName' not in user_data['name'] or 'familyName' not in user_data['name']:
                return {"error": "name must be a dict with givenName and familyName"}

            result = service.users().insert(body=user_data).execute()
            logger.info(f"Successfully created user: {user_data['primaryEmail']}")
            return {"message": "User created successfully.", "user": result}

        except Exception as e:
            return self._handle_error(e, f"create_user for {user_data.get('primaryEmail', 'unknown')}")

    def update_user(self, user_key: str, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing user account.

        Args:
            user_key (str): The user key (email or unique ID).
            user_data (dict): User data to update.

        Returns:
            dict: Result of user update operation.
        """
        try:
            service = self.load_service()
            result = service.users().update(
                userKey=user_key,
                body=user_data
            ).execute()
            logger.info(f"Successfully updated user: {user_key}")
            return {"message": "User updated successfully.", "user": result}

        except Exception as e:
            return self._handle_error(e, f"update_user for {user_key}")

    def patch_user(self, user_key: str, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Patch an existing user account using patch semantics.

        Args:
            user_key (str): The user key (email or unique ID).
            user_data (dict): User data to patch.

        Returns:
            dict: Result of user patch operation.
        """
        try:
            service = self.load_service()
            result = service.users().patch(
                userKey=user_key,
                body=user_data
            ).execute()
            logger.info(f"Successfully patched user: {user_key}")
            return {"message": "User patched successfully.", "user": result}

        except Exception as e:
            return self._handle_error(e, f"patch_user for {user_key}")

    def delete_user(self, user_key: str) -> Dict[str, Any]:
        """
        Delete a user account.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: Result of user deletion operation.
        """
        try:
            service = self.load_service()
            service.users().delete(userKey=user_key).execute()
            logger.info(f"Successfully deleted user: {user_key}")
            return {"message": f"User {user_key} deleted successfully."}

        except Exception as e:
            return self._handle_error(e, f"delete_user for {user_key}")

    def undelete_user(self, user_key: str, org_unit_path: str = '/') -> Dict[str, Any]:
        """
        Undelete a deleted user account.

        Args:
            user_key (str): The user key (email or unique ID).
            org_unit_path (str): The organizational unit to restore the user to.

        Returns:
            dict: Result of user undelete operation.
        """
        try:
            service = self.load_service()
            result = service.users().undelete(
                userKey=user_key,
                body={'orgUnitPath': org_unit_path}
            ).execute()
            logger.info(f"Successfully undeleted user: {user_key}")
            return {"message": f"User {user_key} undeleted successfully.", "user": result}

        except Exception as e:
            return self._handle_error(e, f"undelete_user for {user_key}")

    # ===== USER STATUS AND ADMIN OPERATIONS =====

    def make_admin(self, user_key: str) -> Dict[str, Any]:
        """
        Make a user a super administrator.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: Result of make admin operation.
        """
        try:
            service = self.load_service()
            service.users().makeAdmin(
                userKey=user_key,
                body={'status': True}
            ).execute()
            logger.info(f"Successfully made user admin: {user_key}")
            return {"message": f"User {user_key} is now a super administrator."}

        except Exception as e:
            return self._handle_error(e, f"make_admin for {user_key}")

    def revoke_admin(self, user_key: str) -> Dict[str, Any]:
        """
        Revoke super administrator privileges from a user.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: Result of revoke admin operation.
        """
        try:
            service = self.load_service()
            service.users().makeAdmin(
                userKey=user_key,
                body={'status': False}
            ).execute()
            logger.info(f"Successfully revoked admin from user: {user_key}")
            return {"message": f"Super administrator privileges revoked from {user_key}."}

        except Exception as e:
            return self._handle_error(e, f"revoke_admin for {user_key}")

    def suspend_user(self, user_key: str, reason: str = '') -> Dict[str, Any]:
        """
        Suspend a user account.

        Args:
            user_key (str): The user key (email or unique ID).
            reason (str): Optional reason for suspension.

        Returns:
            dict: Result of user suspension operation.
        """
        body = {'suspended': True}
        if reason:
            body['suspensionReason'] = reason

        return self.update_user(user_key, body)

    def unsuspend_user(self, user_key: str) -> Dict[str, Any]:
        """
        Unsuspend a user account.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: Result of user unsuspension operation.
        """
        return self.update_user(user_key, {'suspended': False})

    def sign_out_user(self, user_key: str) -> Dict[str, Any]:
        """
        Sign a user out of all web and device sessions.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: Result of sign out operation.
        """
        try:
            service = self.load_service()
            service.users().signOut(userKey=user_key).execute()
            logger.info(f"Successfully signed out user: {user_key}")
            return {"message": f"User {user_key} signed out of all sessions."}

        except Exception as e:
            return self._handle_error(e, f"sign_out_user for {user_key}")

    def force_password_change(self, user_key: str) -> Dict[str, Any]:
        """
        Force a user to change password at next login.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: Result of force password change operation.
        """
        return self.update_user(user_key, {'changePasswordAtNextLogin': True})

    # ===== ORGANIZATIONAL UNIT OPERATIONS =====

    def list_organizational_units(self, org_unit_path='/', include_children=True, formatted=False):
        """
        List all organizational units in the domain.

        Args:
            org_unit_path (str): The organizational unit path to list. Defaults to '/' (root).
            include_children (bool): Whether to include child organizational units. Defaults to True.
            formatted (bool): Whether to return formatted JSON string or Python object.

        Returns:
            dict or str: Dictionary containing OU information or formatted JSON string.
        """
        try:
            service = self.load_service()

            # Make the API call to list organizational units
            results = service.orgunits().list(
                customerId='my_customer',
                orgUnitPath=org_unit_path,
                type='all' if include_children else 'children'
            ).execute()

            org_units = results.get('organizationUnits', [])

            if not org_units:
                response = {
                    "message": f"No organizational units found under path: {org_unit_path}",
                    "organizationalUnits": []
                }
            else:
                # Format the response
                response = {
                    "message": f"Successfully retrieved {len(org_units)} organizational units",
                    "organizationalUnits": org_units
                }

            if formatted:
                import json
                return json.dumps(response, indent=4, ensure_ascii=False)

            return response

        except Exception as e:
            return self._handle_error(e, "list_organizational_units")

    def list_users_by_ou(self, org_unit_path='/', max_results=100, formatted=False):
        """
        List users in a specific organizational unit.

        Args:
            org_unit_path (str): The organizational unit path to search. Defaults to '/' (root).
            max_results (int): The maximum number of users to retrieve. Defaults to 100.
            formatted (bool): Whether to return formatted JSON string or Python object.

        Returns:
            dict or str: Dictionary containing user information or formatted JSON string.
        """
        try:
            service = self.load_service()

            # Build the query to filter by organizational unit
            query = f"orgUnitPath='{org_unit_path}'"

            # Make the API call to list users in the specified OU
            results = service.users().list(
                customer='my_customer',
                query=query,
                maxResults=max_results,
                orderBy='email'
            ).execute()

            users = results.get('users', [])

            if not users:
                response = {
                    "message": f"No users found in organizational unit: {org_unit_path}",
                    "users": []
                }
            else:
                response = {
                    "message": f"{len(users)} users retrieved from organizational unit: {org_unit_path}",
                    "users": users
                }

            if formatted:
                import json
                return json.dumps(response, indent=4, ensure_ascii=False)

            return response

        except Exception as e:
            return self._handle_error(e, "list_users_by_ou")

    def list_all_users_with_ou(self, batch_size=500):
        """
        List ALL users in the domain with their organizational units using pagination.
        Args:
            batch_size (int): The number of users to retrieve per API call. Defaults to 500 (max allowed).
        Returns:
            dict: A dictionary with all user information including their organizational units.
        """
        try:
            service = self.load_service()
            all_users = []
            page_token = None
            total_requests = 0

            while True:
                total_requests += 1
                # Build the request parameters
                # request_params = {
                #     'customer': 'my_customer',
                #     'maxResults': batch_size,
                #     'orderBy': 'email',
                #     'projection': 'full',  # Get all user properties including orgUnitPath
                #     'fields': 'users(id,primaryEmail,password,hashFunction,isAdmin,isDelegatedAdmin,agreedToTerms,suspended,changePasswordAtNextLogin,ipWhitelisted,name,kind,etag,emails,externalIds,relations,aliases,isMailboxSetup,customerId,addresses,organizations,lastLoginTime,phones,suspensionReason,thumbnailPhotoUrl,languages,posixAccounts,creationTime,nonEditableAliases,sshPublicKeys,notes,websites,locations,includeInGlobalAddressList,keywords,deletionTime,gender,thumbnailPhotoEtag,ims,customSchemas,isEnrolledIn2Sv,isEnforcedIn2Sv,archived,orgUnitPath,recoveryEmail,recoveryPhone),nextPageToken'  # All available fields
                # }

                request_params = {
                    'customer': 'my_customer',
                    'maxResults': batch_size,
                    'orderBy': 'email',
                    'projection': 'full',  # Get all user properties including orgUnitPath
                    'fields': 'users(id,primaryEmail,name,orgUnitPath,isAdmin,suspended,creationTime,lastLoginTime),nextPageToken'
                }

                if page_token:
                    request_params['pageToken'] = page_token

                # Make the API call
                results = service.users().list(**request_params).execute()
                users = results.get('users', [])

                if users:
                    all_users.extend(users)

                # Check if there are more pages
                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            if not all_users:
                return {"message": "No users found in the domain.", "users": []}
            else:
                # Group users by organizational unit
                users_by_ou = {}
                for user in all_users:
                    ou_path = user.get('orgUnitPath', '/')
                    if ou_path not in users_by_ou:
                        users_by_ou[ou_path] = []
                    users_by_ou[ou_path].append(user)

                return {
                    "message": f"{len(all_users)} users retrieved successfully in {total_requests} API calls.",
                    "users": all_users,
                    "users_by_ou": users_by_ou,
                    "total_users": len(all_users),
                    "api_calls": total_requests
                }

        except Exception as e:
            return self._handle_error(e, "list_all_users_with_ou")

    def move_users_to_ou(self, user_emails, target_ou_path):
        """
        Move multiple users to a specified organizational unit.

        Args:
            user_emails (list): List of user email addresses to move.
            target_ou_path (str): The target organizational unit path.

        Returns:
            dict: A dictionary containing success and failure information.
        """
        if isinstance(user_emails, str):
            user_emails = [user_emails]  # Convert single email to list

        try:
            service = self.load_service()
            results = {
                "success": [],
                "failure": []
            }

            for email in user_emails:
                try:
                    service.users().update(
                        userKey=email,
                        body={"orgUnitPath": target_ou_path}
                    ).execute()

                    results["success"].append({
                        "email": email,
                        "newOrgUnit": target_ou_path
                    })
                    logger.info(f"Moved user {email} to organizational unit {target_ou_path}")

                except Exception as e:
                    results["failure"].append({
                        "email": email,
                        "reason": str(e)
                    })
                    logger.error(f"Failed to move user {email} to {target_ou_path}: {str(e)}")

            return results

        except Exception as e:
            return self._handle_error(e, "move_users_to_ou")

    # ===== USER ALIASES =====

    def add_alias(self, user_key: str, alias_email: str) -> Dict[str, Any]:
        """
        Add an alias to a user account.

        Args:
            user_key (str): The user key (email or unique ID).
            alias_email (str): The alias email to add.

        Returns:
            dict: Result of add alias operation.
        """
        try:
            service = self.load_service()
            result = service.users().aliases().insert(
                userKey=user_key,
                body={'alias': alias_email}
            ).execute()
            logger.info(f"Successfully added alias {alias_email} to user {user_key}")
            return {"message": f"Alias {alias_email} added successfully.", "alias": result}

        except Exception as e:
            return self._handle_error(e, f"add_alias {alias_email} to {user_key}")

    def delete_alias(self, user_key: str, alias_email: str) -> Dict[str, Any]:
        """
        Delete an alias from a user account.

        Args:
            user_key (str): The user key (email or unique ID).
            alias_email (str): The alias email to delete.

        Returns:
            dict: Result of delete alias operation.
        """
        try:
            service = self.load_service()
            service.users().aliases().delete(
                userKey=user_key,
                alias=alias_email
            ).execute()
            logger.info(f"Successfully deleted alias {alias_email} from user {user_key}")
            return {"message": f"Alias {alias_email} deleted successfully."}

        except Exception as e:
            return self._handle_error(e, f"delete_alias {alias_email} from {user_key}")

    def list_aliases(self, user_key: str) -> Dict[str, Any]:
        """
        List all aliases for a user.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: List of user aliases.
        """
        try:
            service = self.load_service()
            result = service.users().aliases().list(userKey=user_key).execute()
            aliases = result.get('aliases', [])
            return {
                "message": f"Retrieved {len(aliases)} aliases for user {user_key}",
                "aliases": aliases
            }

        except Exception as e:
            return self._handle_error(e, f"list_aliases for {user_key}")

    # ===== USER PHOTOS =====

    def get_user_photo(self, user_key: str) -> Dict[str, Any]:
        """
        Get a user's profile photo.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: User photo information.
        """
        try:
            service = self.load_service()
            result = service.users().photos().get(userKey=user_key).execute()
            return {"message": "User photo retrieved successfully.", "photo": result}

        except Exception as e:
            return self._handle_error(e, f"get_user_photo for {user_key}")

    def update_user_photo(self, user_key: str, photo_data: str, mime_type: str = 'image/jpeg') -> Dict[str, Any]:
        """
        Update a user's profile photo.

        Args:
            user_key (str): The user key (email or unique ID).
            photo_data (str): Base64-encoded photo data.
            mime_type (str): MIME type of the photo.

        Returns:
            dict: Result of photo update operation.
        """
        try:
            service = self.load_service()
            result = service.users().photos().update(
                userKey=user_key,
                body={
                    'photoData': photo_data,
                    'mimeType': mime_type
                }
            ).execute()
            logger.info(f"Successfully updated photo for user {user_key}")
            return {"message": "User photo updated successfully.", "photo": result}

        except Exception as e:
            return self._handle_error(e, f"update_user_photo for {user_key}")

    def delete_user_photo(self, user_key: str) -> Dict[str, Any]:
        """
        Delete a user's profile photo.

        Args:
            user_key (str): The user key (email or unique ID).

        Returns:
            dict: Result of photo deletion operation.
        """
        try:
            service = self.load_service()
            service.users().photos().delete(userKey=user_key).execute()
            logger.info(f"Successfully deleted photo for user {user_key}")
            return {"message": f"Photo deleted successfully for user {user_key}."}

        except Exception as e:
            return self._handle_error(e, f"delete_user_photo for {user_key}")

    # ===== ADVANCED SEARCH AND FILTERING =====

    def search_users(self, query: str, max_results: int = 100, order_by: str = 'email') -> Dict[str, Any]:
        """
        Search for users using a query string.

        Args:
            query (str): Search query (e.g., "name:John", "email:*@example.com").
            max_results (int): Maximum number of results to return.
            order_by (str): Field to order results by.

        Returns:
            dict: Search results.
        """
        try:
            service = self.load_service()
            results = service.users().list(
                customer='my_customer',
                query=query,
                maxResults=max_results,
                orderBy=order_by,
                projection='full'
            ).execute()

            users = results.get('users', [])
            return {
                "message": f"Found {len(users)} users matching query: {query}",
                "users": users,
                "query": query
            }

        except Exception as e:
            return self._handle_error(e, f"search_users with query: {query}")

    def list_suspended_users(self, max_results: int = 100) -> Dict[str, Any]:
        """
        List all suspended users in the domain.

        Args:
            max_results (int): Maximum number of results to return.

        Returns:
            dict: List of suspended users.
        """
        return self.search_users("isSuspended=true", max_results)

    def list_admin_users(self, max_results: int = 100) -> Dict[str, Any]:
        """
        List all admin users in the domain.

        Args:
            max_results (int): Maximum number of results to return.

        Returns:
            dict: List of admin users.
        """
        return self.search_users("isAdmin=true", max_results)

    def list_users_by_creation_time(self, start_time: str, end_time: str = None, max_results: int = 100) -> Dict[str, Any]:
        """
        List users created within a specific time range.

        Args:
            start_time (str): Start time in RFC 3339 format (e.g., '2023-01-01T00:00:00Z').
            end_time (str): End time in RFC 3339 format. If None, uses current time.
            max_results (int): Maximum number of results to return.

        Returns:
            dict: List of users created in the time range.
        """
        if end_time:
            query = f"creationTime>={start_time} creationTime<={end_time}"
        else:
            query = f"creationTime>={start_time}"

        return self.search_users(query, max_results)

    def list_users_by_last_login(self, start_time: str, end_time: str = None, max_results: int = 100) -> Dict[str, Any]:
        """
        List users by last login time range.

        Args:
            start_time (str): Start time in RFC 3339 format.
            end_time (str): End time in RFC 3339 format. If None, uses current time.
            max_results (int): Maximum number of results to return.

        Returns:
            dict: List of users with last login in the time range.
        """
        if end_time:
            query = f"lastLoginTime>={start_time} lastLoginTime<={end_time}"
        else:
            query = f"lastLoginTime>={start_time}"

        return self.search_users(query, max_results)

    # ===== BATCH OPERATIONS =====

    def batch_create_users(self, users_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Create multiple users in batch.

        Args:
            users_data (list): List of user data dictionaries.

        Returns:
            dict: Results of batch user creation.
        """
        results = {
            "success": [],
            "failure": []
        }

        for user_data in users_data:
            try:
                result = self.create_user(user_data)
                if "error" in result:
                    results["failure"].append({
                        "user_data": user_data,
                        "error": result["error"]
                    })
                else:
                    results["success"].append({
                        "email": user_data.get('primaryEmail'),
                        "user": result.get("user")
                    })
            except Exception as e:
                results["failure"].append({
                    "user_data": user_data,
                    "error": str(e)
                })

        return {
            "message": f"Batch operation completed. {len(results['success'])} successes, {len(results['failure'])} failures.",
            "results": results
        }

    def batch_update_users(self, updates: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Update multiple users in batch.

        Args:
            updates (list): List of dicts with 'user_key' and 'user_data' keys.

        Returns:
            dict: Results of batch user updates.
        """
        results = {
            "success": [],
            "failure": []
        }

        for update in updates:
            user_key = update.get('user_key')
            user_data = update.get('user_data')

            if not user_key or not user_data:
                results["failure"].append({
                    "update": update,
                    "error": "Missing user_key or user_data"
                })
                continue

            try:
                result = self.update_user(user_key, user_data)
                if "error" in result:
                    results["failure"].append({
                        "user_key": user_key,
                        "error": result["error"]
                    })
                else:
                    results["success"].append({
                        "user_key": user_key,
                        "user": result.get("user")
                    })
            except Exception as e:
                results["failure"].append({
                    "user_key": user_key,
                    "error": str(e)
                })

        return {
            "message": f"Batch operation completed. {len(results['success'])} successes, {len(results['failure'])} failures.",
            "results": results
        }

    def batch_suspend_users(self, user_keys: List[str], reason: str = '') -> Dict[str, Any]:
        """
        Suspend multiple users in batch.

        Args:
            user_keys (list): List of user keys (emails or IDs).
            reason (str): Reason for suspension.

        Returns:
            dict: Results of batch user suspension.
        """
        updates = []
        for user_key in user_keys:
            body = {'suspended': True}
            if reason:
                body['suspensionReason'] = reason
            updates.append({
                'user_key': user_key,
                'user_data': body
            })

        return self.batch_update_users(updates)

    def batch_unsuspend_users(self, user_keys: List[str]) -> Dict[str, Any]:
        """
        Unsuspend multiple users in batch.

        Args:
            user_keys (list): List of user keys (emails or IDs).

        Returns:
            dict: Results of batch user unsuspension.
        """
        updates = []
        for user_key in user_keys:
            updates.append({
                'user_key': user_key,
                'user_data': {'suspended': False}
            })

        return self.batch_update_users(updates)

    # ===== UTILITY AND HELPER METHODS =====

    def watch_users(self, target_url: str, ttl: int = 3600) -> Dict[str, Any]:
        """
        Set up a watch notification for changes in the users list.

        Args:
            target_url (str): URL to receive notifications.
            ttl (int): Time to live for the watch in seconds.

        Returns:
            dict: Watch configuration details.
        """
        try:
            import uuid
            service = self.load_service()

            result = service.users().watch(
                customer='my_customer',
                body={
                    'id': str(uuid.uuid4()),
                    'type': 'web_hook',
                    'address': target_url,
                    'ttl': ttl
                }
            ).execute()

            logger.info(f"Successfully set up watch for users with ID: {result.get('id')}")
            return {"message": "Watch set up successfully.", "watch": result}

        except Exception as e:
            return self._handle_error(e, "watch_users")

    def get_user_count(self) -> Dict[str, Any]:
        """
        Get the total count of users in the domain.

        Returns:
            dict: User count information.
        """
        try:
            service = self.load_service()

            # Use a minimal field set to reduce data transfer
            results = service.users().list(
                customer='my_customer',
                maxResults=1,
                fields='users(id)'
            ).execute()

            # The totalResults field isn't available, so we need to count manually
            # For efficiency, we'll do a quick count by fetching only IDs
            all_users = []
            page_token = None

            while True:
                request_params = {
                    'customer': 'my_customer',
                    'maxResults': 500,
                    'fields': 'users(id),nextPageToken'
                }

                if page_token:
                    request_params['pageToken'] = page_token

                results = service.users().list(**request_params).execute()
                users = results.get('users', [])

                all_users.extend(users)

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            total_count = len(all_users)
            return {
                "message": f"Total user count retrieved successfully.",
                "total_users": total_count
            }

        except Exception as e:
            return self._handle_error(e, "get_user_count")

    def get_domain_info(self) -> Dict[str, Any]:
        """
        Get information about the domain.

        Returns:
            dict: Domain information.
        """
        try:
            service = self.load_service()

            # Get customer info which includes domain information
            result = service.customers().get(customerKey='my_customer').execute()

            return {
                "message": "Domain information retrieved successfully.",
                "domain_info": result
            }

        except Exception as e:
            return self._handle_error(e, "get_domain_info")

    def validate_email_format(self, email: str) -> bool:
        """
        Validate email format.

        Args:
            email (str): Email address to validate.

        Returns:
            bool: True if valid, False otherwise.
        """
        import re
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
        return bool(re.match(pattern, email))

    def generate_user_report(self, include_suspended: bool = True, include_admin: bool = True) -> Dict[str, Any]:
        """
        Generate a comprehensive user report.

        Args:
            include_suspended (bool): Include suspended users in the report.
            include_admin (bool): Include admin status in the report.

        Returns:
            dict: Comprehensive user report.
        """
        try:
            # Get all users
            all_users_result = self.list_all_users()
            if "error" in all_users_result:
                return all_users_result

            users = all_users_result.get('users', [])

            # Analyze user data
            report = {
                "total_users": len(users),
                "active_users": 0,
                "suspended_users": 0,
                "admin_users": 0,
                "users_by_ou": {},
                "creation_stats": {},
                "last_login_stats": {}
            }

            for user in users:
                # Count active/suspended
                if user.get('suspended', False):
                    report["suspended_users"] += 1
                else:
                    report["active_users"] += 1

                # Count admins
                if user.get('isAdmin', False):
                    report["admin_users"] += 1

                # Group by OU
                ou_path = user.get('orgUnitPath', '/')
                if ou_path not in report["users_by_ou"]:
                    report["users_by_ou"][ou_path] = 0
                report["users_by_ou"][ou_path] += 1

                # Creation time analysis
                creation_time = user.get('creationTime', '')
                if creation_time:
                    creation_date = creation_time.split('T')[0]  # Get just the date part
                    creation_year = creation_date.split('-')[0] if creation_date else 'Unknown'
                    if creation_year not in report["creation_stats"]:
                        report["creation_stats"][creation_year] = 0
                    report["creation_stats"][creation_year] += 1

            return {
                "message": "User report generated successfully.",
                "report": report,
                "generated_at": self._get_current_timestamp()
            }

        except Exception as e:
            return self._handle_error(e, "generate_user_report")

    def _get_current_timestamp(self) -> str:
        """
        Get current timestamp in ISO format.

        Returns:
            str: Current timestamp.
        """
        from datetime import datetime
        return datetime.utcnow().isoformat() + 'Z'

    # ===== LEGACY METHOD ALIASES =====
    # Keep existing method names for backward compatibility

    def search_email(self, user_key):
        """Legacy alias for get_user method."""
        return self.get_user(user_key)