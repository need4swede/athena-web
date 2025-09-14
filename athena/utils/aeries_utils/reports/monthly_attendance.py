# athena/utils/aeries/reports/monthly_attendance.py

# Standard Imports
import os

# Local Imports
from . import operator

def _process_summary(file_path):
    print(operator.Date.from_filename(file_path))

# Returns the file of the latest report
def _get_latest_file(files):
    latest_file = None
    for file in files:
        if latest_file is None or file > latest_file:
            latest_file = file
    return latest_file

# Goes through all the summary files and performs various operations
def _parse_summary_files(files):
    latest_file = _get_latest_file(files)
    print(latest_file)

# Loads all the reports in a directory
def _load_files(directory):
    # monthly_attendance_summaries = []
    # for file in os.listdir(directory):
    #     if file.startswith("PrintMonthlyAttendanceSummary") and file.endswith(".xlsx"):
    #         monthly_attendance_summaries.append(file)

    # _parse_summary_files(monthly_attendance_summaries)
    pass

def run(dir_path):
    operator.Parse(dir_path)