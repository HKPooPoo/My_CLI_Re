# My CLI — Linux Docker 部署紀錄

**機器：** MSI Vector GP68HX 13VH  
**系統：** Omarchy (Arch Linux + Hyprland)  
**Docker：** 29.4.0 + docker-compose 5.1.1  
**日期：** 2026-04-09

---

## 項目結構

Laravel API + Nginx + PostgreSQL + Redis，帶 Docker Compose。

最小部署命令：
```bash
docker compose up -d nginx api db redis
```

完整服務：nginx, api, db, redis, queue, scheduler, reverb, mailpit, pgadmin, ollama, tunnel

---

## 部署步驟

### 1. 解壓項目

```bash
mkdir -p ~/Projects
cd ~/Projects
unzip ~/Downloads/'!My_CLI_Re.zip' -d '!My_CLI_Re'
```

項目已包含 `.env`（從 Windows 帶過來的）。

### 2. Docker DNS 問題

**問題：** `docker compose up` 時 build 失敗，容器內 `apt-get update` 報錯：
```
Temporary failure resolving 'deb.debian.org'
```

**原因：** Docker 容器預設繼承宿主機 DNS（`127.0.0.53`，systemd-resolved 代理），但容器在獨立網路命名空間內連不到宿主機的本機代理。

**修復：**
```bash
sudo nvim /etc/docker/daemon.json
```
```json
{
  "dns": ["8.8.8.8", "1.1.1.1"]
}
```
```bash
sudo systemctl restart docker
```

### 3. 重新 Build（使用 host 網路）

`docker compose build` 預設的 Docker 網路隔離仍然導致連線超時（`Connection timed out [IP: 199.232.150.132 80]`）。改用 `docker build --network=host` 直接使用宿主機網路：

```bash
cd ~/Projects/'!My_CLI_Re'
docker build --network=host -t my_cli_re-api ./backend
```

Build 成功（41.3s），image 命名為 `my_cli_re-api:latest`。

**注意：** `docker compose build` 不支援 `--network=host` flag，需用 `docker build` 手動 build image，再用 `docker compose up` 啟動。

### 4. 啟動服務

```bash
docker compose up -d nginx api db redis
```

最小部署包含四個服務：
- **nginx** — 反向代理，port 80
- **api** — Laravel PHP-FPM 應用
- **db** — PostgreSQL 16 資料庫
- **redis** — 快取/佇列/Session

### 5. 生成 Laravel APP_KEY

```bash
docker exec my-cli-api php artisan key:generate --force --show
```

將輸出的 key 貼到 `.env` 的 `APP_KEY=` 欄位，然後重啟 api：

```bash
docker compose up -d api
```

### 6. 執行資料庫 Migration

```bash
docker exec my-cli-api php artisan migrate --force
```

### 7. 測試存取

開啟瀏覽器前往 http://localhost

---

## 問題排查紀錄

### DNS 解析失敗

**現象：** Docker build 時 `apt-get update` 報錯 `Temporary failure resolving 'deb.debian.org'`

**原因：** Docker 容器預設繼承宿主機 DNS（`127.0.0.53`，systemd-resolved 本機代理），但容器在獨立網路命名空間內無法連到宿主機的 loopback 地址。

**修復：** 在 `/etc/docker/daemon.json` 加入公共 DNS：
```json
{
  "dns": ["8.8.8.8", "1.1.1.1"]
}
```
```bash
sudo systemctl restart docker
```

### 連線超時（DNS 解析成功但無法下載）

**現象：** DNS 解析到 `199.232.150.132` 但 `apt-get` 下載套件時 `Connection timed out`

**原因：** Docker 的 bridge 網路 NAT 規則可能與宿主機的防火牆或網路設定衝突。

**修復：** 使用 `--network=host` 繞過 Docker 網路隔離：
```bash
docker build --network=host -t my_cli_re-api ./backend
```

---

## 待辦

- [x] Docker DNS 修復
- [x] Image build 成功
- [x] `docker compose up` 啟動服務（10/11，ollama 除外 — 需 NVIDIA Container Toolkit）
- [x] Laravel APP_KEY — 已從 Windows `.env` 帶過來
- [x] 資料庫 migration — 已是最新
- [x] 測試 http://localhost — API 回傳 `{"status":"ONLINE"}`
- [ ] 從 Windows 匯入資料（需重啟進 Windows 做 pg_dump）
- [ ] 安裝 NVIDIA Container Toolkit（ollama GPU 支援）

### 8. Docker Hub Image

Windows 端 build 好的 image 已推到 Docker Hub：
```
hkpoopoo/my-cli-re-api:latest
```

`docker-compose.yml` 的 `build: ./backend` 已改為 `image: hkpoopoo/my-cli-re-api:latest`。
Lecturer 部署只需：
```bash
cp .env.example .env
# 填入必要的環境變數
docker compose up -d
```

### 啟動時 Race Condition

首次 `docker compose up` 後前 1-2 分鐘可能出現 500 錯誤（Redis/PostgreSQL 尚未就緒）。等所有 container 穩定後自動恢復。
