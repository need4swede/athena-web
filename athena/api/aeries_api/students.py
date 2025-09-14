# athena/api/aeries_api/students.py

from typing import Dict, List, Optional, Union
from .client import BaseAeriesClient, AeriesResponse
import logging

logger = logging.getLogger(__name__)

class StudentsClient(BaseAeriesClient):
    """
    Client for Aeries API student-related operations.
    """
    
    def __init__(self, endpoint: str, api_key: str, schools_cache: Dict[str, str] = None):
        """
        Initialize the students client.
        
        Args:
            endpoint (str): The Aeries API endpoint URL
            api_key (str): The API key for authentication
            schools_cache (Dict[str, str], optional): Cache of school codes to names
        """
        super().__init__(endpoint, api_key)
        self.schools_cache = schools_cache or {}
    
    def get_student(self, student_id: Union[str, int], school_code: Optional[str] = None, include_all: Union[bool, str] = False, include_sections: Optional[List[str]] = None) -> AeriesResponse:
        """
        Retrieve student information by student ID. If school_code is provided, searches
        that specific school. Otherwise, searches across all available schools.
        
        Args:
            student_id (Union[str, int]): The student ID
            school_code (str, optional): The school code. If None, searches all schools.
            include_all (bool | str, optional): If truthy, also fetch and include
                student-specific related data (contacts, programs, tests, discipline,
                fees, picture, groups) and return a combined JSON object.
            
        Returns:
            AeriesResponse: Response containing student data
        """
        # Allow truthy strings like "1", "true", "yes"
        def _is_truthy(v: Union[bool, str, None]) -> bool:
            if isinstance(v, bool):
                return v
            if isinstance(v, str):
                return v.strip().lower() in {"1", "true", "yes", "y", "on"}
            return False

        # If not including extra data and no explicit sections requested, preserve existing behavior
        if not _is_truthy(include_all) and not (include_sections and len(include_sections) > 0):
            if school_code:
                return self.get(f'schools/{school_code}/students/{student_id}')
            else:
                return self.search_student_across_schools(student_id)

        # include_all or include_sections: fetch base student first (by school if provided, otherwise across schools)
        if school_code:
            base_resp = self.get(f'schools/{school_code}/students/{student_id}')
        else:
            base_resp = self.search_student_across_schools(student_id)

        if not base_resp.success or not base_resp.data:
            return base_resp

        # Normalize base student record to a dict
        if isinstance(base_resp.data, list) and len(base_resp.data) > 0:
            student_data = base_resp.data[0]
        elif isinstance(base_resp.data, dict):
            student_data = base_resp.data
        else:
            return AeriesResponse(success=False, error="Malformed student data", message="Unexpected student response shape")

        # Determine school_code for related endpoints
        scode = str(school_code or student_data.get('SchoolCode') or student_data.get('School', ''))
        if not scode:
            # If we still cannot resolve a school code, return base only
            return AeriesResponse(success=True, data={"student": student_data}, message="School code not found; returning base student only")

        # Determine which related sections to include
        requested_sections = set()
        if include_sections and isinstance(include_sections, list):
            requested_sections = {str(s).strip().lower() for s in include_sections if str(s).strip()}
        elif _is_truthy(include_all):
            requested_sections = {"contacts", "programs", "tests", "discipline", "fees", "picture", "groups"}

        # Fetch related resources, tolerating failures per section
        combined: Dict[str, Union[Dict, List, None]] = {"student": student_data}
        if "contacts" in requested_sections:
            try:
                c = self.get_student_contacts(scode, student_id)
                combined["contacts"] = c.data if c.success else None
            except Exception:
                logger.exception("Failed to fetch student contacts")
                combined["contacts"] = None
        if "programs" in requested_sections:
            try:
                p = self.get_student_programs(scode, student_id)
                combined["programs"] = p.data if p.success else None
            except Exception:
                logger.exception("Failed to fetch student programs")
                combined["programs"] = None
        if "tests" in requested_sections:
            try:
                t = self.get_student_tests(student_id)
                combined["tests"] = t.data if t.success else None
            except Exception:
                logger.exception("Failed to fetch student tests")
                combined["tests"] = None
        if "discipline" in requested_sections:
            try:
                d = self.get_student_discipline(scode, student_id)
                combined["discipline"] = d.data if d.success else None
            except Exception:
                logger.exception("Failed to fetch student discipline")
                combined["discipline"] = None
        if "fees" in requested_sections:
            try:
                f = self.get_student_fees(scode, student_id)
                combined["fees"] = f.data if f.success else None
            except Exception:
                logger.exception("Failed to fetch student fees")
                combined["fees"] = None
        if "picture" in requested_sections:
            try:
                pic = self.get_student_picture(scode, student_id)
                combined["picture"] = pic.data if pic.success else None
            except Exception:
                logger.exception("Failed to fetch student picture")
                combined["picture"] = None
        if "groups" in requested_sections:
            try:
                g = self.get_student_groups(scode, student_id)
                combined["groups"] = g.data if g.success else None
            except Exception:
                logger.exception("Failed to fetch student groups")
                combined["groups"] = None

        return AeriesResponse(success=True, data=combined, message="Student with related data")
    
    def search_student_across_schools(self, student_id: Union[str, int]) -> AeriesResponse:
        """
        Search for a student across all accessible schools.
        
        Args:
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing student data with school name added
        """
        for school_code, school_name in self.schools_cache.items():
            # Correct argument order: student_id first, then school_code
            response = self.get_student(student_id, school_code)
            
            if response.success and response.data:
                # Handle both list and dict responses
                if isinstance(response.data, list) and len(response.data) > 0:
                    student_data = response.data[0]
                elif isinstance(response.data, dict):
                    student_data = response.data
                else:
                    continue
                
                # Add school name to student data
                student_data['SchoolName'] = school_name
                response.data = student_data
                return response
        
        return AeriesResponse(
            success=False,
            message=f"Student ID {student_id} not found in any accessible schools",
            error="Student not found"
        )
    
    def get_students_by_grade(self, school_code: str, grade_level: Union[str, int]) -> AeriesResponse:
        """
        Retrieve students by grade level in a specific school.
        
        Args:
            school_code (str): The school code
            grade_level (Union[str, int]): The grade level
            
        Returns:
            AeriesResponse: Response containing students data
        """
        return self.get(f'schools/{school_code}/students/grade/{grade_level}')
    
    def get_student_contacts(self, school_code: str, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve contact information for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing contact data
        """
        return self.get(f'schools/{school_code}/contacts/{student_id}')
    
    def get_student_programs(self, school_code: str, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve program information for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing programs data
        """
        return self.get(f'schools/{school_code}/students/{student_id}/programs')
    
    def get_student_tests(self, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve test scores for a student.
        
        Args:
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing test scores data
        """
        return self.get(f'students/{student_id}/tests')
    
    def get_student_discipline(self, school_code: str, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve discipline records for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing discipline data
        """
        return self.get(f'schools/{school_code}/Discipline/{student_id}')
    
    def get_student_fees(self, school_code: str, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve fees and fines for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing fees data
        """
        return self.get(f'schools/{school_code}/fees/{student_id}')
    
    def get_student_picture(self, school_code: str, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve student picture.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing picture data
        """
        return self.get(f'schools/{school_code}/StudentPictures/{student_id}')
    
    def get_student_groups(self, school_code: str, student_id: Union[str, int] = None) -> AeriesResponse:
        """
        Retrieve student groups. If student_id is provided, gets groups for that student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int], optional): The student ID
            
        Returns:
            AeriesResponse: Response containing student groups data
        """
        endpoint = f'schools/{school_code}/StudentGroups'
        if student_id:
            endpoint += f'/{student_id}'
        return self.get(endpoint)
    
    def create_student(self, school_code: str, student_data: Dict) -> AeriesResponse:
        """
        Create a new student record.
        
        Args:
            school_code (str): The school code
            student_data (Dict): Student data to create
            
        Returns:
            AeriesResponse: Response from the creation operation
        """
        return self.post(f'schools/{school_code}/InsertStudent', json=student_data)
    
    def update_student(self, student_id: Union[str, int], student_data: Dict) -> AeriesResponse:
        """
        Update an existing student record.
        
        Args:
            student_id (Union[str, int]): The student ID
            student_data (Dict): Student data to update
            
        Returns:
            AeriesResponse: Response from the update operation
        """
        return self.post(f'UpdateStudent/{student_id}', json=student_data)
    
    def create_contact(self, student_id: Union[str, int], contact_data: Dict) -> AeriesResponse:
        """
        Create a new contact for a student.
        
        Args:
            student_id (Union[str, int]): The student ID
            contact_data (Dict): Contact data to create
            
        Returns:
            AeriesResponse: Response from the creation operation
        """
        return self.post(f'InsertContact/{student_id}', json=contact_data)
    
    def update_contact(self, student_id: Union[str, int], sequence_number: int, contact_data: Dict) -> AeriesResponse:
        """
        Update an existing contact for a student.
        
        Args:
            student_id (Union[str, int]): The student ID
            sequence_number (int): The contact sequence number
            contact_data (Dict): Contact data to update
            
        Returns:
            AeriesResponse: Response from the update operation
        """
        return self.post(f'UpdateContact/{student_id}/{sequence_number}', json=contact_data)
