#!/usr/bin/env bash
# Helper utilities extracted from vibrae for readability.
# This file is intended to be sourced by the main `vibrae` script.

## COLORS & OUTPUT HELPERS
if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  if [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
    BOLD="$(tput bold)"; RESET="$(tput sgr0)"
    RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"; YELLOW="$(tput setaf 3)"
    BLUE="$(tput setaf 4)"; CYAN="$(tput setaf 6)"; GREY="$(tput setaf 8 2>/dev/null || tput setaf 7)"
  else
    BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; GREY=""; CYAN=""
  fi
else
  BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; GREY=""; CYAN=""
fi

if [ -n "${NO_COLOR-}" ] || [ "${VIBRAE_NO_COLOR-0}" = "1" ]; then
  BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; GREY=""; CYAN=""
fi

STYLE_HEADER="${BOLD}${CYAN}"
STYLE_BANNER="${BOLD}${BLUE}"
ICON_OK="✔"; ICON_WARN="!"; ICON_ERR="✖"

ok(){ printf "%b%s%b %s\n" "$GREEN" "$ICON_OK" "$RESET" "$*"; }
warn(){ printf "%b%s%b %s\n" "$YELLOW" "$ICON_WARN" "$RESET" "$*"; }
err(){ printf "%b%s%b %s\n" "$RED" "$ICON_ERR" "$RESET" "$*" 1>&2; }
hdr(){ printf "%b%s%s%s%b\n" "$STYLE_HEADER" "" "$*" "" "$RESET"; }
line(){ local ch; if [ -n "$GREY" ]; then ch="─"; printf "%b" "$GREY"; else ch="-"; fi; printf '%s\n' "$(printf '%*s' 50 '' | tr ' ' "$ch")"; [ -n "$GREY" ] && printf "%b" "$RESET" || true; }
section(){ echo; hdr "$1"; line; }

banner(){
  local title=" Vibrae — Sound, simplified " utf8=0
  if [ "${VIBRAE_FORCE_ASCII-0}" = "1" ]; then utf8=0; else
    if (locale 2>/dev/null | grep -qi 'UTF-8') || (printf '%s' "${LC_ALL-}${LC_CTYPE-}${LANG-}" | grep -qi 'UTF-8'); then utf8=1; fi
  fi
  local tl tr bl br hl vl
  if [ "$utf8" -eq 1 ]; then hl='═'; vl='║'; tl='╔'; tr='╗'; bl='╚'; br='╝'; else hl='='; vl='|'; tl='+'; tr='+'; bl='+'; br='+'; fi
  local border; border="$(printf '%s' "$(printf '%*s' "$BANNER_WIDTH" '')" | tr ' ' "$hl")"
  printf "%b%s%s%s%b\n" "$STYLE_BANNER" "$tl" "$border" "$tr" "$RESET"
  local pad=$(( (BANNER_WIDTH - ${#title}) / 2 ))
  local pad2=$(( BANNER_WIDTH - pad - ${#title} ))
  printf "%b%s%*s%s%*s%s%b\n" "$STYLE_BANNER" "$vl" "$pad" "" "$title" "$pad2" "" "$vl" "$RESET"
  printf "%b%s%s%s%b\n" "$STYLE_BANNER" "$bl" "$border" "$br" "$RESET"
}

HELP_BANNER_SHOWN=""
help_banner(){ if [ -z "$HELP_BANNER_SHOWN" ]; then banner; HELP_BANNER_SHOWN=1; fi }

license_notice(){ printf "%bVibrae%b (GPLv3, no warranty)\n" "$BOLD" "$RESET"; }
contact_information(){ printf "%bContact%b\n" "$BOLD" "$RESET"; printf "Issues: GitHub repo (./vibrae github). Email: vibrae@danicallero.es\n"; }

colorize_stream(){ if [ -t 1 ]; then awk -v G="$GREEN" -v Y="$YELLOW" -v C="$CYAN" -v R="$RED" -v RST="$RESET" '{ line=$0; gsub(/\[ok\]/,    G "[ok]" RST, line); gsub(/\[warn\]/,  Y "[warn]" RST, line); gsub(/\[info\]/,  C "[info]" RST, line); gsub(/\[error\]/, R "[error]" RST, line); print line; }' ; else cat; fi }

## GENERIC UTILITIES
kv_set(){ local key="$1" val="$2" tmp; ensure_env; tmp="$(mktemp 2>/dev/null || true)"; [ -n "$tmp" ] || tmp="${ENV_FILE}.tmp.$$"; awk -v K="$key" -v V="$val" 'BEGIN{ set=0 } /^[#[:space:]]/ { print; next } $0 ~ "^"K"=" { if(!set){ print K"="V; set=1 } ; next } { print } END{ if(!set) print K"="V }' "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"; }
kv_get(){ local key="$1"; [ -f "$ENV_FILE" ] || return 1; grep -E "^${key}=" "$ENV_FILE" | head -n1 | sed -E "s/^${key}=//"; }

FRONT_ENV_FILE="$ROOT_DIR/config/env/.env.frontend"
FRONT_ENV_EXAMPLE="$ROOT_DIR/config/env/.env.frontend.example"
ensure_front_env(){ mkdir -p "$(dirname "$FRONT_ENV_FILE")" 2>/dev/null || true; if [ ! -f "$FRONT_ENV_FILE" ]; then if [ -f "$FRONT_ENV_EXAMPLE" ]; then cp "$FRONT_ENV_EXAMPLE" "$FRONT_ENV_FILE"; ok "created $(basename "$FRONT_ENV_FILE") from example"; else cat > "$FRONT_ENV_FILE" <<'EOF_FE'
# Vibrae frontend environment (EXPO_PUBLIC_* keys recommended)
EXPO_PUBLIC_API_BASE=/api
EOF_FE
      ok "initialized $(basename "$FRONT_ENV_FILE") with defaults"; fi; fi }

f_kv_set(){ local key="$1" val="$2" tmp; ensure_front_env; tmp="$(mktemp 2>/dev/null || true)"; [ -n "$tmp" ] || tmp="${FRONT_ENV_FILE}.tmp.$$"; awk -v K="$key" -v V="$val" 'BEGIN{ set=0 } /^[#[:space:]]/ { print; next } $0 ~ "^"K"=" { if(!set){ print K"="V; set=1 } ; next } { print } END{ if(!set) print K"="V }' "$FRONT_ENV_FILE" > "$tmp" && mv "$tmp" "$FRONT_ENV_FILE"; }
f_kv_get(){ local key="$1"; [ -f "$FRONT_ENV_FILE" ] || return 1; grep -E "^${key}=" "$FRONT_ENV_FILE" | head -n1 | sed -E "s/^${key}=//"; }

truthy(){ case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in true|1|yes|on) return 0;; *) return 1;; esac }
is_uvicorn_running(){ pgrep -f "uvicorn" >/dev/null 2>&1 || return 1; }

autostart_maybe_start(){ ensure_env; local as; as="$(kv_get AUTOSTART)"; if truthy "$as"; then if is_uvicorn_running; then ok "AUTOSTART on; already running"; else if [ ! -f "$ROOT_DIR/.installed" ] || [ ! -d "$ROOT_DIR/venv" ]; then warn "AUTOSTART on but setup not completed; run scripts/app/setup.sh first"; else warn "AUTOSTART on; starting services"; cmd_start; fi; fi; return 0; fi; return 1; }

ask_yes_no(){ local prompt="$1"; shift || true; local def="${1:-Y}"; local ans; if [ ! -t 0 ]; then return 1; fi; while true; do if [ "$def" = "Y" ]; then read -r -p "$prompt [Y/n]: " ans || return 1; ans="${ans:-Y}"; else read -r -p "$prompt [y/N]: " ans || return 1; ans="${ans:-N}"; fi; case "$(echo "$ans" | tr '[:upper:]' '[:lower:]')" in y|yes) return 0 ;; n|no)  return 1 ;; q|quit|exit) return 130 ;; esac; done; }

run_wizard(){
  banner
  section "Welcome"
  echo "This wizard will help you install Vibrae, set up the environment, initialize the database, and start services."
}

## SOPS helpers
sops_check(){ if ! command -v sops >/dev/null 2>&1; then err "sops not installed (https://github.com/getsops/sops)"; return 1; fi }
sec_dir(){ printf '%s' "$ROOT_DIR/config/env"; }
sec_plain(){ printf '%s' "$(sec_dir)/.env.backend"; }
sec_enc(){ printf '%s' "$(sec_dir)/.env.backend.enc"; }
sec_front_plain(){ printf '%s' "$(sec_dir)/.env.frontend"; }
sec_front_enc(){ printf '%s' "$(sec_dir)/.env.frontend.enc"; }

_sops_run(){ local mode="$1"; shift; local in="$1"; shift; local out="$1"; shift || true; local cmd=(sops); if [ -f "$ROOT_DIR/.sops.yaml" ]; then if [ -z "${SOPS_CONFIG:-}" ]; then cmd+=(--config "$ROOT_DIR/.sops.yaml"); fi; fi; local prev_suppress="${_VIBRAE_SUPPRESS_TRAP:-}"; _VIBRAE_SUPPRESS_TRAP=1; case "$mode" in encrypt) "${cmd[@]}" --encrypt "$in" > "$out" 2>"$out.err" ;; decrypt) "${cmd[@]}" --decrypt "$in" > "$out" 2>"$out.err" ;; *) err "_sops_run: invalid mode '$mode'"; return 1;; esac; local rc=$?; if [ $rc -ne 0 ]; then if grep -qi 'unmarshal' "$out.err" 2>/dev/null; then err "sops parse error (YAML). Likely a broken global ~/.sops.yaml. Try: mv ~/.sops.yaml ~/.sops.yaml.bak && retry, or export SOPS_CONFIG=./.sops.yaml"; else err "sops $mode failed: $(sed -e 's/\r//g' "$out.err" | tail -n3 | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"; fi; rm -f "$out.err" 2>/dev/null || true; return 1; fi; if [ -n "$prev_suppress" ]; then _VIBRAE_SUPPRESS_TRAP="$prev_suppress"; else unset _VIBRAE_SUPPRESS_TRAP; fi; rm -f "$out.err" 2>/dev/null || true; return 0; }

## end helpers

# Developer helper: list all top-level command functions and help functions with file/line
list_commands(){
  # Prints functions named cmd_* and _help_* with their line numbers to help navigate the script
  local script="$SCRIPT_PATH"
  if [ ! -f "$script" ]; then script="$ROOT_DIR/vibrae"; fi
  awk '/^[[:alnum:]_].*\(\)\{/{ print NR ": " $0 }' "$script" | egrep 'cmd_|_help_' || true
}
