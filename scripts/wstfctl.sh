#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<EOF
wstfctl - WSTFChain control script v1.0

Usage:
  wstfctl setup                      # Check/install Node, npm, deps
  wstfctl run [options]              # Run services
  wstfctl run --profile local --services accounts,validator,explorer
  wstfctl run --interactive          # Interactive menu

Options for 'run':
  --profile=local|devnet|testnet     # Default: local
  --services=comma,separated,list    # accounts,validator,explorer,p2p,mempool,bridge,indexer
  --non-interactive                  # Fail instead of prompting

Examples:
  wstfctl setup
  wstfctl run --profile local --services accounts,validator,explorer
  wstfctl run --interactive

Bridge Node Examples:
  wstfctl run --profile testnet --services bridge
  wstfctl run --profile local --services accounts,validator,bridge,indexer
EOF
}

command="${1:-help}"
shift || true

# Color output helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
  echo -e "${BLUE}[wstfctl]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[wstfctl]${NC} $1"
}

error() {
  echo -e "${RED}[wstfctl]${NC} $1"
}

success() {
  echo -e "${GREEN}[wstfctl]${NC} $1"
}

# Node.js detection and installation
ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local node_version
    node_version=$(node --version | cut -d'v' -f2)
    local major_version
    major_version=$(echo "$node_version" | cut -d'.' -f1)

    if [ "$major_version" -ge 18 ]; then
      success "Node.js found: v$node_version ✓"
      return 0
    else
      warn "Node.js version $node_version found, but need >=18"
    fi
  else
    error "Node.js not found."
  fi

  if [[ "${NON_INTERACTIVE:-0}" == "1" ]]; then
    error "Non-interactive mode: please install Node.js >= 18 manually."
    exit 1
  fi

  echo "Install Node.js via nvm now? (y/N) "
  read -r ans
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    log "Installing Node.js via nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # shellcheck source=/dev/null
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install --lts
    success "Node.js installed: $(node --version) ✓"
  else
    error "Please install Node.js >= 18 and rerun 'wstfctl setup'."
    exit 1
  fi
}

ensure_npm() {
  if command -v npm >/dev/null 2>&1; then
    success "npm found: $(npm --version) ✓"
    return 0
  fi
  error "npm not found (should come with Node)."
  exit 1
}

# Setup command: install dependencies and build
do_setup() {
  log "Running WSTFChain setup..."
  echo

  ensure_node
  ensure_npm
  echo

  cd "$ROOT_DIR"

  if [ -f package-lock.json ]; then
    log "Installing dependencies via npm ci..."
    npm ci
  else
    log "Installing dependencies via npm install..."
    npm install
  fi
  echo

  log "Building project..."
  npm run build
  echo

  success "🎉 Setup complete! WSTFChain is ready to run."
  echo
  echo "Next steps:"
  echo "  ./scripts/wstfctl.sh run --interactive  # Interactive menu"
  echo "  ./scripts/wstfctl.sh run --profile local --services accounts,validator,explorer  # Local devnet"
}

# Service management
get_service_description() {
  case "$1" in
    accounts)     echo "Account management and key services" ;;
    validator)    echo "Block validation and consensus" ;;
    explorer)     echo "Blockchain explorer and query API" ;;
    mempool)      echo "Transaction pool management" ;;
    p2p)          echo "Peer-to-peer networking" ;;
    bridge)       echo "Cross-chain bridge coordination" ;;
    indexer)      echo "Transaction indexing and search" ;;
    *)            echo "Unknown service" ;;
  esac
}

show_service_menu() {
  echo
  echo "Available services:"
  echo "  1) accounts    - $(get_service_description "accounts")"
  echo "  2) validator   - $(get_service_description "validator")"
  echo "  3) explorer    - $(get_service_description "explorer")"
  echo "  4) mempool     - $(get_service_description "mempool")"
  echo "  5) p2p         - $(get_service_description "p2p")"
  echo "  6) bridge      - $(get_service_description "bridge")"
  echo "  7) indexer     - $(get_service_description "indexer")"
  echo
}

