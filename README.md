## 🚀 Setup

### 1. Clone the repository
```bash
git clone <your-repo>
cd fintech-case-console
```

### 2. Create environment file
```bash
cp .env.example .env
# Edit .env and set your passwords
```

### 3. Start services
```bash
docker compose up -d
```

### 4. Verify
```bash
docker compose ps
# All services should be "healthy"
```

## 🔑 Environment Variables

Copy `.env.example` to `.env` and configure:
- `POSTGRES_PASSWORD` - Database password (change for production!)
- `DATABASE_URL` - Full connection string
- Other settings as needed