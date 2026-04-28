import os
from dataclasses import dataclass
from dotenv import load_dotenv


load_dotenv()


@dataclass
class Config:
    db_url: str = os.getenv("DATABASE_URL", "sqlite:///opus_air.db")
    simulation_tick_seconds: int = int(os.getenv("SIMULATION_TICK_SECONDS", "8"))
    frontend_poll_seconds: int = int(os.getenv("FRONTEND_POLL_SECONDS", "5"))
    gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
    gemini_timeout_seconds: int = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "3"))
    delay_critical_threshold_minutes: int = int(os.getenv("DELAY_CRITICAL_THRESHOLD_MINUTES", "20"))
    min_active_flights: int = int(os.getenv("MIN_ACTIVE_FLIGHTS", "3"))
    max_active_flights: int = int(os.getenv("MAX_ACTIVE_FLIGHTS", "5"))


config = Config()
