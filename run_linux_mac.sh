#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -c "from PIL import Image; from cryptography.fernet import Fernet; import google.auth" >/dev/null 2>&1 || python3 -m pip install -r requirements.txt
python3 server.py
