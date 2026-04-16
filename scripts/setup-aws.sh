#!/bin/bash
set -e

echo "--- MediaMind: AWS Infrastructure Setup ---"

# 1. Update system and install dependencies
sudo apt-get update
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    nginx-common

# 2. Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

# 3. Add current user to docker group
sudo usermod -aG docker $USER
echo "Docker installed. Log out and back in to use docker without sudo."

# 4. Prepare directories
mkdir -p backend/data backend/uploads

# 5. Environment initialization
if [ ! -f backend/.env ]; then
    echo "Initializing environment variables from .env.example..."
    cp backend/.env.example backend/.env
    echo "--- ACTION REQUIRED: Update backend/.env with your production API keys ---"
fi

echo "Infrastructure setup complete. Use 'docker compose up -d --build' to start the platform."
