#!/usr/bin/env python3
"""
Generic Aeries API executor script.

Usage:
  python3 athena/scripts/aeries_execute.py --resource students --method get_student --params '{"student_id": "12345", "school_code": "001"}'

Reads endpoint and API key from environment variables if provided:
  - AERIES_ENDPOINT
  - AERIES_API_KEY

Falls back to config files via AeriesAPI if env vars are not set.
"""

import argparse
import json
import os
import sys
from datetime import datetime

from athena.api.aeries_api.aeries_client import AeriesAPI


def _to_json(obj):
    try:
        return json.dumps(obj, default=str)
    except Exception:
        return json.dumps(str(obj))


def main():
    parser = argparse.ArgumentParser(description="Execute Aeries API method")
    parser.add_argument("--resource", required=True, choices=[
        "client", "aeries", "schools", "students", "enrollment", "attendance", "grades"
    ])
    parser.add_argument("--method", required=True)
    parser.add_argument("--params", required=False, default=None, help="JSON object of parameters")

    args = parser.parse_args()

    endpoint = os.environ.get("AERIES_ENDPOINT")
    api_key = os.environ.get("AERIES_API_KEY")

    try:
        client = AeriesAPI(endpoint=endpoint, api_key=api_key)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Failed to initialize AeriesAPI: {e}",
            "message": "Initialization error"
        }))
        return 1

    # Resolve target object
    resource = args.resource.lower()
    if resource in ("client", "aeries"):
        target = client
    elif resource == "schools":
        target = client.schools
    elif resource == "students":
        target = client.students
    elif resource == "enrollment":
        target = client.enrollment
    elif resource == "attendance":
        target = client.attendance
    elif resource == "grades":
        target = client.grades
    else:
        print(json.dumps({
            "success": False,
            "error": f"Unknown resource: {resource}"
        }))
        return 1

    # Resolve method
    method_name = args.method
    if not hasattr(target, method_name):
        print(json.dumps({
            "success": False,
            "error": f"Method '{method_name}' not found on resource '{resource}'"
        }))
        return 1

    method = getattr(target, method_name)

    # Parse params
    kwargs = {}
    if args.params:
        try:
            kwargs = json.loads(args.params)
            if not isinstance(kwargs, dict):
                raise ValueError("params must be a JSON object")
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": f"Invalid params JSON: {e}"
            }))
            return 1

    # Light normalization for known date/datetime-like keys
    # Allows UI to send ISO strings and we convert to datetime objects when needed
    if isinstance(kwargs, dict):
        # Convert 'since' to datetime if provided as ISO string
        if 'since' in kwargs and isinstance(kwargs['since'], str) and kwargs['since'].strip():
            try:
                kwargs['since'] = datetime.fromisoformat(kwargs['since'])
            except Exception:
                # leave as string if parsing fails; underlying method may handle or error
                pass

    try:
        result = method(**kwargs) if kwargs else method()

        # Normalize AeriesResponse or plain values
        if hasattr(result, "success") and hasattr(result, "__dict__"):
            output = {
                "success": getattr(result, "success", False),
                "data": getattr(result, "data", None),
                "status_code": getattr(result, "status_code", None),
                "message": getattr(result, "message", None),
                "error": getattr(result, "error", None),
            }
        else:
            # For bare booleans or other returns (e.g., test_connection)
            output = {"success": True, "data": result}

        print(_to_json(output))
        return 0

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "message": "Execution error"
        }))
        return 1


if __name__ == "__main__":
    sys.exit(main())
