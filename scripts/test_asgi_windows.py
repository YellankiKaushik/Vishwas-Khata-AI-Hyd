"""Run in-process ASGI tests on Windows hosts that deny TCP loopback.

The test process uses a threading event for cross-thread wakeups. There is
no socket transport. Select the real-network tests separately on a normal
host. Production and the default pytest invocation use the standard loop.
"""
import asyncio
from threading import Event
import sys

class ThreadWakeSelector:
    def __init__(self):
        self.ready = Event()

    def select(self, timeout):
        self.ready.wait(timeout)
        self.ready.clear()
        return []

class InProcessLoop(asyncio.BaseEventLoop):
    def __init__(self):
        super().__init__()
        self._selector = ThreadWakeSelector()

    def _process_events(self, events):
        pass

    def _write_to_self(self):
        self._selector.ready.set()

class InProcessPolicy(asyncio.DefaultEventLoopPolicy):
    _loop_factory = InProcessLoop

if __name__ == '__main__':
    if sys.platform != 'win32':
        raise SystemExit('Use ordinary pytest on this platform.')
    asyncio.set_event_loop_policy(InProcessPolicy())
    import pytest
    raise SystemExit(pytest.main(sys.argv[1:]))
