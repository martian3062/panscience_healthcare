# MediaMind AWS Deployment Guide

This guide will walk you through deploying your Multimedia Q&A Platform to an **AWS EC2** instance using your $100 budget.

## Prerequisite: AWS Console Setup

### 1. Launch EC2 Instance
1. Log in to your [AWS Console](https://console.aws.amazon.com/).
2. Navigate to **EC2** > **Instances** > **Launch Instances**.
3. **Name**: `mediamind-prod`
4. **OS**: Choose **Ubuntu 22.04 LTS**.
5. **Instance Type**: Select **t3.small** (2 vCPU, 2GB RAM). This is a great balance between cost (~$15/mo) and performance for an intern assignment.
   - *Note*: If you want to go even cheaper (t3.micro), you **must** follow the Swap File section below or the system will crash during PDF processing.
6. **Key Pair**: Create a new key pair (RSA, .pem) and save it safely to your computer.
7. **Network Settings**:
   - Check **Allow SSH traffic from Anywhwere**.
   - Check **Allow HTTP traffic from the internet**.
   - Check **Allow HTTPS traffic from the internet**.
8. **Storage**: Set to **20GB** gp3.
9. Click **Launch Instance**.

### 2. Assign Elastic IP (Static IP)
1. In the EC2 sidebar, click **Elastic IPs**.
2. Click **Allocate Elastic IP address** > **Allocate**.
3. Select the IP > **Actions** > **Associate Elastic IP address**.
4. Choose your `mediamind-prod` instance and click **Associate**.

---

## Step 1: Connect to your Server
Open your terminal (on your local computer) and run:
```bash
ssh -i "your-key.pem" ubuntu@<YOUR_ELASTIC_IP>
```

## Step 2: Clone and Setup
Once logged into the server:
```bash
# Clone your repository
git clone <YOUR_GITHUB_REPO_URL> mediamind
cd mediamind

# Run the automated setup script
chmod +x scripts/setup-aws.sh
./scripts/setup-aws.sh

# IMPORTANT: Refresh your session to enable Docker permissions
exit
```
Then SSH back in.

## Step 3: Configure Environment Variables
```bash
nano backend/.env
```
- Set `GROQ_API_KEY` to your production key.
- Update `CORS_ORIGINS` to include `["http://<YOUR_ELASTIC_IP>"]`.

## Step 4: Add a 2GB Swap File (Crucial for Low-Tier RAM)
Since we're using a 2GB (t3.small) server, we need "virtual memory" to prevent crashes during large file ingestion.
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/apt/fstab
```

## Step 5: Launch the Platform
```bash
# Set the public URL for the frontend build
export NEXT_PUBLIC_API_BASE_URL=http://<YOUR_ELASTIC_IP>

# Start all containers in the background
docker compose up -d --build
```


---

## Verification
- Visit `http://<YOUR_ELASTIC_IP>` in your browser.
- Visit `http://<YOUR_ELASTIC_IP>/api/docs` to verify the backend is active.

## Cost Management Tip
- A `t3.small` instance costs approximately **$15/month**. Your $100 credits will last about **6 months** if you leave it running 24/7.
- To save credits, you can "Stop" the instance when you aren't using it.
