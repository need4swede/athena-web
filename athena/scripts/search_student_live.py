#!/usr/bin/env python3
"""
Script to perform live search for students in Google Admin API using Athena.
This script searches for individual students and returns standardized data format.
"""

import sys
import os
import json
import logging
import re

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.directory import Directory

def extract_student_id_from_email(email):
    """
    Extract student ID from email address in format: firstname.studentid@domain

    Args:
        email (str): Email address like 'adam.156798@njesd.net'

    Returns:
        str: Student ID (e.g., '156798') or None if not found
    """
    if not email:
        return None

    # Match pattern: anything.digits@domain
    match = re.match(r'^[^.]+\.(\d+)@', email)
    return match.group(1) if match else None

def search_student_live(query, search_type='auto'):
    """
    Search for students in Google Admin API based on query.

    Args:
        query (str): The search query (student ID or name).
        search_type (str): Type of search - 'student_id', 'name', or 'auto' (default).

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Directory class
        directory = Directory()

        # Determine search type if auto
        if search_type == 'auto':
            # Check if query looks like a student ID (exactly 6 digits)
            if re.match(r'^\d{6}$', query):
                search_type = 'student_id'
            elif len(query.strip()) >= 3 and not re.match(r'^\d+$', query):
                search_type = 'name'
            else:
                return {
                    "success": False,
                    "message": f"Invalid search query: {query}. Student IDs must be exactly 6 digits, names must be at least 3 characters.",
                    "data": []
                }

        students = []

        if search_type == 'student_id':
            # Search by student ID using existing method
            logging.info(f"🔍 Searching for student ID: {query}")
            result = directory.search_student_id(query)

            if result.get('user'):
                user = result['user']
                student_data = format_student_data(user)
                if student_data:
                    students.append(student_data)

        elif search_type == 'name':
            # Search by name using the search_users method
            logging.info(f"🔍 Searching for student name: {query}")

            # Build search query for names - search in name fields
            search_query = f"name:{query}"

            result = directory.search_users(query=search_query, max_results=50)

            if result.get('users'):
                for user in result['users']:
                    student_data = format_student_data(user)
                    if student_data:  # Only include users with valid student IDs
                        students.append(student_data)

        # Return results
        if students:
            return {
                "success": True,
                "message": f"Successfully found {len(students)} student(s) matching query: {query}",
                "data": students,
                "search_type": search_type,
                "query": query
            }
        else:
            return {
                "success": True,
                "message": f"No students found matching query: {query}",
                "data": [],
                "search_type": search_type,
                "query": query
            }

    except Exception as e:
        logging.exception(f"Error searching for students with query: {query}")
        return {
            "success": False,
            "message": f"Error searching for students: {str(e)}",
            "data": [],
            "search_type": search_type if 'search_type' in locals() else 'unknown',
            "query": query
        }

def format_student_data(user):
    """
    Format user data from Google API into standardized student format.

    Args:
        user (dict): User data from Google API

    Returns:
        dict: Formatted student data or None if not a valid student
    """
    try:
        primary_email = user.get('primaryEmail')
        if not primary_email:
            return None

        # Extract student ID from email
        student_id = extract_student_id_from_email(primary_email)
        if not student_id:
            return None  # Only return users with valid student IDs

        first_name = user.get('name', {}).get('givenName', '')
        last_name = user.get('name', {}).get('familyName', '')
        full_name = user.get('name', {}).get('fullName', f"{first_name} {last_name}".strip())

        return {
            "google_id": user.get('id'),
            "primary_email": primary_email,
            "first_name": first_name,
            "last_name": last_name,
            "full_name": full_name,
            "student_id": student_id,
            "org_unit_path": user.get('orgUnitPath', '/'),
            "is_admin": user.get('isAdmin', False),
            "is_suspended": user.get('suspended', False),
            "creation_time": user.get('creationTime'),
            "last_login_time": user.get('lastLoginTime')
        }

    except Exception as e:
        logging.warning(f"⚠️ Failed to format student data for user: {user.get('primaryEmail', 'unknown')}: {str(e)}")
        return None

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    # Get search query from command line arguments
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "message": "Search query is required",
            "data": []
        }))
        sys.exit(1)

    query = sys.argv[1].strip()
    search_type = sys.argv[2] if len(sys.argv) > 2 else 'auto'

    # Validate query
    if not query:
        print(json.dumps({
            "success": False,
            "message": "Search query cannot be empty",
            "data": []
        }))
        sys.exit(1)

    # Search for students
    result = search_student_live(query, search_type)

    # Print the result as JSON
    print(json.dumps(result))
