# athena/api/aeries_api/__init__.py

from .aeries_client import AeriesAPI
from .client import AeriesResponse, AeriesAPIError

# Create the main API instance
_aeries_api = AeriesAPI()

# Legacy compatibility classes and functions
class sample:
    """
    Legacy compatibility class for existing code.
    """
    
    @staticmethod
    def test():
        """Test the API connection."""
        return _aeries_api.test_connection()
    
    @staticmethod
    def student(student_id):
        """Get student data - legacy method."""
        return _aeries_api.get_student_data(student_id)

# Modern API access
def get_client() -> AeriesAPI:
    """
    Get the main Aeries API client.
    
    Returns:
        AeriesAPI: The main API client instance
    """
    return _aeries_api

# Direct access to resource clients
schools = _aeries_api.schools
students = _aeries_api.students
enrollment = _aeries_api.enrollment
attendance = _aeries_api.attendance
grades = _aeries_api.grades

# Export main classes for direct import
__all__ = [
    'AeriesAPI',
    'AeriesResponse', 
    'AeriesAPIError',
    'sample',  # Legacy compatibility
    'get_client',
    'schools',
    'students', 
    'enrollment',
    'attendance',
    'grades'
]