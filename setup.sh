#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later

# license notice
printf "%sVibrae%s (C) 2025 danicallero\n" "$BOLD" "$RESET"
printf "This is free software released under the GNU GPLv3; you may redistribute it under certain conditions.\n"
printf "There is NO WARRANTY, to the extent permitted by law. See LICENSE for details.\n\n"

set -e
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
if [ ! -f data/garden.db ]; then
	cd backend && python init_db.py
	cd ..
fi
cd front && npm install
cd ..
echo "Setup complete. Run 'npm start' in front/, 'uvicorn' in backend/"
