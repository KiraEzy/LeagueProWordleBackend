#!/bin/bash

# Log file path
LOG_FILE="/var/log/leagueprowordle/daily-answer.log"
# Create log directory if it doesn't exist
mkdir -p $(dirname $LOG_FILE)

# Navigate to project directory
# Actual project directory path
cd /e/LeagueProWordle/LeagueProWordleBackend || {
  echo "Failed to change directory to backend folder" >> $LOG_FILE
  exit 1
}

# Make sure environment variables are loaded
if [ -f .env ]; then
  source .env
fi

echo "===== $(date) =====" >> $LOG_FILE
echo "Generating daily answer..." >> $LOG_FILE

# Run the TypeScript script
npx ts-node src/scripts/set-daily-answer.ts >> $LOG_FILE 2>&1

# Check result
if [ $? -eq 0 ]; then
  echo "Successfully generated daily answer" >> $LOG_FILE
else
  echo "Error generating daily answer" >> $LOG_FILE
fi

echo "===== Done =====" >> $LOG_FILE
echo "" >> $LOG_FILE 