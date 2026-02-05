#!/bin/bash

# Areté Setup Check
# Verifies that required and optional dependencies are installed

# Don't exit on error - we want to check all tools
set +e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
REQUIRED_MISSING=0
OPTIONAL_MISSING=0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Areté Setup Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Function to check if command exists
check_command() {
    local cmd=$1
    local name=$2
    local required=$3
    local install_cmd=$4
    local purpose=$5
    
    if command -v "$cmd" &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $name"
        return 0
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
        return 1
    fi
}

# Function to check file exists
check_file() {
    local file=$1
    local name=$2
    local required=$3
    local create_cmd=$4
    
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $name"
        return 0
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
        return 1
    fi
}

# ============================================================================
# CORE TOOLS
# ============================================================================
echo "Core Tools"
echo "──────────────────────────────────────────────────────────"

check_command "git" "Git" "required" "xcode-select --install" "Version control"
check_command "brew" "Homebrew" "required" "/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"" "Package manager for macOS"

echo ""

# ============================================================================
# INTEGRATIONS - Calendar
# ============================================================================
echo "Calendar Integration"
echo "──────────────────────────────────────────────────────────"

check_command "icalBuddy" "icalBuddy" "optional" "brew install ical-buddy" "Read Apple Calendar events"

echo ""

# ============================================================================
# INTEGRATIONS - Search & Productivity  
# ============================================================================
echo "Search & Productivity"
echo "──────────────────────────────────────────────────────────"

check_command "qmd" "QMD" "optional" "brew install qmd (or see github.com/qmd-lang/qmd)" "Query markdown files"
check_command "rg" "ripgrep" "optional" "brew install ripgrep" "Fast file search"
check_command "jq" "jq" "optional" "brew install jq" "JSON processing"
check_command "yq" "yq" "optional" "brew install yq" "YAML processing"

echo ""

# ============================================================================
# CREDENTIALS
# ============================================================================
echo "Credentials"
echo "──────────────────────────────────────────────────────────"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"

check_file "$WORKSPACE_DIR/.credentials/credentials.yaml" "credentials.yaml" "optional" "cp .credentials/credentials.yaml.example .credentials/credentials.yaml"

echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $REQUIRED_MISSING -eq 0 ] && [ $OPTIONAL_MISSING -eq 0 ]; then
    echo -e "  ${GREEN}All dependencies installed!${NC}"
elif [ $REQUIRED_MISSING -eq 0 ]; then
    echo -e "  ${GREEN}All required dependencies installed.${NC}"
    echo -e "  ${YELLOW}$OPTIONAL_MISSING optional tool(s) not installed.${NC}"
else
    echo -e "  ${RED}$REQUIRED_MISSING required tool(s) missing.${NC}"
    echo -e "  ${YELLOW}$OPTIONAL_MISSING optional tool(s) not installed.${NC}"
fi

echo ""
echo "  Run with --install to install missing tools (requires Homebrew)"
echo ""

# ============================================================================
# OPTIONAL: Install missing tools
# ============================================================================
if [ "${1:-}" = "--install" ] && [ $OPTIONAL_MISSING -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Installing Missing Tools"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if ! command -v brew &> /dev/null; then
        echo -e "  ${RED}Homebrew not installed. Please install it first.${NC}"
        exit 1
    fi
    
    # Install missing tools
    if ! command -v icalBuddy &> /dev/null; then
        echo "  Installing icalBuddy..."
        brew install ical-buddy
    fi
    
    if ! command -v rg &> /dev/null; then
        echo "  Installing ripgrep..."
        brew install ripgrep
    fi
    
    if ! command -v jq &> /dev/null; then
        echo "  Installing jq..."
        brew install jq
    fi
    
    if ! command -v yq &> /dev/null; then
        echo "  Installing yq..."
        brew install yq
    fi
    
    # Create credentials file if missing
    if [ ! -f "$WORKSPACE_DIR/.credentials/credentials.yaml" ]; then
        echo "  Creating credentials.yaml from template..."
        cp "$WORKSPACE_DIR/.credentials/credentials.yaml.example" "$WORKSPACE_DIR/.credentials/credentials.yaml"
        echo -e "  ${YELLOW}Remember to add your API keys to .credentials/credentials.yaml${NC}"
    fi
    
    echo ""
    echo -e "  ${GREEN}Done!${NC}"
    echo ""
fi

exit $REQUIRED_MISSING
