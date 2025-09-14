# Aeries API Client Usage Guide

This guide covers the updated Aeries API client with improved structure, comprehensive endpoint coverage, and better error handling.

## Quick Start

### Legacy Compatibility (Existing Code)

Your existing code will continue to work without changes:

```python
from athena.api import aeries_api

# Test connection
result = aeries_api.sample.test()
print(f"Connected: {result}")

# Get student data (searches across all schools)
student = aeries_api.sample.student("12345")
if student:
    print(f"Student: {student['FirstName']} {student['LastName']}")
```

### New API Structure (Recommended)

The new structure provides organized access to different resource types:

```python
from athena.api.aeries_api import get_client, schools, students, enrollment, attendance, grades

# Get the main client
client = get_client()

# Or use resource clients directly
schools_response = schools.get_all_schools()
student_response = students.search_student_across_schools("12345")
```

## Resource Clients

### Schools Client

```python
from athena.api.aeries_api import schools

# Get all schools
response = schools.get_all_schools()
if response.success:
    for school in response.data:
        print(f"{school['SchoolCode']}: {school['Name']}")

# Get schools as a dictionary
schools_dict = schools.get_schools_dict()
# Returns: {'001': 'Elementary School', '002': 'High School', ...}

# Get specific school
school_response = schools.get_school("001")

# Get school years
years_response = schools.get_school_years("001")

# Get terms for a school
terms_response = schools.get_terms("001", school_year=2024)

# Get grade levels
grades_response = schools.get_grade_levels("001")
```

### Students Client

```python
from athena.api.aeries_api import students

# Get student by ID (optional school)
student_response = students.get_student("12345", school_code="001")

# Search student across all schools (recommended)
student_response = students.search_student_across_schools("12345")
if student_response.success:
    student = student_response.data
    print(f"Found {student['FirstName']} {student['LastName']} at {student['SchoolName']}")

# Get students by grade level
grade_students = students.get_students_by_grade("001", "09")

# Get student contacts
contacts_response = students.get_student_contacts("001", "12345")

# Get student programs
programs_response = students.get_student_programs("001", "12345")

# Get test scores
tests_response = students.get_student_tests("12345")

# Get discipline records
discipline_response = students.get_student_discipline("001", "12345")

# Get fees and fines
fees_response = students.get_student_fees("001", "12345")

# Get student picture
picture_response = students.get_student_picture("001", "12345")

# Get student groups
groups_response = students.get_student_groups("001", "12345")
```

### Enrollment Client

```python
from athena.api.aeries_api import enrollment

# Get enrollment for a specific student
enrollment_response = enrollment.get_enrollment("001", "12345")

# Get enrollment for entire school
school_enrollment = enrollment.get_enrollment("001")

# Get enrollment history for a student
history_response = enrollment.get_enrollment_history("12345")

# Get current enrollment
current_response = enrollment.get_current_enrollment("001")

# Get enrollment by grade
grade_enrollment = enrollment.get_enrollment_by_grade("001", "09")

# Get newly enrolled students (convenience)
# Defaults to "since" = today's midnight, scope="district"
new_today = enrollment.get_new_students()
if new_today.success:
    print(f"Newly enrolled (district) today: {len(new_today.data)}")

### Newly Enrolled Students

```python
from datetime import datetime
from athena.api.aeries_api import get_client

client = get_client()

# Find students brand-new to the district since midnight
since = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
new_district_students = client.get_newly_enrolled_students(since, scope="district")

# Find students newly enrolled at a school (including transfers) since a timestamp
last_run = datetime(2024, 9, 1, 8, 0)
new_school_students = client.get_newly_enrolled_students(last_run, scope="school")

# Look back N days (district)
new_last_7_days = client.get_newly_enrolled_students(days=7)
```

Notes:
- scope "district" filters by `DistrictEnterDate`.
- scope "school" filters by `SchoolEnterDate`.
- Uses the `StudentDataChanges/enrollment/{...}` endpoint for incremental IDs and then fetches student records to evaluate enter dates.

Advanced:
- Look back N days from now: `enrollment.get_new_students(days=7)`
- Specific cutoff: `enrollment.get_new_students(since=datetime(2025, 9, 1, 0, 0))`

### Attendance Client

```python
from athena.api.aeries_api import attendance
from datetime import date

# Get attendance for a student
attendance_response = attendance.get_attendance("001", "12345")

# Get attendance for date range
attendance_range = attendance.get_attendance(
    "001", "12345", 
    start_date=date(2024, 1, 1), 
    end_date=date(2024, 1, 31)
)

# Get daily attendance
daily_response = attendance.get_daily_attendance("001", date(2024, 1, 15))

# Get attendance summary
summary_response = attendance.get_attendance_summary("001", "12345", school_year=2024)
```

### Grades Client

```python
from athena.api.aeries_api import grades

# Get grades for a student
grades_response = grades.get_grades("001", "12345")

# Get grades for specific term
term_grades = grades.get_grades("001", "12345", term_code="T1", school_year=2024)

# Get gradebook grades
gradebook_response = grades.get_gradebook_grades("001", "12345")

# Get transcript
transcript_response = grades.get_transcript("001", "12345")

