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

# Prepare Google API credentials (support new env-based setup)
echo "🐍 [DEBUG] Preparing Google API credentials..."
KEY_JSON_PATH="/app/athena/api/google_api/key.json"

# 1) If GOOGLE_SERVICE_ACCOUNT_JSON(_B64) is provided, write it to key.json
if [ -n "$GOOGLE_SERVICE_ACCOUNT_JSON_B64" ]; then
    echo "📄 Decoding GOOGLE_SERVICE_ACCOUNT_JSON_B64 to $KEY_JSON_PATH"
    mkdir -p "$(dirname "$KEY_JSON_PATH")"
    # Some shells may not have base64; use Python for portability
    python3 - <<PY || true
import os,base64
dest=os.environ.get('KEY_JSON_PATH','/app/athena/api/google_api/key.json')
data=os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON_B64','')
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest,'wb') as f:
    f.write(base64.b64decode(data))
print('Wrote decoded service account JSON to', dest)
PY
    export GOOGLE_APPLICATION_CREDENTIALS="$KEY_JSON_PATH"
elif [ -n "$GOOGLE_SERVICE_ACCOUNT_JSON" ]; then
    echo "📄 Writing GOOGLE_SERVICE_ACCOUNT_JSON to $KEY_JSON_PATH"
    mkdir -p "$(dirname "$KEY_JSON_PATH")"
    printf "%s" "$GOOGLE_SERVICE_ACCOUNT_JSON" > "$KEY_JSON_PATH" || true
    export GOOGLE_APPLICATION_CREDENTIALS="$KEY_JSON_PATH"
fi

# 2) If GOOGLE_SERVICE_ACCOUNT_FILE is provided
if [ -n "$GOOGLE_SERVICE_ACCOUNT_FILE" ] && [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    case "$GOOGLE_SERVICE_ACCOUNT_FILE" in
        http://*|https://*)
            echo "🌐 Fetching GOOGLE_SERVICE_ACCOUNT_FILE from URL"
            python3 - <<PY || true
import json,os
from urllib.request import Request, urlopen
url=os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
dest=os.environ.get('KEY_JSON_PATH','/app/athena/api/google_api/key.json')
os.makedirs(os.path.dirname(dest), exist_ok=True)
headers={'User-Agent':'Mozilla/5.0'}
ref=os.environ.get('FRONTEND_URL')
if ref:
    headers['Referer']=ref
extra=os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE_HEADERS')
if extra:
    try:
        headers.update(json.loads(extra))
    except Exception:
        pass
req=Request(url, headers=headers)
with urlopen(req, timeout=20) as r:
    data=r.read().decode('utf-8')
    json.loads(data)  # validate JSON
    with open(dest,'w',encoding='utf-8') as f:
        f.write(data)
print('Downloaded service account key to', dest)
PY
            if [ -f "$KEY_JSON_PATH" ]; then
                export GOOGLE_APPLICATION_CREDENTIALS="$KEY_JSON_PATH"
            fi
            ;;
        *)
            if [ -f "$GOOGLE_SERVICE_ACCOUNT_FILE" ]; then
                export GOOGLE_APPLICATION_CREDENTIALS="$GOOGLE_SERVICE_ACCOUNT_FILE"
            fi
            ;;
    esac
fi

# Final diagnostics
echo "🐍 [DEBUG] GOOGLE_APPLICATION_CREDENTIALS: $GOOGLE_APPLICATION_CREDENTIALS"
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ] && [ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    echo "✅ Google API credentials file ready at $GOOGLE_APPLICATION_CREDENTIALS"
else
    echo "⚠️ Google API credentials not resolved via env; falling back to legacy key.json if present"
    if [ -f "$KEY_JSON_PATH" ]; then
        echo "✅ Found legacy key.json at $KEY_JSON_PATH"
    else
        echo "⚠️ No legacy key.json at $KEY_JSON_PATH"
    fi
fi

# Start the application
echo "🐍 [DEBUG] Starting the application..."
exec "$@"
