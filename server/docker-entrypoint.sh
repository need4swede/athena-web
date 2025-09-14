#!/bin/sh
set -e

echo "🐍 [DEBUG] Starting docker-entrypoint.sh"
echo "🐍 [DEBUG] Current directory: $(pwd)"
echo "🐍 [DEBUG] Listing /app directory:"
ls -la /app
echo "🐍 [DEBUG] Listing /app/athena directory (if exists):"
if [ -d /app/athena ]; then
    ls -la /app/athena
    echo "🐍 [DEBUG] Listing /app/athena/scripts directory (if exists):"
    if [ -d /app/athena/scripts ]; then
        ls -la /app/athena/scripts
    else
        echo "❌ /app/athena/scripts directory does not exist!"
    fi
else
    echo "❌ /app/athena directory does not exist!"
fi

# Check Python and virtual environment
echo "🐍 [DEBUG] Python version:"
python3 --version
echo "🐍 [DEBUG] Pip version:"
pip3 --version
echo "🐍 [DEBUG] Virtual environment:"
echo "VIRTUAL_ENV=$VIRTUAL_ENV"
echo "PATH=$PATH"

# Ensure virtual environment is activated
if [ -d "/app/venv" ]; then
    echo "🐍 [DEBUG] Activating virtual environment..."
    export VIRTUAL_ENV="/app/venv"
    export PATH="/app/venv/bin:$PATH"
    echo "🐍 [DEBUG] Virtual environment activated"
else
    echo "❌ Virtual environment directory does not exist!"
fi

# Install Python dependencies if requirements.txt exists
if [ -f /app/athena/requirements.txt ]; then
    echo "🐍 [DEBUG] Installing Python dependencies from requirements.txt..."
    cat /app/athena/requirements.txt
    pip3 install --no-cache-dir -r /app/athena/requirements.txt
    echo "🐍 [DEBUG] Python dependencies installed"
    echo "🐍 [DEBUG] Installed packages:"
    pip3 list
else
    echo "❌ Requirements file not found at /app/athena/requirements.txt"
fi

# Check if Python can import the required modules
echo "🐍 [DEBUG] Checking if Python can import required modules..."
python3 -c "
try:
    import sys
    print(f'Python path: {sys.path}')

    import google.auth
    print('✅ Successfully imported google.auth')

    import googleapiclient
    print('✅ Successfully imported googleapiclient')

    import psycopg2
    print('✅ Successfully imported psycopg2')
except ImportError as e:
    print(f'❌ Import error: {e}')
"

# Check Google API credentials
echo "🐍 [DEBUG] Checking Google API credentials..."
echo "🐍 [DEBUG] GOOGLE_APPLICATION_CREDENTIALS: $GOOGLE_APPLICATION_CREDENTIALS"
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    if [ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
        echo "✅ Google API credentials file exists at $GOOGLE_APPLICATION_CREDENTIALS"
    else
        echo "❌ Google API credentials file not found at $GOOGLE_APPLICATION_CREDENTIALS"
    fi
else
    echo "❌ GOOGLE_APPLICATION_CREDENTIALS environment variable not set"
fi

# Check if key.json exists in the expected location
KEY_JSON_PATH="/app/athena/api/google_api/key.json"
if [ -f "$KEY_JSON_PATH" ]; then
    echo "✅ key.json file exists at $KEY_JSON_PATH"
    # Ensure the file is readable
    chmod 644 "$KEY_JSON_PATH" 2>/dev/null || echo "⚠️ Could not change permissions on key.json (this is usually fine)"
    echo "✅ Set permissions on key.json"
else
    echo "❌ key.json file not found at $KEY_JSON_PATH"
fi

# Start the application
echo "🐍 [DEBUG] Starting the application..."
exec "$@"
