# Setting Up Daily Answer Generation via API

This document explains how to set up the automated daily answer generation for the League Pro Wordle game using the API approach.

## Overview

Instead of directly interacting with the database, this approach calls a secure API endpoint that:
1. Checks if there's a daily answer for today
2. If not, generates one
3. Checks if there's a daily answer for tomorrow
4. If not, generates one

This approach has several advantages:
- Uses your existing API infrastructure
- Respects all your business logic and validation
- Can be called from any machine with HTTP access to your server
- Doesn't require direct database access

## Ubuntu/Linux Setup with Cron

1. First, make sure the shell script is executable:

   ```bash
   chmod +x /path/to/LeagueProWordle/LeagueProWordleBackend/scripts/generate_daily_answer_api.sh
   ```

2. Edit the shell script to use the correct path and API details:

   ```bash
   # Edit the script
   nano /path/to/LeagueProWordle/LeagueProWordleBackend/scripts/generate_daily_answer_api.sh
   
   # Update these variables:
   API_ENDPOINT="https://your-domain.com/api/admin/generate-daily-answers"
   API_KEY="your-secure-api-key"
   ```

3. Set up a cron job to run the script daily (e.g., at midnight):

   ```bash
   # Open crontab editor
   crontab -e

   # Add the following line to run it every day at midnight
   0 0 * * * /path/to/LeagueProWordle/LeagueProWordleBackend/scripts/generate_daily_answer_api.sh
   ```

4. Verify the cron job is set correctly:

   ```bash
   crontab -l
   ```

## Windows Setup with Task Scheduler

1. Open Task Scheduler (search for it in the Start menu)

2. Click "Create Basic Task" in the right panel

3. Set a name (e.g., "LeagueProWordle Daily Answer API") and description

4. Set trigger to "Daily" and choose a time (e.g., 12:00 AM)

5. Select "Start a program" as the action

6. In the "Program/script" field, enter the full path to the batch file:
   ```
   E:\LeagueProWordle\LeagueProWordleBackend\scripts\generate_daily_answer_api.bat
   ```

7. Complete the wizard and check "Open the Properties dialog" before finishing

8. In the Properties dialog, go to the General tab and check "Run whether user is logged in or not"

9. Update the batch file with your production API endpoint:
   ```
   SET API_ENDPOINT=https://your-domain.com/api/admin/generate-daily-answers
   SET API_KEY=your-secure-api-key
   ```

## API Security

The API endpoint is protected by an API key that should be:

1. Added to your `.env` file:
   ```
   ADMIN_API_KEY=a-long-secure-random-string
   ```

2. Kept secret and only used by authorized scripts or services

3. Changed if you suspect it has been compromised

## Verifying the Setup

To check if the setup is working correctly:

1. Check the log file:
   - Linux: `/var/log/leagueprowordle/daily-answer-api.log`
   - Windows: `E:\LeagueProWordle\daily-answer-api.log`

2. You can also test the API manually:
   ```bash
   curl -X POST https://your-domain.com/api/admin/generate-daily-answers \
     -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json"
   ```

3. Check the daily answers in the database:
   ```sql
   SELECT * FROM daily_answers ORDER BY date DESC LIMIT 5;
   ```

## Troubleshooting

If the API calls aren't working:

1. Verify the server is running
2. Check your API endpoint URL is correct
3. Ensure your API key matches what's in the .env file
4. Look for error messages in the log file
5. Check the server logs for any API errors 