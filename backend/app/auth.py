from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader
from app.config import get_settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def verify_api_key(api_key: str = Security(api_key_header)) -> str | None:  # pragma: no cover
    settings = get_settings()
    if not settings.valid_api_keys.strip():
        return None
    
    valid_keys = [k.strip() for k in settings.valid_api_keys.split(",") if k.strip()]
    if not valid_keys:
        return None

    if not api_key or api_key.strip() not in valid_keys:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    return api_key
