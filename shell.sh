#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Repomix Runner development environment setup...${NC}"

# 1. Node.js and npm
echo -e "\n${YELLOW}Checking Node.js and npm...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi
echo -e "Node.js $(node -v) and npm $(npm -v) are installed."

# 2. Install Project Dependencies
echo -e "\n${YELLOW}Installing project dependencies (including vsce)...${NC}"
npm install
echo -e "${GREEN}Dependencies installed.${NC}"

# 3. System Dependencies (Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "\n${YELLOW}Checking Linux system dependencies...${NC}"

    # xclip for clipboard support
    if ! command -v xclip &> /dev/null; then
        echo -e "${YELLOW}xclip is not installed.${NC} It is required for clipboard functionality on Linux."
        if [ "$EUID" -eq 0 ]; then
             echo "Attempting to install xclip..."
             apt-get update && apt-get install -y xclip
        elif command -v sudo &> /dev/null; then
             echo "Attempting to install xclip with sudo..."
             sudo apt-get update && sudo apt-get install -y xclip
        else
             echo -e "${RED}Please install xclip manually (e.g., sudo apt-get install xclip).${NC}"
        fi
    else
        echo "xclip is installed."
    fi

    # mingw-w64 for cross-compiling Rust to Windows
    if ! dpkg -s mingw-w64 &> /dev/null && ! command -v x86_64-w64-mingw32-gcc &> /dev/null; then
        echo -e "${YELLOW}mingw-w64 is not installed.${NC} It is required to cross-compile the Windows clipboard helper."
        if [ "$EUID" -eq 0 ]; then
             echo "Attempting to install mingw-w64..."
             apt-get update && apt-get install -y mingw-w64
        elif command -v sudo &> /dev/null; then
             echo "Attempting to install mingw-w64 with sudo..."
             sudo apt-get update && sudo apt-get install -y mingw-w64
        else
             echo -e "${RED}Please install mingw-w64 manually (e.g., sudo apt-get install mingw-w64).${NC}"
        fi
    else
        echo "mingw-w64 is installed."
    fi
fi

# 4. Rust Setup
echo -e "\n${YELLOW}Checking Rust environment...${NC}"
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Rust/Cargo is not installed.${NC}"
    echo "Please install Rust from https://rustup.rs/ or your package manager."
    # We don't auto-install rustup as it's interactive usually
else
    echo "Rust/Cargo is installed."

    # Add Windows target for cross-compilation
    echo -e "Adding x86_64-pc-windows-gnu target..."
    rustup target add x86_64-pc-windows-gnu
fi

# 5. Build Rust Helper
echo -e "\n${YELLOW}Building Rust clipboard helper...${NC}"
if npm run build:rust; then
    echo -e "${GREEN}Rust binary built successfully.${NC}"
else
    echo -e "${RED}Failed to build Rust binary.${NC}"
    echo "Ensure you have the required dependencies (mingw-w64) and Rust target installed."
fi

# 6. Verify VSCE
echo -e "\n${YELLOW}Verifying vsce...${NC}"
if npx vsce --version &> /dev/null; then
    echo -e "vsce is available via npx: $(npx vsce --version)"
else
    echo -e "${RED}vsce check failed.${NC}"
fi

echo -e "\n${GREEN}Setup complete!${NC}"
