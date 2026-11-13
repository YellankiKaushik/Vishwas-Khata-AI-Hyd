"""Per-process rate limits for the single-worker local demo."""
from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from .domain import DomainError


class Quota:
    def __init__(self, code, message):
        self.code = code
        self.message = message
        self.events = defaultdict(deque)
        self.lock = Lock()

    def take(self, mid, kind, limit):
        with self.lock:
            now = monotonic()
            events = self.events[(mid, kind)]
            while events and events[0] <= now - 60:
                events.popleft()
            if len(events) >= limit:
                raise DomainError(self.code, self.message, 429)
            events.append(now)
