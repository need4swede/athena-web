# athena/api/aeries_api/grades.py

from typing import Dict, List, Optional, Union
from .client import BaseAeriesClient, AeriesResponse
import logging

logger = logging.getLogger(__name__)

class GradesClient(BaseAeriesClient):
    """
    Client for Aeries API grades and academic-related operations.
    """
    
    def get_grades(self, school_code: str, student_id: Union[str, int],
                  term_code: Optional[str] = None, school_year: Optional[int] = None) -> AeriesResponse:
        """
        Retrieve grades for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            term_code (str, optional): Specific term code
            school_year (int, optional): Specific school year
            
        Returns:
            AeriesResponse: Response containing grades data
        """
        endpoint = f'schools/{school_code}/students/{student_id}/grades'
        params = {}
        if term_code:
            params['termCode'] = term_code
        if school_year:
            params['schoolYear'] = school_year
        
        return self.get(endpoint, params=params if params else None)
    
    def get_gradebook_grades(self, school_code: str, student_id: Union[str, int],
                           section_number: Optional[str] = None) -> AeriesResponse:
        """
        Retrieve gradebook grades for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            section_number (str, optional): Specific section number
            
        Returns:
            AeriesResponse: Response containing gradebook grades
        """
        endpoint = f'schools/{school_code}/students/{student_id}/gradebook'
        params = {'sectionNumber': section_number} if section_number else None
        return self.get(endpoint, params=params)
    
    def get_transcript(self, school_code: str, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve transcript for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing transcript data
        """
        return self.get(f'schools/{school_code}/students/{student_id}/transcript')
    
    def get_gpa(self, school_code: str, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve GPA information for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            
        Returns:
            AeriesResponse: Response containing GPA data
        """
        return self.get(f'schools/{school_code}/students/{student_id}/gpa')
    
    def get_class_schedules(self, school_code: str, student_id: Union[str, int],
                           term_code: Optional[str] = None) -> AeriesResponse:
        """
        Retrieve class schedules for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            term_code (str, optional): Specific term code
            
        Returns:
            AeriesResponse: Response containing schedule data
        """
        endpoint = f'schools/{school_code}/students/{student_id}/schedule'
        params = {'termCode': term_code} if term_code else None
        return self.get(endpoint, params=params)
    
    def get_section_grades(self, school_code: str, section_number: str,
                          term_code: Optional[str] = None) -> AeriesResponse:
        """
        Retrieve grades for all students in a specific section.
        
        Args:
            school_code (str): The school code
            section_number (str): The section number
            term_code (str, optional): Specific term code
            
        Returns:
            AeriesResponse: Response containing section grades
        """
        endpoint = f'schools/{school_code}/sections/{section_number}/grades'
        params = {'termCode': term_code} if term_code else None
        return self.get(endpoint, params=params)
    
    def update_grade(self, school_code: str, student_id: Union[str, int],
                    section_number: str, grade_data: Dict) -> AeriesResponse:
        """
        Update a grade for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            section_number (str): The section number
            grade_data (Dict): Grade data to update
            
        Returns:
            AeriesResponse: Response from the update operation
        """
        return self.put(f'schools/{school_code}/students/{student_id}/grades/{section_number}', 
                       json=grade_data)