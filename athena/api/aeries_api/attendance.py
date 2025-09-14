# athena/api/aeries_api/attendance.py

from typing import Dict, List, Optional, Union
from datetime import datetime, date
from .client import BaseAeriesClient, AeriesResponse
import logging

logger = logging.getLogger(__name__)

class AttendanceClient(BaseAeriesClient):
    """
    Client for Aeries API attendance-related operations.
    """
    
    def get_attendance(self, school_code: str, student_id: Union[str, int] = None,
                      start_date: Union[str, date] = None, end_date: Union[str, date] = None) -> AeriesResponse:
        """
        Retrieve attendance information.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int], optional): Specific student ID
            start_date (Union[str, date], optional): Start date for attendance range
            end_date (Union[str, date], optional): End date for attendance range
            
        Returns:
            AeriesResponse: Response containing attendance data
        """
        if student_id:
            endpoint = f'schools/{school_code}/attendance/{student_id}'
        else:
            endpoint = f'schools/{school_code}/attendance'
        
        params = {}
        if start_date:
            params['startDate'] = start_date.strftime('%Y-%m-%d') if isinstance(start_date, date) else start_date
        if end_date:
            params['endDate'] = end_date.strftime('%Y-%m-%d') if isinstance(end_date, date) else end_date
        
        return self.get(endpoint, params=params if params else None)
    
    def get_daily_attendance(self, school_code: str, attendance_date: Union[str, date]) -> AeriesResponse:
        """
        Retrieve daily attendance for a specific date.
        
        Args:
            school_code (str): The school code
            attendance_date (Union[str, date]): The attendance date
            
        Returns:
            AeriesResponse: Response containing daily attendance data
        """
        date_str = attendance_date.strftime('%Y-%m-%d') if isinstance(attendance_date, date) else attendance_date
        return self.get(f'schools/{school_code}/attendance/daily/{date_str}')
    
    def get_attendance_summary(self, school_code: str, student_id: Union[str, int],
                             school_year: Optional[int] = None) -> AeriesResponse:
        """
        Retrieve attendance summary for a student.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            school_year (int, optional): The school year
            
        Returns:
            AeriesResponse: Response containing attendance summary
        """
        endpoint = f'schools/{school_code}/attendance/{student_id}/summary'
        params = {'schoolYear': school_year} if school_year else None
        return self.get(endpoint, params=params)
    
    def create_attendance(self, school_code: str, attendance_data: Dict) -> AeriesResponse:
        """
        Create an attendance record.
        
        Args:
            school_code (str): The school code
            attendance_data (Dict): Attendance data to create
            
        Returns:
            AeriesResponse: Response from the creation operation
        """
        return self.post(f'schools/{school_code}/attendance', json=attendance_data)
    
    def update_attendance(self, school_code: str, student_id: Union[str, int], 
                         attendance_date: Union[str, date], attendance_data: Dict) -> AeriesResponse:
        """
        Update an attendance record.
        
        Args:
            school_code (str): The school code
            student_id (Union[str, int]): The student ID
            attendance_date (Union[str, date]): The attendance date
            attendance_data (Dict): Attendance data to update
            
        Returns:
            AeriesResponse: Response from the update operation
        """
        date_str = attendance_date.strftime('%Y-%m-%d') if isinstance(attendance_date, date) else attendance_date
        return self.put(f'schools/{school_code}/attendance/{student_id}/{date_str}', json=attendance_data)