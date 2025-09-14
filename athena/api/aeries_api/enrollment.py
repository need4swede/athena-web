# athena/api/aeries_api/enrollment.py

from typing import Dict, List, Optional, Union
from .client import BaseAeriesClient, AeriesResponse
import logging
from datetime import datetime, date, timedelta

logger = logging.getLogger(__name__)

class EnrollmentClient(BaseAeriesClient):
    """
    Client for Aeries API enrollment-related operations.
    """

    def get_enrollment(self, school_code: str, student_id: Union[str, int] = None,
                      school_year: Optional[int] = None) -> AeriesResponse:
        """
        Retrieve enrollment information.

        Args:
            school_code (str): The school code
            student_id (Union[str, int], optional): Specific student ID
            school_year (int, optional): Specific school year

        Returns:
            AeriesResponse: Response containing enrollment data
        """
        if student_id:
            endpoint = f'schools/{school_code}/enrollment/{student_id}'
        else:
            endpoint = f'schools/{school_code}/enrollment'

        params = {'schoolYear': school_year} if school_year else None
        return self.get(endpoint, params=params)

    def get_enrollment_history(self, student_id: Union[str, int]) -> AeriesResponse:
        """
        Retrieve enrollment history for a student across all schools.

        Args:
            student_id (Union[str, int]): The student ID

        Returns:
            AeriesResponse: Response containing enrollment history
        """
        return self.get(f'students/{student_id}/enrollment')

    def get_current_enrollment(self, school_code: str) -> AeriesResponse:
        """
        Retrieve current enrollment for a school.

        Args:
            school_code (str): The school code

        Returns:
            AeriesResponse: Response containing current enrollment data
        """
        return self.get(f'schools/{school_code}/enrollment/current')

    def get_enrollment_by_grade(self, school_code: str, grade_level: Union[str, int]) -> AeriesResponse:
        """
        Retrieve enrollment by grade level.

        Args:
            school_code (str): The school code
            grade_level (Union[str, int]): The grade level

        Returns:
            AeriesResponse: Response containing enrollment data for the grade
        """
        return self.get(f'schools/{school_code}/enrollment/grade/{grade_level}')

    def get_enrollment_data_changes(self, year: int, month: int, day: int,
                                   hour: int = 0, minute: int = 0) -> AeriesResponse:
        """
        Retrieve students with enrollment data changes since the specified date/time.

        Args:
            year (int): Year (e.g., 2024)
            month (int): Month (1-12)
            day (int): Day (1-31)
            hour (int, optional): Hour (0-23). Defaults to 0.
            minute (int, optional): Minute (0-59). Defaults to 0.

        Returns:
            AeriesResponse: Response containing list of students with enrollment changes
        """
        endpoint = f'StudentDataChanges/enrollment/{year}/{month}/{day}/{hour}/{minute}'
        return self.get(endpoint)

    def get_new_students(
        self,
        days: int = 0,
        since: Optional[datetime] = None,
        scope: str = "district",
    ) -> AeriesResponse:
        """
        Get students newly enrolled in the district within the given window.

        Uses the student's `DistrictEnterDate` to determine whether they are
        new to the district. The window is inclusive of today and extends
        back by `days` days. For example:
        - days=0 (default): today only
        - days=1: today and yesterday
        - days=10: today and the previous 10 days

        Args:
            days (int): Number of days to include prior to today. Defaults to 0.
            since (datetime, optional): If provided, overrides `days` and uses this
                as the inclusive cutoff datetime.
            scope (str): "district" (uses DistrictEnterDate) or "school"
                (uses SchoolEnterDate). Defaults to "district".

        Returns:
            AeriesResponse: success flag and list of matching student records.
        """

        try:
            # Compute cutoff
            if since is not None:
                cutoff_dt = since
                cutoff_date = cutoff_dt.date()
            else:
                # Date cutoff at midnight to compare by date (inclusive)
                today = date.today()
                cutoff_date = today - timedelta(days=max(0, int(days)))
                cutoff_dt = datetime.combine(cutoff_date, datetime.min.time())

            # 1) Get recent enrollment-related data changes from Aeries
            changes_resp = self.get_enrollment_data_changes(
                cutoff_dt.year, cutoff_dt.month, cutoff_dt.day, 0, 0
            )
            if not changes_resp.success:
                return changes_resp

            changes = changes_resp.data or []
            if not isinstance(changes, list):
                changes = [changes]

            # Helper to parse ISO-like Aeries date strings to date
            def _parse_date(value: Optional[Union[str, datetime]]) -> Optional[date]:
                if not value:
                    return None
                if isinstance(value, datetime):
                    return value.date()
                try:
                    return datetime.fromisoformat(value).date()
                except Exception:
                    return None

            results = []
            seen_ids = set()

            # 2) For each change, fetch the student record and filter by DistrictEnterDate
            for row in changes:
                student_id = row.get('StudentID') if isinstance(row, dict) else None
                school_code = row.get('SchoolCode') if isinstance(row, dict) else None
                if not student_id or not school_code:
                    continue

                if student_id in seen_ids:
                    continue

                # Fetch the student record at the given school
                sresp = self.get(f"schools/{school_code}/students/{student_id}")
                if not sresp.success or not sresp.data:
                    continue

                # Responses may be a list or a dict
                if isinstance(sresp.data, list) and sresp.data:
                    record = sresp.data[0]
                elif isinstance(sresp.data, dict):
                    record = sresp.data
                else:
                    continue

                if scope == "school":
                    enter_date = _parse_date(record.get('SchoolEnterDate'))
                else:
                    enter_date = _parse_date(record.get('DistrictEnterDate'))

                if enter_date and enter_date >= cutoff_date:
                    results.append(record)
                    seen_ids.add(student_id)

            return AeriesResponse(success=True, data=results, message="New district students fetched")

        except Exception as e:
            logger.exception("Failed to fetch new students")
            return AeriesResponse(success=False, error=str(e), message="Error fetching new students")
