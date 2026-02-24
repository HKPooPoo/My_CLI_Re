# Project Context: My CLI Re

## Project Overview
"My CLI Re" is a full-stack, containerized web application. It features a retro CRT-themed user interface that communicates with a robust backend API. The application includes real-time communication capabilities denoted by features like "Blackboard", "Walkie-Typie", and "Broadcast". 

## Architecture & Technologies
- **Frontend**: Built with vanilla HTML5, CSS3, and JavaScript (ES Modules). It does not use a complex frontend framework or build process for its core UI. It incorporates `pusher.min.js` and `echo.iife.js` for real-time WebSocket communication.
- **Backend**: Powered by Laravel 12 (PHP 8.2). It handles business logic, database interactions, and API provisioning. It utilizes Laravel Reverb for real-time broadcasting.
- **Database**: PostgreSQL 16.
- **Caching & Queues**: Redis.
- **Infrastructure**: Fully Dockerized using Docker Compose. The setup includes multiple services:
  - `nginx`: Web server serving the frontend and proxying API requests.
  - `api`: The main Laravel backend service.
  - `queue`: Laravel queue worker.
  - `reverb`: Laravel Reverb server for WebSockets.
  - `db`: PostgreSQL database.
  - `redis`: Redis server.
  - `pgadmin` & `mailpit`: Development utilities for database management and email testing.
  - `tunnel`: Cloudflare tunnel.

## Building and Running

### Prerequisites
- Docker Desktop
- Git

### Setup Instructions
1. **Clone & Configure**:
   Clone the repository and set up the root environment variables.
   ```bash
   cp .env.example .env
   ```
   *Note: Ensure necessary API Keys (e.g., GG_API) are configured.*

2. **Start Services**:
   Launch the application using Docker Compose.
   ```bash
   docker compose up -d --build
   ```

3. **Initialize Backend (First Time Only)**:
   Generate the application key and run database migrations inside the `api` container.
   ```bash
   docker exec my-cli-api sh -c "cp .env.example .env && php artisan key:generate && php artisan migrate --force"
   ```

### Access Points
- **Frontend App**: http://localhost
- **API Status**: http://localhost/api/status
- **PgAdmin**: http://localhost:8080
- **Mailpit**: http://localhost:8025

## Development Workflow
- **Frontend Development**: Modify files within the `frontend/` directory. Since it uses vanilla web technologies without a build step, changes usually reflect immediately in the browser upon refresh.
- **Backend Development**: Modify files within the `backend/` directory. 
  - To clear caches if changes don't apply: `docker exec my-cli-api php artisan config:clear`
  - To execute Artisan commands, always use the container context: `docker exec my-cli-api php artisan <command>`
- **Database**: Data is persisted in the `db-data` Docker volume.

## Development Conventions & Rules
- **Docker First**: ALWAYS execute PHP and Artisan commands via Docker (`docker exec my-cli-api ...`). Never use local host PHP commands (per user preferences).
- **Naming Conventions**: Strictly adhere to the existing naming patterns found within the frontend and backend codebase.
- **Security**: NEVER commit `.env` files, API keys, or passwords.
- **Git Operations**: Do NOT touch or perform Git operations unless explicitly requested by the user.
