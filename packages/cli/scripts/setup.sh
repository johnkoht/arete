#!/bin/bash

# Areté Setup Script
# Checks, installs, and configures the workspace environment
#
# Usage:
#   ./setup.sh           Check status of all dependencies
#   ./setup.sh install   Install missing dependencies
#   ./setup.sh init      Initialize workspace (credentials, directories)
#   ./setup.sh all       Run full setup (install + init)

# Don't exit on error - we handle errors ourselves
set +e

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
REQUIRED_MISSING=0
OPTIONAL_MISSING=0
INSTALLED_COUNT=0

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_header() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_section() {
    echo -e "${BOLD}$1${NC}"
    echo "──────────────────────────────────────────────────────────"
}

# Check if command exists and optionally install it
# Usage: check_command "cmd" "Name" "required|optional" "install_cmd" "purpose" [install_mode]
check_command() {
    local cmd=$1
    local name=$2
    local required=$3
    local install_cmd=$4
    local purpose=$5
    local install_mode=${6:-false}
    
    if command -v "$cmd" &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $name"
        return 0
    else
        if [ "$install_mode" = "true" ] && [ -n "$install_cmd" ]; then
            echo -e "  ${BLUE}↓${NC} Installing $name..."
            if eval "$install_cmd" &> /dev/null; then
                echo -e "  ${GREEN}✓${NC} $name ${GREEN}(installed)${NC}"
                INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
                return 0
            else
                echo -e "  ${RED}✗${NC} $name ${RED}(install failed)${NC}"
                echo -e "      Try manually: ${BLUE}$install_cmd${NC}"
            fi
        else
            if [ "$required" = "required" ]; then
                echo -e "  ${RED}✗${NC} $name ${RED}(required)${NC}"
                echo -e "      Install: ${BLUE}$install_cmd${NC}"
                echo -e "      Purpose: $purpose"
                REQUIRED_MISSING=$((REQUIRED_MISSING + 1))
            else
                echo -e "  ${YELLOW}○${NC} $name ${YELLOW}(optional)${NC}"
                echo -e "      Install: ${BLUE}$install_cmd${NC}"
                echo -e "      Purpose: $purpose"
                OPTIONAL_MISSING=$((OPTIONAL_MISSING + 1))
            fi
        fi
        return 1
    fi
}

# Check if Python package is installed
# Usage: check_python_package "package" "import_name" "purpose" [install_mode]
check_python_package() {
    local package=$1
    local import_name=$2
    local purpose=$3
    local install_mode=${4:-false}
    
    if ! command -v python3 &> /dev/null; then
        echo -e "  ${YELLOW}○${NC} $package - install Python first"
        return 1
    fi
    
    if python3 -c "import $import_name" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $package"
        return 0
    else
        if [ "$install_mode" = "true" ]; then
            echo -e "  ${BLUE}↓${NC} Installing $package..."
            if pip3 install --user "$package" 2>/dev/null || pip3 install "$package" --break-system-packages 2>/dev/null; then
                echo -e "  ${GREEN}✓${NC} $package ${GREEN}(installed)${NC}"
                INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
                return 0
            else
                echo -e "  ${RED}✗${NC} $package ${RED}(install failed)${NC}"
                echo -e "      Try: ${BLUE}pip3 install --user $package${NC}"
            fi
        else
            echo -e "  ${YELLOW}○${NC} $package ${YELLOW}(optional)${NC}"
            echo -e "      Install: ${BLUE}pip3 install $package${NC}"
            echo -e "      Purpose: $purpose"
            OPTIONAL_MISSING=$((OPTIONAL_MISSING + 1))
        fi
        return 1
    fi
}

# Check if file exists and optionally create it
# Usage: check_file "path" "name" "required|optional" "create_cmd" [install_mode]
check_file() {
    local file=$1
    local name=$2
    local required=$3
    local create_cmd=$4
    local install_mode=${5:-false}
    
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $name"
        return 0
    else
        if [ "$install_mode" = "true" ] && [ -n "$create_cmd" ]; then
            echo -e "  ${BLUE}↓${NC} Creating $name..."
            if eval "$create_cmd" 2>/dev/null; then
                echo -e "  ${GREEN}✓${NC} $name ${GREEN}(created)${NC}"
                INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
                return 0
            else
                echo -e "  ${RED}✗${NC} $name ${RED}(create failed)${NC}"
            fi
        else
            if [ "$required" = "required" ]; then
                echo -e "  ${RED}✗${NC} $name ${RED}(required)${NC}"
                echo -e "      Create: ${BLUE}$create_cmd${NC}"
                REQUIRED_MISSING=$((REQUIRED_MISSING + 1))
            else
                echo -e "  ${YELLOW}○${NC} $name ${YELLOW}(optional)${NC}"
                echo -e "      Create: ${BLUE}$create_cmd${NC}"
                OPTIONAL_MISSING=$((OPTIONAL_MISSING + 1))
            fi
        fi
        return 1
    fi
}

