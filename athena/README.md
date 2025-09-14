# Athena Google API Integration

This directory contains the Python scripts and configuration files needed to integrate the Chromebook Library Nexus application with Google Admin API using the Athena tool.

## Setup Instructions

### 1. Google API Credentials

Make sure you have the Google API credentials file (`key.json`) in the `athena/api/google_api/` directory. This file is required for authentication with the Google Admin API.

### 2. Configuration Files

Ensure the following configuration files are properly set up:

- `athena/api/google_api/auth.ini`: Authentication configuration
- `athena/api/google_api/config.ini`: General configuration including admin email and API scopes

### 3. Docker Setup

The Docker configuration has been updated to include Python and the necessary dependencies. The `athena` directory is mounted to the backend container, allowing it to access the Python scripts and configuration files.

## Available Scripts

The following Python scripts are available in the `athena/scripts/` directory:

- `get_chromebooks.py`: Fetches all Chromebook devices from Google Admin API
- `get_org_units.py`: Fetches organizational units from Google Admin API
- `get_users.py`: Fetches users from Google Admin API
- `search_student.py`: Searches for a student by ID in Google Admin API
- `sync_chromebooks.py`: Syncs Chromebook data from Google Admin API to the local database

## API Endpoints

The following API endpoints are available for interacting with the Google Admin API:

- `GET /api/google/chromebooks`: Fetches all Chromebook devices
- `GET /api/google/org-units`: Fetches organizational units
- `GET /api/google/users`: Fetches users
- `GET /api/google/users/search/:studentId`: Searches for a student by ID
- `POST /api/google/sync/chromebooks`: Syncs Chromebook data to the local database

## Frontend Integration

The frontend has been updated to include a toggle for switching between the local database and Google Admin API data. Admin users can click the "Use Google Data" button on the Chromebooks page to fetch data directly from Google Admin API.

## Troubleshooting

If you encounter issues with the Google API integration, check the following:

1. Make sure the `key.json` file is present in the `athena/api/google_api/` directory
2. Check the configuration files (`auth.ini` and `config.ini`) for correct settings
3. Ensure the Docker container has access to the `athena` directory
4. Check the server logs for any Python-related errors
5. Verify that Python and the required dependencies are installed in the Docker container
