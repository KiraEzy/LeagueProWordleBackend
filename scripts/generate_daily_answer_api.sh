#!/bin/bash

# Log file path
LOG_FILE="/var/log/leagueprowordle/daily-answer-api.log"
# Create log directory if it doesn't exist
mkdir -p $(dirname $LOG_FILE)

# API settings
API_ENDPOINT="http://localhost:3001/api/admin/generate-daily-answers"
API_KEY="LeagueProWordle_Admin_API_Key_2025"

echo "===== $(date) =====" >> $LOG_FILE
echo "Calling daily answer generation API..." >> $LOG_FILE

# Call the API using curl
HTTP_RESPONSE=$(curl -s -o /tmp/api_response.json -w "%{http_code}" \
  -X POST $API_ENDPOINT \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json")

# Check response status code
if [ $HTTP_RESPONSE -eq 200 ]; then
  echo "API call succeeded" >> $LOG_FILE
  cat /tmp/api_response.json >> $LOG_FILE
else
  echo "API call failed with status code: $HTTP_RESPONSE" >> $LOG_FILE
  if [ -f /tmp/api_response.json ]; then
    echo "Error response:" >> $LOG_FILE
    cat /tmp/api_response.json >> $LOG_FILE
  fi
fi

echo "===== Done =====" >> $LOG_FILE
echo "" >> $LOG_FILE 