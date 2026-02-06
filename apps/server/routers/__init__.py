from .pcs import router as pcs_router
from .devices import router as devices_router
from .tasks import router as tasks_router
from .health import router as health_router
from .appium import router as appium_router

__all__ = [
    "pcs_router",
    "devices_router",
    "tasks_router",
    "health_router",
    "appium_router",
]
