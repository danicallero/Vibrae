#!/bin/bash
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