# Get GPA
gpa_response = grades.get_gpa("001", "12345")

# Get class schedules
schedule_response = grades.get_class_schedules("001", "12345", term_code="T1")

# Get section grades (all students in a class)
section_response = grades.get_section_grades("001", "ENG101-1")
```

## Response Handling

All API calls return an `AeriesResponse` object with standardized structure:

```python
from athena.api.aeries_api import students

response = students.get_student("12345", school_code="001")

# Check if request was successful
if response.success:
    data = response.data
    print(f"Status: {response.status_code}")
    print(f"Message: {response.message}")
    # Use the data...
else:
    print(f"Error: {response.error}")
    print(f"Status: {response.status_code}")
    print(f"Message: {response.message}")
```

### Response Object Properties

- `success` (bool): Whether the request was successful
- `data` (Any): The response data (parsed JSON)
- `status_code` (int): HTTP status code
- `message` (str): Success or error message
- `error` (str): Error details if applicable

## Data Operations

### Creating Students

```python
student_data = {
    "StudentID": "12345",
    "FirstName": "John",
    "LastName": "Doe",
    "Grade": "09",
    # ... other required fields
}

create_response = students.create_student("001", student_data)
```

### Updating Students

```python
update_data = {
    "FirstName": "Jane",
    "LastName": "Smith"
}

update_response = students.update_student("12345", update_data)
```

### Managing Contacts

```python
contact_data = {
    "FirstName": "Parent",
    "LastName": "Name",
    "Relationship": "Father",
    "Phone": "555-1234"
}

# Create contact
create_contact = students.create_contact("12345", contact_data)

# Update contact
update_contact = students.update_contact("12345", sequence_number=1, contact_data=contact_data)
```

### Managing Attendance

```python
attendance_data = {
    "StudentID": "12345",
    "Date": "2024-01-15",
    "AttendanceCode": "P",  # Present
    "Period": 1
}

# Create attendance record
create_attendance = attendance.create_attendance("001", attendance_data)

# Update attendance record
update_attendance = attendance.update_attendance("001", "12345", "2024-01-15", attendance_data)
```

## Error Handling

### Using Try-Catch

```python
from athena.api.aeries_api import students, AeriesAPIError

try:
    response = students.get_student("12345", school_code="001")
    if response.success:
        student = response.data
        print(f"Student: {student['FirstName']}")
    else:
        print(f"Request failed: {response.error}")
        
except AeriesAPIError as e:
    print(f"API Error: {e}")
    print(f"Status Code: {e.status_code}")
    
except Exception as e:
    print(f"Unexpected error: {e}")
```

### Response Status Handling

```python
response = students.get_student("12345", school_code="001")

if response.status_code == 200:
    # Success
    student = response.data
elif response.status_code == 404:
    # Student not found
    print("Student not found")
elif response.status_code == 401:
    # Authentication error
    print("Check API key and permissions")
else:
    # Other error
    print(f"Error {response.status_code}: {response.error}")
```

## Configuration

The API client reads configuration from:

- `athena/api/aeries_api/config.ini` - API endpoint
- `athena/api/aeries_api/auth.ini` - API key

### config.ini
```ini
[Settings]
ENDPOINT = https://your-district.aeries.net/admin/api/v5
```

### auth.ini
```ini
[Credentials]
KEY = your-api-key-here
```

## Migration from Legacy Code

### Before (Legacy)
```python
from athena.api.aeries_api.directory import Sample

client = Sample()
schools = client.get_all_schools()
student = client.get_student_data("12345")
```

### After (New Structure)
```python
from athena.api.aeries_api import schools, students

# Get schools
schools_response = schools.get_all_schools()
schools_dict = schools.get_schools_dict()

# Get student
student_response = students.search_student_across_schools("12345")
student = student_response.data if student_response.success else None
```

## Best Practices

1. **Always check response.success** before using data
2. **Use search_student_across_schools()** instead of iterating manually
3. **Handle 404 errors gracefully** - they're common when students aren't found
4. **Cache school data** if making multiple requests
5. **Use specific endpoints** when you know the school code
6. **Implement retry logic** for network errors
7. **Log API responses** for debugging

## Example: Complete Student Information

```python
from athena.api.aeries_api import students, attendance, grades

def get_complete_student_info(student_id):
    # Get basic student info
    student_response = students.search_student_across_schools(student_id)
    if not student_response.success:
        return None
        
    student = student_response.data
    school_code = student.get('SchoolCode')
    
    # Get additional information
    contacts = students.get_student_contacts(school_code, student_id)
    programs = students.get_student_programs(school_code, student_id)
    current_grades = grades.get_grades(school_code, student_id)
    attendance_summary = attendance.get_attendance_summary(school_code, student_id)
    
    return {
        'student': student,
        'contacts': contacts.data if contacts.success else None,
        'programs': programs.data if programs.success else None,
        'grades': current_grades.data if current_grades.success else None,
        'attendance': attendance_summary.data if attendance_summary.success else None
    }

# Usage
complete_info = get_complete_student_info("12345")
if complete_info:
    print(f"Student: {complete_info['student']['FirstName']} {complete_info['student']['LastName']}")
    print(f"School: {complete_info['student']['SchoolName']}")
```
