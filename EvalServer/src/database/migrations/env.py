from logging.config import fileConfig

import asyncio
from sqlalchemy import pool
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
from database.db import Base
from database.config import settings
config = context.config
config.set_main_option(
    "sqlalchemy.url",
    settings.sqlalchemy_database_url
)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema="verifywise",
        include_schemas=True,
    )

    with context.begin_transaction():
        context.execute("SET search_path TO verifywise")
        context.run_migrations()

def do_run_migrations(connection):
    from sqlalchemy import text
    # Ensure verifywise schema exists (EvalServer may start before main server)
    connection.execute(text("CREATE SCHEMA IF NOT EXISTS verifywise"))
    # Previous EvalServer versions tracked migrations in public.alembic_version.
    # Now we use verifywise.alembic_version (version_table_schema="verifywise").
    # Drop the old one — its composite type conflicts with creating the new one.
    connection.execute(text("DROP TABLE IF EXISTS public.alembic_version CASCADE"))
    connection.commit()

    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema="verifywise",
        include_schemas=True,
    )

    with context.begin_transaction():
        context.execute("SET search_path TO verifywise")
        context.run_migrations()

async def run_async_migrations():
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()

def run_migrations_online():
    """Run migrations in 'online' mode."""
    try:
        asyncio.get_running_loop() # Triggers RuntimeError if no running event loop
        # Create a separate thread so we can block before returning
        with ThreadPoolExecutor(1) as pool:
            pool.submit(lambda: asyncio.run(run_async_migrations()))
    except RuntimeError:
        asyncio.run(run_async_migrations())

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
