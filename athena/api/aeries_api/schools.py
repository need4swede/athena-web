# athena/api/aeries_api/schools.py

from typing import Dict, List, Optional
from .client import BaseAeriesClient, AeriesResponse
import logging

logger = logging.getLogger(__name__)

class SchoolsClient(BaseAeriesClient):
    """
    Client for Aeries API school-related operations.
    """
    
    def get_system_info(self) -> AeriesResponse:
        """
        Retrieve system information including Aeries version, database year, 
        available years, local timezone, and current datetime.
        
        Returns:
            AeriesResponse: Response containing system information
        """
        return self.get('api/v5/systeminfo')
    
    def get_all_schools(self) -> AeriesResponse:
        """
        Retrieve all schools the API key has access to.
        
        Returns:
            AeriesResponse: Response containing schools data
        """
        return self.get('schools')
    
    def get_school(self, school_code: Optional[str] = None) -> AeriesResponse:
        """
        Retrieve information for a specific school or all schools.
        
        Args:
            school_code (str, optional): The school code. If None, returns all schools in district.
            
        Returns:
            AeriesResponse: Response containing school data
        """
        if school_code:
            # Get all schools and filter for the specific school code
            all_schools_response = self.get_all_schools()
            if all_schools_response.success and all_schools_response.data:
                # Convert school_code to string for comparison
                school_code_str = str(school_code)
                for school in all_schools_response.data:
                    if str(school.get('SchoolCode')) == school_code_str:
                        # Return a response with just this school
                        from .client import AeriesResponse
                        return AeriesResponse(
                            success=True,
                            data=school,
                            status_code=all_schools_response.status_code,
                            message=all_schools_response.message
                        )
                # School not found
                from .client import AeriesResponse
                return AeriesResponse(
                    success=False,
                    data=None,
                    status_code=404,
                    message=f"School with code {school_code} not found"
                )
            else:
                return all_schools_response
        else:
            return self.get_all_schools()
    
    def get_schools_dict(self) -> Dict[str, str]:
        """
        Get schools as a dictionary of {school_code: school_name}.
        
        Returns:
            Dict[str, str]: Dictionary mapping school codes to names
        """
        response = self.get_all_schools()
        if response.success and response.data:
            return {str(school['SchoolCode']): school['Name'] for school in response.data}
        return {}
    
    def get_school_years(self, school_code: str) -> AeriesResponse:
        """
        Retrieve available school years for a specific school.
        
        Args:
            school_code (str): The school code
            
        Returns:
            AeriesResponse: Response containing school years data
        """
        return self.get(f'schools/{school_code}/years')
    
    def get_terms(self, school_code: str, school_year: Optional[int] = None) -> AeriesResponse:
        """
        Retrieve terms for a specific school and year.
        
        Args:
            school_code (str): The school code
            school_year (int, optional): The school year
            
        Returns:
            AeriesResponse: Response containing terms data
        """
        endpoint = f'api/v5/schools/{school_code}/terms'
        params = {'schoolYear': school_year} if school_year else None
        return self.get(endpoint, params=params)
    
    def get_grade_levels(self, school_code: str) -> AeriesResponse:
        """
        Retrieve grade levels for a specific school.
        
        Args:
            school_code (str): The school code
            
        Returns:
            AeriesResponse: Response containing grade levels data
        """
        return self.get(f'schools/{school_code}/gradelevels')
    
    def get_school_calendar(self, school_code: str = "0") -> AeriesResponse:
        """
        Retrieve calendar information for a specific school or district.
        
        Args:
            school_code (str): The school code. Use "0" for district-level calendar.
            
        Returns:
            AeriesResponse: Response containing calendar data including holidays and attendance days
        """
        return self.get(f'api/v5/schools/{school_code}/calendar')