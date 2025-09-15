# athena/api/aeries_api/aeries_client.py

import configparser
import os
from typing import Dict, Optional, List, Union
from datetime import datetime, date, timedelta
from .. import _API_Path
from .client import BaseAeriesClient
from .schools import SchoolsClient
from .students import StudentsClient
from .enrollment import EnrollmentClient
from .attendance import AttendanceClient
from .grades import GradesClient

class AeriesAPI:
    """
    Main Aeries API client that provides access to all resource clients.
    """
    
    def __init__(self, endpoint: Optional[str] = None, api_key: Optional[str] = None):
        """
        Initialize the Aeries API client.
        
        Args:
            endpoint (str, optional): API endpoint. If not provided, reads from config.ini
            api_key (str, optional): API key. If not provided, reads from auth.ini
        """
        self.api_directory = _API_Path()
        
        # Read configuration if not provided
        if not endpoint or not api_key:
            config_data = self._read_config()
            endpoint = endpoint or config_data['endpoint']
            api_key = api_key or config_data['api_key']
        
        self.endpoint = endpoint
        self.api_key = api_key
        
        # Initialize resource clients
        self.schools = SchoolsClient(endpoint, api_key)
        
        # Get schools cache for student operations
        schools_cache = self.schools.get_schools_dict()
        
        self.students = StudentsClient(endpoint, api_key, schools_cache)
        self.enrollment = EnrollmentClient(endpoint, api_key)
        self.attendance = AttendanceClient(endpoint, api_key)
        self.grades = GradesClient(endpoint, api_key)
    
    def _load_env_file(self) -> None:
        """
        Best-effort loader for a local .env file to populate os.environ when
        running in environments that don't automatically load it.

        Checks a few common locations and only sets variables that are not
        already present in the environment.
        """
        def parse_and_set(env_path: str) -> None:
            try:
                with open(env_path, 'r') as f:
                    for line in f:
                        s = line.strip()
                        if not s or s.startswith('#'):
                            continue
                        if '=' not in s:
                            continue
                        key, val = s.split('=', 1)
                        key = key.strip()
                        val = val.strip().strip('"\'')
                        if key and key not in os.environ:
                            os.environ[key] = val
            except Exception:
                # Silently ignore .env parsing issues to avoid breaking callers
                pass

        candidates = [
            os.path.join(os.getcwd(), '.env'),
            os.path.join(self.api_directory.root(), '.env'),
            os.path.join(os.path.dirname(self.api_directory.root()), '.env'),
        ]
        for path in candidates:
            if os.path.isfile(path):
                parse_and_set(path)

    def _read_config(self) -> Dict[str, str]:
        """
        Read configuration with the following precedence:
        1) Environment variables (AERIES_ENDPOINT, AERIES_API_KEY), optionally
           populated from a .env file if present
        2) Legacy config files: config.ini (ENDPOINT) and auth.ini (KEY)
        
        Returns:
            Dict[str, str]: Configuration dictionary with endpoint and api_key
        """
        # First, try environment variables (and load from .env if available)
        self._load_env_file()

        env_endpoint = os.environ.get('AERIES_ENDPOINT')
        env_api_key = os.environ.get('AERIES_API_KEY')
        if env_endpoint and env_api_key:
            return {
                'endpoint': env_endpoint,
                'api_key': env_api_key,
            }

        # Fallback: Read endpoint from config.ini
        config = configparser.ConfigParser()
        config_path = os.path.join(self.api_directory.aeries(), 'config.ini')
        config.read(config_path)
        
        if 'Settings' not in config or 'ENDPOINT' not in config['Settings']:
            raise ValueError("Missing ENDPOINT setting in config.ini")
        
        endpoint = config['Settings']['ENDPOINT']
        
        # Read API key from auth.ini
        auth = configparser.ConfigParser()
        auth_path = os.path.join(self.api_directory.aeries(), 'auth.ini')
        auth.read(auth_path)
        
        if 'Credentials' not in auth or 'KEY' not in auth['Credentials']:
            raise ValueError("Missing KEY credential in auth.ini")
        
        api_key = auth['Credentials']['KEY']
        
        return {
            'endpoint': endpoint,
            'api_key': api_key
        }
    
    def test_connection(self) -> bool:
        """
        Test the API connection by making a simple request.
        
        Returns:
            bool: True if connection is successful, False otherwise
        """
        response = self.schools.get_all_schools()
        return response.success
    
    def get_student_data(self, student_id):
        """
        Legacy method for backwards compatibility.
        Search for a student across all schools.
        
        Args:
            student_id: The student ID to search for
            
        Returns:
            Student data if found, None otherwise
        """
        response = self.students.search_student_across_schools(student_id)
        return response.data if response.success else None

    def get_newly_enrolled_students(
        self,
        since: Optional[datetime] = None,
        scope: str = "district",
        days: Optional[int] = None,
    ) -> List[Dict]:
        """
        Find students newly enrolled since a given datetime.

        Args:
            since (datetime): Cutoff datetime. Only records with enter dates on/after this are returned.
            scope (str): "district" for brand-new to district (uses DistrictEnterDate),
                         "school" for new to a school (uses SchoolEnterDate).

        Returns:
            List[Dict]: List of student records matching the criteria.
        """

        # Determine cutoff datetime
        if days is not None:
            cutoff_dt = datetime.now() - timedelta(days=days)
        elif since is not None:
            cutoff_dt = since
        else:
            cutoff_dt = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

        # 1) Get IDs of students with enrollment data changes since the cutoff
        changes = self.enrollment.get_enrollment_data_changes(
            cutoff_dt.year, cutoff_dt.month, cutoff_dt.day, cutoff_dt.hour, cutoff_dt.minute
        )
        if not changes.success or not changes.data:
            return []

        cutoff: date = cutoff_dt.date()

        def _parse_date(value: Optional[Union[str, datetime]]) -> Optional[date]:
            if not value:
                return None
            if isinstance(value, datetime):
                return value.date()
            # Expecting ISO-like strings: YYYY-MM-DDTHH:MM:SS
            try:
                return datetime.fromisoformat(value).date()
            except Exception:
                return None

        newly_enrolled: List[Dict] = []

        for row in changes.data:
            student_id = row.get("StudentID")
            school_code = row.get("SchoolCode")
            if not student_id or not school_code:
                continue

            # 2) Fetch student record to inspect enter dates
            # get_student expects (student_id, school_code)
            sresp = self.students.get_student(student_id, str(school_code))
            if not sresp.success or not sresp.data:
                continue

            # Student endpoint can return an array (common) or a single object
            record: Dict
            if isinstance(sresp.data, list) and sresp.data:
                record = sresp.data[0]
            elif isinstance(sresp.data, dict):
                record = sresp.data
            else:
                continue

            school_enter = _parse_date(record.get("SchoolEnterDate"))
            district_enter = _parse_date(record.get("DistrictEnterDate"))

            if scope == "district":
                if district_enter and district_enter >= cutoff:
                    newly_enrolled.append(record)
            else:  # scope == "school"
                if school_enter and school_enter >= cutoff:
                    newly_enrolled.append(record)

        return newly_enrolled
