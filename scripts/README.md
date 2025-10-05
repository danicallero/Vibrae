# Scripts Directory

This directory contains deployment and lifecycle scripts for Vibrae.

## Directory Structure

```
scripts/
├── app/          # Generic deployment scripts (macOS/Linux/dev)
│   ├── run.sh    # Start services (backend, frontend, nginx, tunnel)
│   ├── stop.sh   # Stop all services
│   └── setup.sh  # Initial setup and configuration
├── pi/           # Raspberry Pi specific scripts (systemd)
│   ├── run.sh    # Start systemd services
│   ├── stop.sh   # Stop systemd services
│   ├── setup.sh  # Install systemd units
│   └── update.sh # Update and restart services
├── cfctl.sh      # Cloudflare tunnel control
└── nginxctl.sh   # Nginx control helper
```

## Usage

### Generic Deployment (macOS/Linux/Dev)

The `scripts/app/` scripts are for development or direct deployment:

```bash
# Initial setup
./scripts/app/setup.sh

# Start services
./scripts/app/run.sh

# Stop services
./scripts/app/stop.sh
```

These scripts:
- Manage services directly (no systemd)
- Start uvicorn, nginx, cloudflared, and frontend server
- Handle log rotation and configuration rendering
- Work on any macOS/Linux system

### Raspberry Pi (Production with systemd)

The `scripts/pi/` scripts manage services via systemd:

```bash
# One-time setup (installs systemd units)
sudo ./scripts/pi/setup.sh

# Start services
sudo ./scripts/pi/run.sh

# Stop services
sudo ./scripts/pi/stop.sh

# Update and restart
sudo ./scripts/pi/update.sh
```

These scripts:
- Install and manage systemd service units
- Enable autostart on boot
- Use system logging (journalctl)
- Require root privileges

## Recommended CLI

Instead of calling scripts directly, use the `vibrae` CLI:

```bash
vibrae start       # Automatically chooses app/run.sh or systemctl
vibrae stop        # Automatically chooses app/stop.sh or systemctl
vibrae systemd install  # Wraps pi/setup.sh
```

The CLI detects your environment and calls the appropriate scripts.
