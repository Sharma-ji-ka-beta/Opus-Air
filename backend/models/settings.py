from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text
from backend.models.base import Base


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True)
    key = Column(String, nullable=False, unique=True)
    value_json = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
