# My CLI Re (Docker Version)

## Setup for Development

### 1. Prerequisites
- Docker Desktop
- Git

### 2. Initial Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd !My_CLI_Re
   ```

2. **Configure Environment**:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - **Crucial**: Ask the team lead (AlanYu) for the correct API Keys (Google Cloud, Cloudflare) and fill them in `.env`.

3. **Start Docker Containers**:
   ```bash
   docker compose up -d --build
   ```

4. **Initialize Backend (First Time Only)**:
   Run the following command to set up Laravel keys and migrations:
   ```bash
   docker exec my-cli-api sh -c "cp .env.example .env && php artisan key:generate && php artisan migrate --force"
   ```
   *(Note: The `backend/.env` inside the container is separate from the root `.env`. We initialize it from example.)*

### 3. Usage

- **Frontend**: http://localhost
- **PgAdmin**: http://localhost:8080 (Login with credentials from `.env`)
- **API Status**: http://localhost/api/status

### 4. Development Workflow

- **Backend Logic**: Edit files in `backend/app/`. Changes reflect immediately (unless cached, see below).
- **Frontend Logic**: Edit files in `frontend/`.
- **Database**: Data persists in `db-data` volume.

### 5. Troubleshooting

- **Google API Error (400)**: Check if your `GG_API` in `.env` is valid. If updated, run `docker compose up -d` to refresh containers.
- **Code changes not reflecting**: Run `docker compose restart api` or `docker exec my-cli-api php artisan config:clear`.

## Security Note

- **NEVER** commit the `.env` file.
- **NEVER** commit API Keys or Passwords.