# ============================================================================
# CHECK/INSTALL FUNCTIONS
# ============================================================================

check_core_tools() {
    local install_mode=${1:-false}
    
    print_section "Core Tools"
    check_command "git" "Git" "required" "xcode-select --install" "Version control" "$install_mode"
    check_command "brew" "Homebrew" "required" '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' "Package manager" "$install_mode"
    echo ""
}

check_python_env() {
    local install_mode=${1:-false}
    
    print_section "Python Environment"
    check_command "python3" "Python 3" "required" "brew install python" "Run integration scripts" "$install_mode"
    check_python_package "requests" "requests" "HTTP requests for Fathom API" "$install_mode"
    check_python_package "pyyaml" "yaml" "YAML config parsing" "$install_mode"
    echo ""
}

check_search_tools() {
    local install_mode=${1:-false}
    
    print_section "Search & Productivity"
    check_command "qmd" "QMD" "optional" "brew install qmd" "Query markdown files" "$install_mode"
    check_command "rg" "ripgrep" "optional" "brew install ripgrep" "Fast file search" "$install_mode"
    check_command "jq" "jq" "optional" "brew install jq" "JSON processing" "$install_mode"
    check_command "yq" "yq" "optional" "brew install yq" "YAML processing" "$install_mode"
    echo ""
}

check_credentials() {
    local install_mode=${1:-false}
    
    print_section "Credentials"
    check_file "$WORKSPACE_DIR/.credentials/credentials.yaml" "credentials.yaml" "optional" \
        "cp '$WORKSPACE_DIR/.credentials/credentials.yaml.example' '$WORKSPACE_DIR/.credentials/credentials.yaml'" "$install_mode"
    
    # Check for specific API keys if credentials file exists
    if [ -f "$WORKSPACE_DIR/.credentials/credentials.yaml" ]; then
        if grep -q "FATHOM_API_KEY\|fathom:" "$WORKSPACE_DIR/.credentials/credentials.yaml" 2>/dev/null || [ -n "$FATHOM_API_KEY" ]; then
            echo -e "  ${GREEN}✓${NC} Fathom API key configured"
        else
            echo -e "  ${YELLOW}○${NC} Fathom API key ${YELLOW}(not configured)${NC}"
            echo -e "      Get key: ${BLUE}https://fathom.video/settings/api${NC}"
        fi
    fi
    echo ""
}

check_integrations() {
    local install_mode=${1:-false}
    
    print_section "Integration Status"
    
    # Check Fathom integration status
    if [ -f "$WORKSPACE_DIR/.cursor/integrations/configs/fathom.yaml" ]; then
        local fathom_status=$(grep "^status:" "$WORKSPACE_DIR/.cursor/integrations/configs/fathom.yaml" 2>/dev/null | awk '{print $2}')
        if [ "$fathom_status" = "active" ]; then
            echo -e "  ${GREEN}✓${NC} Fathom integration active"
        else
            echo -e "  ${YELLOW}○${NC} Fathom integration ${YELLOW}(inactive)${NC}"
            echo -e "      Activate: Set status: active in .cursor/integrations/configs/fathom.yaml"
        fi
    else
        echo -e "  ${YELLOW}○${NC} Fathom config ${YELLOW}(not found)${NC}"
    fi
    
    # Check Calendar integration status
    if [ -f "$WORKSPACE_DIR/.cursor/integrations/configs/calendar.yaml" ]; then
        local calendar_status=$(grep "^status:" "$WORKSPACE_DIR/.cursor/integrations/configs/calendar.yaml" 2>/dev/null | awk '{print $2}')
        if [ "$calendar_status" = "active" ]; then
            echo -e "  ${GREEN}✓${NC} Calendar integration active"
        else
            echo -e "  ${YELLOW}○${NC} Calendar integration ${YELLOW}(inactive)${NC}"
        fi
    fi
    echo ""
}

