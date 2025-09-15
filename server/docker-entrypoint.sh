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

# Prepare Google API credentials (prefer env; avoid writing files)
echo "🐍 [DEBUG] Preparing Google API credentials..."
KEY_JSON_PATH="/app/athena/api/google_api/key.json"

# 1) If GOOGLE_SERVICE_ACCOUNT_JSON(_B64) is provided, keep it in env; do not write to disk
if [ -n "$GOOGLE_SERVICE_ACCOUNT_JSON_B64" ]; then
    echo "📄 Decoding GOOGLE_SERVICE_ACCOUNT_JSON_B64 into environment (no file)"
    export GOOGLE_SERVICE_ACCOUNT_JSON="$(python3 - <<'PY'
import os,base64,sys
data=os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON_B64','')
try:
    sys.stdout.write(base64.b64decode(data).decode('utf-8'))
except Exception:
    pass
PY
)"
    unset GOOGLE_SERVICE_ACCOUNT_JSON_B64
fi

# If a JSON string is present, prefer it and avoid GOOGLE_APPLICATION_CREDENTIALS
if [ -n "$GOOGLE_SERVICE_ACCOUNT_JSON" ]; then
    echo "✅ GOOGLE_SERVICE_ACCOUNT_JSON present; using in-memory credentials"
    unset GOOGLE_APPLICATION_CREDENTIALS || true
fi

# Build common extra headers from ACCOUNT_FILE_HEADERS (JSON)
EXTRA_HEADERS_JSON="${ACCOUNT_FILE_HEADERS}"
export EXTRA_HEADERS_JSON

# 2) If GOOGLE_SERVICE_ACCOUNT_FILE is provided
if [ -n "$GOOGLE_SERVICE_ACCOUNT_FILE" ] && [ -z "$GOOGLE_SERVICE_ACCOUNT_JSON" ]; then
    case "$GOOGLE_SERVICE_ACCOUNT_FILE" in
        http://*|https://*)
            echo "🌐 Fetching GOOGLE_SERVICE_ACCOUNT_FILE from URL into environment"
            export GOOGLE_SERVICE_ACCOUNT_JSON="$(python3 - <<'PY'
import json,os
from urllib.request import Request, urlopen
url=os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
headers={'User-Agent':'Mozilla/5.0'}
ref=os.environ.get('FRONTEND_URL')
if ref:
    headers['Referer']=ref
extra=os.environ.get('EXTRA_HEADERS_JSON')
if extra:
    try:
        headers.update(json.loads(extra))
    except Exception:
        pass
req=Request(url, headers=headers)
with urlopen(req, timeout=20) as r:
    data=r.read().decode('utf-8')
    json.loads(data)  # validate JSON
    print(data, end='')
PY
)"
            unset GOOGLE_APPLICATION_CREDENTIALS || true
            ;;
        *)
            if [ -f "$GOOGLE_SERVICE_ACCOUNT_FILE" ]; then
                echo "📄 Reading GOOGLE_SERVICE_ACCOUNT_FILE from local path into environment"
                export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat "$GOOGLE_SERVICE_ACCOUNT_FILE" || true)"
                unset GOOGLE_APPLICATION_CREDENTIALS || true
            fi
            ;;
    esac
fi

# Final diagnostics
if [ -n "$GOOGLE_SERVICE_ACCOUNT_JSON" ]; then
    echo "🐍 [DEBUG] Using GOOGLE_SERVICE_ACCOUNT_JSON (in-memory). No file written."
else
    echo "⚠️ GOOGLE_SERVICE_ACCOUNT_JSON not set; if relying on GOOGLE_APPLICATION_CREDENTIALS, ensure it points to a secret mount (not bind-mounted)."
fi

# 3) Aeries support: fetch account file JSON and export AERIES_ENDPOINT/AERIES_API_KEY when provided
echo "🐍 [DEBUG] Preparing Aeries API credentials..."
if [ -n "$AERIES_ACCOUNT_FILE" ] && [ -z "$AERIES_ACCOUNT_JSON" ]; then
    case "$AERIES_ACCOUNT_FILE" in
        http://*|https://*)
            echo "🌐 Fetching AERIES_ACCOUNT_FILE from URL into environment"
            JSON_DATA="$(python3 - <<'PY'
import json,os
from urllib.request import Request, urlopen
url=os.environ.get('AERIES_ACCOUNT_FILE')
headers={'User-Agent':'Mozilla/5.0'}
ref=os.environ.get('FRONTEND_URL')
if ref:
    headers['Referer']=ref
extra=os.environ.get('EXTRA_HEADERS_JSON')
if extra:
    try:
        headers.update(json.loads(extra))
    except Exception:
        pass
req=Request(url, headers=headers)
with urlopen(req, timeout=20) as r:
    data=r.read().decode('utf-8')
    obj=json.loads(data)  # validate
    print(data, end='')
PY
)"
            export AERIES_ACCOUNT_JSON="$JSON_DATA"
            # Also export convenience vars if present
            AE_EP=$(python3 - <<'PY'
import json,os,sys
obj=json.loads(os.environ.get('AERIES_ACCOUNT_JSON','{}'))
print(obj.get('endpoint') or obj.get('ENDPOINT') or obj.get('url') or obj.get('URL') or '')
PY
)
            AE_KEY=$(python3 - <<'PY'
import json,os,sys
obj=json.loads(os.environ.get('AERIES_ACCOUNT_JSON','{}'))
print(obj.get('api_key') or obj.get('API_KEY') or obj.get('key') or obj.get('KEY') or '')
PY
)
            if [ -n "$AE_EP" ]; then export AERIES_ENDPOINT="$AE_EP"; fi
            if [ -n "$AE_KEY" ]; then export AERIES_API_KEY="$AE_KEY"; fi
            ;;
        *)
            if [ -f "$AERIES_ACCOUNT_FILE" ]; then
                echo "📄 Reading AERIES_ACCOUNT_FILE from local path into environment"
                export AERIES_ACCOUNT_JSON="$(cat "$AERIES_ACCOUNT_FILE" || true)"
                AE_EP=$(python3 - <<'PY'
import json,os
obj=json.loads(os.environ.get('AERIES_ACCOUNT_JSON','{}'))
print(obj.get('endpoint') or obj.get('ENDPOINT') or obj.get('url') or obj.get('URL') or '')
PY
)
                AE_KEY=$(python3 - <<'PY'
import json,os
obj=json.loads(os.environ.get('AERIES_ACCOUNT_JSON','{}'))
print(obj.get('api_key') or obj.get('API_KEY') or obj.get('key') or obj.get('KEY') or '')
PY
)
                if [ -n "$AE_EP" ]; then export AERIES_ENDPOINT="$AE_EP"; fi
                if [ -n "$AE_KEY" ]; then export AERIES_API_KEY="$AE_KEY"; fi
            fi
            ;;
    esac
fi

echo "🐍 [DEBUG] Aeries: AERIES_ENDPOINT=${AERIES_ENDPOINT}"
if [ -n "$AERIES_API_KEY" ]; then echo "🐍 [DEBUG] Aeries: API key loaded"; else echo "⚠️ Aeries API key not set"; fi

# Start the application
echo "🐍 [DEBUG] Starting the application..."
exec "$@"
