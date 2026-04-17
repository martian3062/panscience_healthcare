import time
from collections import defaultdict
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import get_settings

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.requests = defaultdict(list)

    async def dispatch(self, request: Request, call_next):  # pragma: no cover
        settings = get_settings()
        limit = settings.rate_limit_per_minute
        if limit <= 0:
            return await call_next(request)

        forwarded = request.headers.get("X-Forwarded-For")
        identifier = request.headers.get("X-API-Key") or (forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown"))
        
        now = time.time()
        window_start = now - 60.0
        
        # In-memory token bucket/sliding window cleanup
        self.requests[identifier] = [t for t in self.requests[identifier] if t > window_start]

        if len(self.requests[identifier]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too Many Requests"},
                headers={"Retry-After": "60"}
            )
        
        self.requests[identifier].append(now)
        return await call_next(request)
