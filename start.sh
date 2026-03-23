#!/bin/bash
# Start both server and web dev server

echo "Starting EBAM backend..."
cd server
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
SERVER_PID=$!
cd ..

echo "Starting EBAM frontend..."
cd web
npm run dev &
WEB_PID=$!
cd ..

echo ""
echo "  Backend:   http://localhost:8000"
echo "  Frontend:  http://localhost:5173"
echo "  API docs:  http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $SERVER_PID $WEB_PID 2>/dev/null" EXIT
wait
