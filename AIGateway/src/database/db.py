import dotenv
dotenv.load_dotenv()

from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine
from contextlib import asynccontextmanager
from .config import settings

engine = create_async_engine(
    settings.sqlalchemy_database_url,
    connect_args={"server_settings": {"search_path": "verifywise"}},
)

from sqlalchemy.ext.asyncio import async_sessionmaker

Session = async_sessionmaker(engine, expire_on_commit=False)

Base = declarative_base()

@asynccontextmanager
async def get_db():
    async with Session() as session:
        yield session
