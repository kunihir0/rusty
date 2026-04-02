<div align="center">
  <p>
    <a href="https://guns.lol/8aobao" target="_blank" rel="nofollow">
      <img src="https://i.ibb.co/1GH6d8bZ/Gemini-Generated-Image-ge7vtcge7vtcge7v-1-1.png" width="546" />
    </a>
  </p>
  <p>
    <b>Never be caught off guard again!</b>
    <br />
    A high-performance Discord bot built with Bun to integrate Rust game servers with Discord.
  </p>
</div>

---

## Features

*   **Map & Heatmap:** Generate real-time server maps with monuments and player markers. Visualize player death patterns with heatmaps.
*   **Shop Search:** Search for items in vending machines across the map, filtered by buy/sell price and stock levels.
*   **Leaderboards:** Track AFK time and death statistics for players on your server.
*   **Smart Notifications:** Real-time push notifications from RustPlus (alarms, switches, storage monitors) via FCM integration.
*   **Battlemetrics Watchlist:** Monitor specific players and get notified of their activity.
*   **Modular Architecture:** Built with discordx and Bun for performance and scalability.

## Prerequisites

1.  **Discord Bot Token:** Create one at the Discord Developer Portal.
    *   **Required Intents:** Guilds, GuildMembers, GuildMessages, Message Content.
2.  **RustPlus Credentials:** You will need your Steam ID, Player Token, and FCM (GCM) Tokens (Android ID and Security Token) to receive push events.
3.  **Bun:** The project is optimized for the Bun runtime.

## Environment Variables

The following variables must be defined in your .env file or deployment dashboard:

*   **BOT_TOKEN:** Your Discord bot token.
*   **NODE_ENV:** Set to production for live environments.

Optional (initial connection):
*   **RUSTPLUS_SERVER:** Rust server IP/Hostname.
*   **RUSTPLUS_PORT:** Rust server Port.
*   **RUSTPLUS_PLAYER_ID:** Your Steam ID.
*   **RUSTPLUS_PLAYER_TOKEN:** Your Player Token.

## Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/rusty.git
    cd rusty
    ```

2.  **Configure Environment Variables:**
    Copy .env.example to .env and fill in your details.
    ```bash
    cp .env.example .env
    ```

3.  **Install Dependencies:**
    ```bash
    bun install
    ```

4.  **Generate Protobufs:**
    ```bash
    bun run generate
    ```

## Development

Start the bot in development mode with hot-reloading:
```bash
bun run dev
```

## Production (Docker)

The project is production-ready with a lightweight Alpine-based Bun Docker image.

### Start with Docker Compose:
```bash
docker-compose up --build -d
```
The application state and credentials are automatically persisted in a Docker volume (bot-data) mapped to /app/data.

### Logging & Management:
*   **View Logs:** docker-compose logs -f bot
*   **Stop Bot:** docker-compose down

## Deployment to Railway

This project is optimized for Railway using the provided Dockerfile.

1.  **Fork this repository.**
2.  **Create a New Project** on Railway.
3.  **Select GitHub Repo** and choose your forked repository.
4.  **Configure Variables:**
    *   Add all required Environment Variables (BOT_TOKEN, etc.) in the Railway "Variables" tab.
5.  **Persistent Storage:**
    *   Go to the "Settings" tab of your service.
    *   Add a **Volume** and mount it to `/app/data`. This is critical to ensure your credentials and server state are not lost between deployments.
6.  **Deploy:** Railway will automatically detect the Dockerfile and start the build process.

## Command Reference

| Command | Description |
| :--- | :--- |
| /map | Generate the current server map (Monuments/Markers optional). |
| /heatmap | Generate a heatmap of deaths within a time range (24h/3d/7d). |
| /shop search | Search for items in vending machines. |
| /afk_leaderboard | Show players with the most AFK time. |
| /death_leaderboard | Show players with the most deaths. |
| /devices list | List all paired RustPlus devices (Alarms, Switches). |
| /watchlist add | Add a player to the Battlemetrics watchlist. |

## CI/CD

A GitHub Actions workflow is included in .github/workflows/docker.yml to automatically build and push the Docker image to GitHub Packages (GHCR) on every push to main or upon creating a version tag.

---
<p align="center">Made for the Rust Community.</p>