# Run command: interactive + non-interactive
do_run() {
  local profile="local"
  local services=""
  local interactive=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile=*)
        profile="${1#*=}"
        ;;
      --services=*)
        services="${1#*=}"
        ;;
      --interactive)
        interactive=1
        ;;
      --non-interactive)
        export NON_INTERACTIVE=1
        ;;
      *)
        error "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
    shift || true
  done

  ensure_node
  ensure_npm
  cd "$ROOT_DIR"

  if [[ $interactive -eq 1 && -z "$services" ]]; then
    echo
    log "🚀 WSTFChain Interactive Setup"
    echo
    echo "Which environment do you want to run?"
    echo "  1) Local devnet (full stack for development)"
    echo "  2) Testnet follower (explorer + indexer only)"
    echo "  3) Bridge node (bridge coordination only)"
    echo "  4) Custom service selection"
    echo "  5) Quit"
    read -rp "Choice [1-5]: " choice

    case "$choice" in
      1)
        profile="local"
        services="accounts,validator,explorer,mempool,p2p,bridge,indexer"
        log "🔧 Selected: Local devnet with all services"
        ;;
      2)
        profile="testnet"
        services="explorer,indexer"
        log "🌐 Selected: Testnet follower (explorer + indexer)"
        ;;
      3)
        profile="testnet"
        services="bridge"
        log "🌉 Selected: Bridge node only"
        ;;
      4)
        show_service_menu
        echo "Enter service numbers (comma-separated, e.g., 1,2,3): "
        read -r service_nums

        services=""
        IFS=',' read -ra NUMS <<< "$service_nums"
        for num in "${NUMS[@]}"; do
          case "$num" in
            1) services="${services},accounts" ;;
            2) services="${services},validator" ;;
            3) services="${services},explorer" ;;
            4) services="${services},mempool" ;;
            5) services="${services},p2p" ;;
            6) services="${services},bridge" ;;
            7) services="${services},indexer" ;;
          esac
        done
        services="${services#,}" # Remove leading comma

        if [[ -z "$services" ]]; then
          error "No valid services selected"
          exit 1
        fi
        log "🔧 Selected services: $services"
        ;;
      *)
        log "👋 Goodbye!"
        exit 0
        ;;
    esac
    echo
  fi

  if [[ -z "$services" ]]; then
    error "No services specified. Use --services or --interactive."
    echo
    usage
    exit 1
  fi

  log "🚀 Starting WSTFChain services..."
  echo "  Profile:  $profile"
  echo "  Services: $services"
  echo

  # Map profile to CLI flags
  local extra_args=""
  case "$profile" in
    local)
      extra_args="--services=${services} --accounts-port=7001 --validator-port=7002 --explorer-port=7003"
      success "🏠 Starting local devnet on ports 7001-7003"
      ;;
    devnet)
      extra_args="--services=${services} --profile=devnet"
      success "🔶 Connecting to devnet infrastructure"
      ;;
    testnet)
      extra_args="--services=${services} --profile=testnet"
      success "🔵 Connecting to testnet infrastructure"
      ;;
    *)
      error "Unknown profile: $profile"
      exit 1
      ;;
  esac

  echo

  # Check if run command exists
  if [ ! -f "dist/runner/cli.js" ]; then
    warn "Build not found. Running build first..."
    npm run build
    echo
  fi

  log "Executing: node dist/runner/cli.js start $extra_args"
  echo

  # Execute the command
  exec node dist/runner/cli.js start $extra_args
}

# Health check
do_health() {
  log "Checking WSTFChain health..."

  # Check if services are running by testing common ports
  local ports=("7001" "7002" "7003")
  local healthy=0

  for port in "${ports[@]}"; do
    if command -v curl >/dev/null 2>&1; then
      if curl -sf "http://localhost:$port/health" >/dev/null 2>&1; then
        success "Service on port $port: healthy ✓"
        healthy=$((healthy + 1))
      else
        warn "Service on port $port: not responding"
      fi
    elif command -v nc >/dev/null 2>&1; then
      if nc -z localhost "$port" 2>/dev/null; then
        success "Service on port $port: listening ✓"
        healthy=$((healthy + 1))
      else
        warn "Service on port $port: not listening"
      fi
    fi
  done

  if [ $healthy -gt 0 ]; then
    success "WSTFChain is running ($healthy/3 services healthy)"
  else
    warn "WSTFChain does not appear to be running"
    echo "Try: ./scripts/wstfctl.sh run --interactive"
  fi
}

# Command dispatcher
case "$command" in
  setup)
    do_setup "$@"
    ;;
  run)
    do_run "$@"
    ;;
  health)
    do_health "$@"
    ;;
  help|*)
    usage
    ;;
esac