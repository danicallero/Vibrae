# Vibrae CLI Reference

Quick reference for the Vibrae command-line interface.

## Installation & Setup

```bash
# Install dependencies
./vibrae install

# Create configuration
./vibrae env init
./vibrae env edit

# Initialize database
./vibrae db-init
```

## Service Management

```bash
# Start services
./vibrae start      # Full command
./vibrae up         # Alias

# Stop services
./vibrae stop       # Full command
./vibrae down       # Alias

# Restart services
./vibrae restart

# Check status
./vibrae status     # Full command
./vibrae st         # Alias
```

## Development

```bash
# Run tests
./vibrae test

# View logs
./vibrae logs               # Backend logs (default)
./vibrae logs backend       # Backend logs
./vibrae logs player        # Player logs
./vibrae logs auth          # Auth logs

# Edit config
./vibrae config
```

## Environment Management

### Basic Commands
```bash
# Create config from template
./vibrae env init

# Edit config file
./vibrae env edit

# Show current config
./vibrae env show

# Get specific value
./vibrae env get SECRET_KEY

# Set specific value
./vibrae env set SECRET_KEY "new-secret"

# Ensure config exists (sync)
./vibrae env sync
```

### Encryption (SOPS)
```bash
# Encrypt config for git
./vibrae env encrypt

# Decrypt config
./vibrae env decrypt

# Edit encrypted config directly
./vibrae env edit-sec
```

### Environment Help
```bash
./vibrae env help
```

## Information

```bash
# Show version
./vibrae version
./vibrae --version
./vibrae -v

# Show help
./vibrae help
./vibrae --help
./vibrae -h

# Interactive shell
./vibrae              # No args, opens interactive shell
./vibrae shell        # Explicit shell command
./vibrae sh           # Alias

# Open app in browser
./vibrae open

# Get app URL
./vibrae url
```

## Interactive Shell

Run `./vibrae` with no arguments to enter interactive shell mode:

```bash
./vibrae

# Vibrae Interactive Shell
# Type commands without 'vibrae' prefix. Type 'exit' or Ctrl+D to quit.

vibrae> up           # Same as ./vibrae up
vibrae> st           # Same as ./vibrae st
vibrae> logs backend # Same as ./vibrae logs backend
vibrae> exit
```

### Autostart Feature

Enable automatic service startup when entering shell mode:

**Using the autostart command:**
```bash
# Enable autostart
./vibrae autostart on

# Disable autostart
./vibrae autostart off

# Check status
./vibrae autostart
./vibrae autostart status
```

**Or edit directly in config:**
```bash
# In .env.backend or .env
AUTOSTART=true
```

When enabled, running `./vibrae` will:
1. Automatically start all services
2. Show status
3. Enter interactive shell

```bash
./vibrae

# ℹ AUTOSTART enabled - starting services...
# [service startup logs]
# ✓ Backend:  Running
# ✓ Frontend: Running
# 
# Vibrae Interactive Shell
# vibrae>
```

Benefits:
- Quick project startup
- No need to manually run `up` command
- Convenient for development workflow
- Optional (defaults to `AUTOSTART=false`)

```

## CLI Architecture

The CLI is split into three focused modules:

```
vibrae                      # Main entry point (155 lines)
├── lib/cli-helpers.sh      # Utilities, colors, SOPS (180 lines)
└── lib/env-manager.sh      # Environment management (205 lines)
```

### Helper Functions (lib/cli-helpers.sh)

**Colors**:
- `GREEN`, `RED`, `YELLOW`, `CYAN`, `BLUE`, `BOLD`, `RESET`

**Output**:
- `ok <message>` - Success (green checkmark)
- `err <message>` - Error (red X)
- `warn <message>` - Warning (yellow !)
- `info <message>` - Info (cyan ℹ)
- `header <message>` - Section header (blue bold)

**SOPS**:
- `sops_encrypt <file>` - Encrypt file with SOPS
- `sops_decrypt <file>` - Decrypt file with SOPS
- `sops_edit <file>` - Edit encrypted file

**Utilities**:
- `ensure_venv <path>` - Check/create virtual environment
- `ensure_env_file <env> <example>` - Check config exists
- `is_running <pattern>` - Check if process is running
- `get_pid <pattern>` - Get PID of running process

## Examples

### Typical Workflow
```bash
# 1. First-time setup
./vibrae install
./vibrae env init
./vibrae env set DOMAIN "music.local"
./vibrae db-init

# 2. Daily use
./vibrae up                 # Start
./vibrae st                 # Check status
./vibrae logs               # Monitor

# 3. Before git commit (optional)
./vibrae env encrypt        # Encrypt secrets
```

### Development Workflow
```bash
# Make changes
vim packages/core/src/vibrae_core/routes.py

# Test changes
./vibrae test

# Check logs
./vibrae logs backend

# Restart to apply
./vibrae restart
```

### Configuration Management
```bash
# Quick value changes
./vibrae env get MUSIC_DIR
./vibrae env set MUSIC_DIR "/new/path"

# Full editing
./vibrae env edit

# Encrypted editing
./vibrae env edit-sec
```

## Exit Codes

- `0` - Success
- `1` - Error (command failed)
- `2` - Configuration missing/incomplete

## Environment Variables

The CLI automatically sets:
- `ROOT_DIR` - Project root directory
- Color variables (GREEN, RED, etc.)

## Configuration File

Default location: `config/env/.env.backend`

Template: `config/env/.env.example`

Format: Standard `.env` key-value pairs
```env
DOMAIN=localhost
PORT=8000
MUSIC_DIR=/path/to/music
SECRET_KEY=your-secret-here
```

## SOPS Encryption

Vibrae uses [SOPS](https://github.com/mozilla/sops) for config encryption.

**Setup** (one-time):
```bash
# Install SOPS
brew install sops  # macOS
# or download from GitHub releases

# Install age (encryption tool)
brew install age

# Generate key
age-keygen -o ~/.config/sops/age/keys.txt

# Note your public key
age-keygen -y ~/.config/sops/age/keys.txt
```

**Usage**:
```bash
# Encrypt before committing
./vibrae env encrypt

# Others decrypt after pulling
./vibrae env decrypt

# Or edit encrypted directly
./vibrae env edit-sec
```

## Troubleshooting

### Config not found
```bash
# Create from template
./vibrae env init
```

### SOPS errors
```bash
# Check SOPS installed
which sops

# Check age key exists
ls ~/.config/sops/age/keys.txt

# Decrypt manually
sops -d config/env/.env.backend.enc > config/env/.env.backend
```

### Service won't start
```bash
# Check config
./vibrae env show

# Check logs
./vibrae logs backend

# Check status
./vibrae st
```

### Tests fail
```bash
# Ensure virtual env exists
./vibrae install

# Check Python version
python --version  # Should be 3.9+

# Run tests with verbose output
.venv/bin/pytest -v
```

## Tips

1. **Use aliases**: `up`, `down`, `st` save typing
2. **Check status often**: `./vibrae st` shows what's running
3. **Encrypt before commit**: `./vibrae env encrypt` protects secrets
4. **Watch logs**: `./vibrae logs` monitors activity
5. **Test after changes**: `./vibrae test` catches issues early

## See Also

- [Simplification Summary](SIMPLIFICATION.md) - Architecture changes
- [README.md](../README.md) - Project overview
- [Testing Guide](../tests/README.md) - Test documentation
