# League Pro Wordle Backend

Backend server for the League Pro Wordle game that provides game logic, player data management, and score tracking.

## Features

- Daily answer management for the game
- Player data API for the frontend
- Game state verification and scoring
- User statistics tracking
- Secure game logic implementation

## Tech Stack

- Node.js with TypeScript
- Express.js web framework
- PostgreSQL database
- JWT for authentication (optional)

## Prerequisites

- Node.js (v14+ recommended)
- PostgreSQL database
- npm or yarn

## Setup Instructions

1. **Clone the repository**

```bash
git clone <repository-url>
cd LeagueProWordleBackend
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Copy the `.env.example` file to `.env` and update the values:

```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. **Set up the database**

Make sure your PostgreSQL server is running, then initialize the database:

```bash
npm run init-db
```

5. **Import player data**

You need to install the required Python packages first:

```bash
pip install psycopg2-binary python-dotenv
```

Then import the sample player data (or your own player data file):

```bash
# For the sample players format
python src/scripts/import_players.py src/data/sample_players.json

# OR for the Worlds players format
python src/scripts/import_worlds_players.py path/to/worlds_players.json
```

The backend supports two different player data formats:
- Standard format: An array of player objects
- Worlds format: An object with player names as keys and player data as values

6. **Build the project**

```bash
npm run build
```

## Running the server

### Development mode

```bash
npm run dev
```

### Production mode

```bash
npm run build
npm start
```

## Setting the Daily Answer

The game requires a daily answer to be set. You can run:

```bash
npm run set-answer
```

This script can be set up as a daily cron job to automatically pick a new player every day at midnight.

## API Endpoints

### Game Endpoints

- `GET /api/game/daily` - Get today's game metadata
- `POST /api/game/guess` - Submit a guess
- `GET /api/game/stats` - Get user statistics

### Player Endpoints

- `GET /api/players` - Get list of players

## Database Schema

- `players` - Player data (name, team, role, etc.)
- `daily_answers` - Daily selected players to guess
- `daily_user_guesses` - User guess attempts
- `guess_feedback` - Detailed feedback for each guess
- `user_stats` - User game statistics

## License

ISC 