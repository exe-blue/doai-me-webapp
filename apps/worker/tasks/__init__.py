from .device_tasks import (
    scan_devices,
    health_check,
    batch_health_check,
    collect_logs,
    reboot_device,
)

from .install_tasks import (
    install_apk,
    batch_install,
    uninstall_apk,
    check_installed_apps,
    install_all_required,
)

from .youtube_tasks import (
    run_youtube_bot,
    stop_bot,
    push_script,
    get_bot_logs,
    batch_run_bot,
)

__all__ = [
    # Device tasks
    "scan_devices",
    "health_check",
    "batch_health_check",
    "collect_logs",
    "reboot_device",
    # Install tasks
    "install_apk",
    "batch_install",
    "uninstall_apk",
    "check_installed_apps",
    "install_all_required",
    # YouTube tasks
    "run_youtube_bot",
    "stop_bot",
    "push_script",
    "get_bot_logs",
    "batch_run_bot",
]
