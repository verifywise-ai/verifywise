#!/bin/sh
set -e

echo "Waiting for main server to create required tables..."

DELAY=2
MAX_DELAY=30
ATTEMPT=1

until python -c "
import asyncio, asyncpg, os

async def check():
    conn = await asyncpg.connect(
        host=os.environ['DB_HOST'],
        port=int(os.environ.get('DB_PORT', 5432)),
        user=os.environ['DB_USER'],
        password=os.environ['DB_PASSWORD'],
        database=os.environ['DB_NAME']
    )
    exists = await conn.fetchval(
        \"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='verifywise' AND table_name='organizations')\"
    )
    await conn.close()
    if not exists:
        raise SystemExit(1)

asyncio.run(check())
" 2>/dev/null; do
  echo "Attempt $ATTEMPT: organizations table not ready, retrying in ${DELAY}s..."
  sleep $DELAY
  ATTEMPT=$((ATTEMPT + 1))
  DELAY=$((DELAY * 2))
  if [ $DELAY -gt $MAX_DELAY ]; then
    DELAY=$MAX_DELAY
  fi
done

echo "Tables ready! Running EvalServer migrations..."
alembic upgrade head

echo "Starting EvalServer..."
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
