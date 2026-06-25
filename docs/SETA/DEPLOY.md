# Hackathon Deployment Guide — team-4

Your team has a dedicated **subdomain + EC2 + AWS credentials**.
CI/CD runs in your GitHub fork via GitHub Actions — no local tooling required to deploy.

---

## What you have

| Item | Value |
|------|-------|
| Subdomain | `https://team-4-hackathon.seta-international.com` |
| EC2 public IP | `54.179.152.174` (pre-bootstrapped, Docker + AWS CLI ready) |
| EC2 SSH user | `team-4` |
| EC2 SSH private key | `team-4` (in this package) |
| ECR registry | `033484686020.dkr.ecr.ap-southeast-1.amazonaws.com` |
| ECR repository | `hackathon-team-4` |
| AWS access key / secret (ECR push) | see `AWS-CREDENTIALS.txt` |
| OpenAI API key | see `AWS-CREDENTIALS.txt` (from organizer) |

---

## One-time setup (after receiving this package)

### 1. Fork the repo

Go to `https://github.com/Seta-International/agent-platform` → **Fork**.

### 2. Set GitHub Variables

**Settings → Secrets and variables → Actions → Variables tab → New repository variable**

| Variable | Value |
|----------|-------|
| `ECR_REGISTRY` | `033484686020.dkr.ecr.ap-southeast-1.amazonaws.com` |
| `ECR_REPOSITORY` | `hackathon-team-4` |
| `APP_DOMAIN` | `team-4-hackathon.seta-international.com` |
| `EC2_HOST` | `54.179.152.174` |
| `EC2_USER` | `team-4` |

> `AWS_REGION` defaults to `ap-southeast-1` — only add it if your ECR is in a different region.

### 3. Set GitHub Secrets

**Settings → Secrets and variables → Actions → Secrets tab → New repository secret** (values are in `AWS-CREDENTIALS.txt`)

| Secret | Value |
|--------|-------|
| `AWS_ECR_ACCESS_KEY_ID` | from `AWS-CREDENTIALS.txt` |
| `AWS_ECR_SECRET_ACCESS_KEY` | from `AWS-CREDENTIALS.txt` |
| `EC2_SSH_PRIVATE_KEY` | full content of the `team-4` key file (including `-----BEGIN...-----`) |
| `OPENAI_API_KEY` | from `AWS-CREDENTIALS.txt` |

> Database password, auth secret, and encryption key are **auto-generated on the EC2 on first deploy** and persisted in `/opt/seta/secrets.env` — no need to generate or store them yourself.

### 4. Verify EC2 is ready

Your EC2 was provisioned with the Terraform stack — Docker, AWS CLI, and your `team-4` user (with sudo) are pre-configured. **Skip to [First deploy](#first-deploy).**

Connect manually any time:

```bash
chmod 600 team-4
ssh -i team-4 team-4@54.179.152.174
```

---

## First deploy

1. Go to your fork on GitHub → **Actions** → **Hackathon — Release**
2. Click **Run workflow**
3. Optionally enter a custom image tag (default: short SHA of HEAD)
4. Click **Run workflow** — takes ~5–8 min for the first build (cached on subsequent runs)

The workflow:
- Builds `seta-server` and `seta-web` for `linux/amd64`
- Generates and persists app secrets on the EC2 (first run only)
- Pushes images to your ECR repository
- SSHs into your EC2, writes `/opt/seta/.env`, pulls images, runs migrations, starts the stack
- Smoke-tests `https://team-4-hackathon.seta-international.com/health/ready`

### Access your app

```
https://team-4-hackathon.seta-international.com
```

---

## First-time seed (demo data)

Run this **once after the first deploy** to bootstrap the hackathon tenant and load all demo data.

1. Go to **Actions** → **Hackathon — DB Reset & Seed**
2. Click **Run workflow** — all inputs have safe defaults
3. Log in after completion:

```
Email:    admin@hackathon.com
Password: ChangeMe@2026
```

> **Warning:** this **destroys all data** in the database. Only use it for a fresh start or a full demo reset.

---

## Mock Data (shared dataset on S3)

The organizer publishes a common mock dataset in the shared S3 bucket (read-only for all teams).
Pull it **on the EC2** — the instance role grants read access, no keys needed:

```bash
aws s3 ls   s3://hackathon-shared-assets-033484686020/mock-data/
aws s3 sync s3://hackathon-shared-assets-033484686020/mock-data/ ~/mock-data/
```

Save your own derived results to **your** bucket (read/write):

```bash
aws s3 sync ~/mock-data/processed/ s3://hackathon-team-4-assets-033484686020/processed/
```

> The shared bucket is read-only — write only to your own bucket.

---

## Redeploy after code changes

Run **Hackathon — Release** again — either manually or push to `main`.

---

## Full reset (wipe + re-seed)

Re-run **Hackathon — DB Reset & Seed** at any time to wipe all data and reload the demo dataset.

---

## Useful SSH commands

```bash
ssh -i team-4 team-4@54.179.152.174

# Live logs
cd /opt/platform && docker compose --env-file /opt/seta/.env logs -f --tail=50

# Restart stack manually
docker compose --env-file /opt/seta/.env up -d --no-deps server web worker

# Check .env
cat /opt/seta/.env

# Run migrations manually
docker compose --env-file /opt/seta/.env run --rm migrator
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Workflow fails at ECR login | Check `AWS_ECR_ACCESS_KEY_ID` and `AWS_ECR_SECRET_ACCESS_KEY` secrets |
| Workflow fails at SSH | Check `EC2_SSH_PRIVATE_KEY`, `EC2_HOST`, `EC2_USER`; ensure port 22 is open for your IP |
| App not reachable after deploy | Check DNS — `team-4-hackathon.seta-international.com` must point to `54.179.152.174` |
| `aws s3` "Access Denied" on shared bucket | Run it **on the EC2** (instance role grants read); the ECR key alone has no S3 access |
| Port 80/443 already in use | Run `sudo systemctl stop nginx && sudo systemctl disable nginx` on EC2 |
| Database errors | Run migrations: `docker compose --env-file /opt/seta/.env run --rm migrator` on EC2 |
| EC2 replaced / secrets lost | Delete `/opt/seta/secrets.env` on the new EC2 before deploying — fresh secrets generated, postgres re-initialised |
| Seed fails mid-run | It's idempotent — re-run **Hackathon — DB Reset & Seed** |
| `proxy` container not starting | Check `docker logs seta-proxy-1` — often a bad Traefik config mount or port conflict |
