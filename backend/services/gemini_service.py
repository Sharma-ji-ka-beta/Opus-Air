import concurrent.futures
from backend.config import config


def _call_gemini(prompt: str) -> str:
    from google import genai

    client = genai.Client(api_key=config.gemini_api_key)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt
    )
    return (response.text or "").strip()


def ask_gemini(prompt: str) -> str | None:
    if not config.gemini_api_key:
        return None
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_call_gemini, prompt)
            return future.result(timeout=config.gemini_timeout_seconds)
    except Exception:
        return None