# ============================================================================
# INITIALIZATION FUNCTIONS
# ============================================================================

init_workspace() {
    print_section "Workspace Initialization"
    
    # Ensure required directories exist
    local dirs=(
        "resources/meetings"
        "resources/notes"
        "projects/active"
        "projects/archive"
        "memory/items"
        "memory/summaries"
    )
    
    for dir in "${dirs[@]}"; do
        if [ ! -d "$WORKSPACE_DIR/$dir" ]; then
            mkdir -p "$WORKSPACE_DIR/$dir"
            echo -e "  ${GREEN}✓${NC} Created $dir/"
        fi
    done
    
    # Create credentials file if missing
    if [ ! -f "$WORKSPACE_DIR/.credentials/credentials.yaml" ]; then
        if [ -f "$WORKSPACE_DIR/.credentials/credentials.yaml.example" ]; then
            cp "$WORKSPACE_DIR/.credentials/credentials.yaml.example" "$WORKSPACE_DIR/.credentials/credentials.yaml"
            echo -e "  ${GREEN}✓${NC} Created credentials.yaml from template"
            echo -e "      ${YELLOW}Remember to add your API keys!${NC}"
        fi
    else
        echo -e "  ${GREEN}✓${NC} credentials.yaml exists"
    fi
    
    echo ""
}

# ============================================================================
# SUMMARY
# ============================================================================

print_summary() {
    print_header "Summary"
    
    if [ $INSTALLED_COUNT -gt 0 ]; then
        echo -e "  ${GREEN}Installed $INSTALLED_COUNT item(s)${NC}"
    fi
    
    if [ $REQUIRED_MISSING -eq 0 ] && [ $OPTIONAL_MISSING -eq 0 ]; then
        echo -e "  ${GREEN}All dependencies installed!${NC}"
    elif [ $REQUIRED_MISSING -eq 0 ]; then
        echo -e "  ${GREEN}All required dependencies installed.${NC}"
        echo -e "  ${YELLOW}$OPTIONAL_MISSING optional item(s) not configured.${NC}"
    else
        echo -e "  ${RED}$REQUIRED_MISSING required item(s) missing.${NC}"
        echo -e "  ${YELLOW}$OPTIONAL_MISSING optional item(s) not configured.${NC}"
    fi
    
    echo ""
}

print_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  (none)    Check status of all dependencies"
    echo "  install   Install missing dependencies"
    echo "  init      Initialize workspace (directories, credentials)"
    echo "  all       Full setup (install + init)"
    echo ""
    echo "Examples:"
    echo "  $0              # Check what's installed"
    echo "  $0 install      # Install missing tools"
    echo "  $0 all          # Complete setup"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    local command=${1:-check}
    local install_mode=false
    
    case "$command" in
        check|"")
            print_header "Areté Setup Check"
            install_mode=false
            ;;
        install)
            print_header "Areté Setup - Installing Dependencies"
            install_mode=true
            ;;
        init)
            print_header "Areté Setup - Initializing Workspace"
            init_workspace
            check_credentials false
            print_summary
            exit 0
            ;;
        all)
            print_header "Areté Setup - Full Installation"
            install_mode=true
            ;;
        -h|--help|help)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            echo ""
            print_usage
            exit 1
            ;;
    esac
    
    # Run checks (with install if requested)
    check_core_tools "$install_mode"
    check_python_env "$install_mode"
    check_search_tools "$install_mode"
    check_credentials "$install_mode"
    check_integrations "$install_mode"
    
    # Initialize workspace if running 'all'
    if [ "$command" = "all" ]; then
        init_workspace
    fi
    
    print_summary
    
    # Show next steps if not fully configured
    if [ $REQUIRED_MISSING -gt 0 ] || [ $OPTIONAL_MISSING -gt 0 ]; then
        echo "Next steps:"
        if [ $REQUIRED_MISSING -gt 0 ]; then
            echo "  1. Install required dependencies above"
        fi
        if [ "$install_mode" = "false" ]; then
            echo "  • Run '$0 install' to install missing tools"
        fi
        echo "  • Run '$0 init' to initialize workspace"
        echo "  • Add API keys to .credentials/credentials.yaml"
        echo ""
    fi
    
    exit $REQUIRED_MISSING
}

main "$@"
