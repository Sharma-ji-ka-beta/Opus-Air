from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.config import config


Base = declarative_base()
engine = create_engine(config.db_url, connect_args={"check_same_thread": False} if "sqlite" in config.db_url else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
