# athena/api/aeries_api/client.py

import requests
import logging
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class AeriesResponse:
    """
    Standardized response wrapper for Aeries API calls.
    """
    success: bool
    data: Any = None
    status_code: int = None
    message: str = None
    error: str = None

class AeriesAPIError(Exception):
    """Custom exception for Aeries API errors."""
    def __init__(self, message: str, status_code: int = None, response_text: str = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_text = response_text

class BaseAeriesClient:
    """
    Base client for Aeries API operations.
    Handles authentication, common HTTP operations, and error handling.
    """
    
    def __init__(self, endpoint: str, api_key: str):
        """
        Initialize the base client.
        
        Args:
            endpoint (str): The Aeries API endpoint URL
            api_key (str): The API key for authentication
        """
        self.endpoint = endpoint.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'AERIES-CERT': api_key
        })
        
    def _make_request(self, method: str, url: str, **kwargs) -> AeriesResponse:
        """
        Make an HTTP request with proper error handling.
        
        Args:
            method (str): HTTP method (GET, POST, PUT, DELETE)
            url (str): The URL to request
            **kwargs: Additional arguments to pass to requests
            
        Returns:
            AeriesResponse: Standardized response object
        """
        try:
            response = self.session.request(method, url, **kwargs)
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    return AeriesResponse(
                        success=True,
                        data=data,
                        status_code=response.status_code,
                        message="Request successful"
                    )
                except ValueError:
                    return AeriesResponse(
                        success=True,
                        data=response.text,
                        status_code=response.status_code,
                        message="Request successful (non-JSON response)"
                    )
            elif response.status_code == 404:
                return AeriesResponse(
                    success=False,
                    status_code=response.status_code,
                    message="Resource not found",
                    error="404 Not Found"
                )
            else:
                return AeriesResponse(
                    success=False,
                    status_code=response.status_code,
                    message=f"Request failed with status {response.status_code}",
                    error=response.text
                )
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Request exception: {e}")
            return AeriesResponse(
                success=False,
                message="Network error occurred",
                error=str(e)
            )
    
    def get(self, endpoint: str, params: Dict = None) -> AeriesResponse:
        """Make a GET request."""
        url = f"{self.endpoint}/{endpoint.lstrip('/')}"
        return self._make_request('GET', url, params=params)
    
    def post(self, endpoint: str, data: Dict = None, json: Dict = None) -> AeriesResponse:
        """Make a POST request."""
        url = f"{self.endpoint}/{endpoint.lstrip('/')}"
        return self._make_request('POST', url, data=data, json=json)
    
    def put(self, endpoint: str, data: Dict = None, json: Dict = None) -> AeriesResponse:
        """Make a PUT request."""
        url = f"{self.endpoint}/{endpoint.lstrip('/')}"
        return self._make_request('PUT', url, data=data, json=json)
    
    def delete(self, endpoint: str) -> AeriesResponse:
        """Make a DELETE request."""
        url = f"{self.endpoint}/{endpoint.lstrip('/')}"
        return self._make_request('DELETE', url)