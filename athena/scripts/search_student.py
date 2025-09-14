#!/usr/bin/env python3
"""
Script to search for a student by ID in Google Admin API using Athena.
"""

import sys
import os
import json
import logging

# Add the parent directory to the path so we can import from athena
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Import Athena modules
from athena.api.google_api.directory import Directory

def search_student(student_id):
    """
    Search for a student by ID in Google Admin API.

    Args:
        student_id (str): The student ID to search for.

    Returns:
        dict: A dictionary containing the results or error message.
    """
    try:
        # Initialize the Directory class
        directory = Directory()

        # Search for student by ID
        results = directory.search_student_id(student_id)

        # Return the results
        if results.get('user'):
            return {
                "success": True,
                "message": f"Successfully found student with ID {student_id}",
                "data": results.get('user')
            }
        else:
            return {
                "success": False,
                "message": f"No student found with ID {student_id}",
                "data": None
            }
    except Exception as e:
        logging.exception(f"Error searching for student with ID {student_id}")
        return {
            "success": False,
            "message": f"Error searching for student: {str(e)}",
            "data": None
        }

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(level=logging.INFO)

    # Get student ID from command line arguments
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "message": "Student ID is required",
            "data": None
        }))
        sys.exit(1)

    student_id = sys.argv[1]

    # Search for student
    result = search_student(student_id)

    # Print the result as JSON
    print(json.dumps(result))
