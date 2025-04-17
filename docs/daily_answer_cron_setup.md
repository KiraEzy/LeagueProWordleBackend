# Setting Up the Daily Answer Generator

This document explains how to set up the automated daily answer generation for the League Pro Wordle game.

## Ubuntu/Linux Setup with Cron

1. First, make sure the shell script is executable:

   ```bash
   chmod +x /path/to/LeagueProWordle/LeagueProWordleBackend/scripts/generate_daily_answer.sh
   ```

2. Edit the shell script to use the correct path to your project:

   ```bash
   # Open the script
   nano /path/to/LeagueProWordle/LeagueProWordleBackend/scripts/generate_daily_answer.sh

   # Update the cd command to point to your project directory
   cd /path/to/LeagueProWordle/LeagueProWordleBackend
   ```

3. Set up a cron job to run the script daily (e.g., at midnight):

   ```bash
   # Open crontab editor
   crontab -e

   # Add the following line to run it every day at midnight
   0 0 * * * /path/to/LeagueProWordle/LeagueProWordleBackend/scripts/generate_daily_answer.sh
   ```

4. Verify the cron job is set correctly:

   ```bash
   crontab -l
   ```

## Windows Setup with Task Scheduler

1. Open Task Scheduler (search for it in the Start menu)

2. Click "Create Basic Task" in the right panel

3. Set a name (e.g., "LeagueProWordle Daily Answer Generator") and description

4. Set trigger to "Daily" and choose a time (e.g., 12:00 AM)

5. Select "Start a program" as the action

6. In the "Program/script" field, enter the full path to the batch file:
   ```
   E:\LeagueProWordle\LeagueProWordleBackend\scripts\generate_daily_answer.bat
   ```

7. In "Start in", enter the directory:
   ```
   E:\LeagueProWordle\LeagueProWordleBackend
   ```

8. Complete the wizard and check "Open the Properties dialog" before finishing

9. In the Properties dialog:
   - Go to the General tab and check "Run whether user is logged in or not"
   - In the Settings tab, ensure "Stop the task if it runs longer than" is set to a reasonable time (e.g., 5 minutes)
   - Check "Run task as soon as possible after a scheduled start is missed"

10. Click OK to save the task

## Verifying the Setup

To check if the setup is working correctly:

1. Check the log file:
   - Linux: `/var/log/leagueprowordle/daily-answer.log`
   - Windows: `E:\LeagueProWordle\daily-answer.log`

2. Query the database to see if the daily answers are being set:
   ```sql
   SELECT * FROM daily_answers ORDER BY date DESC LIMIT 5;
   ```

3. Ensure the game API returns consistent answers throughout the day:
   ```
   GET http://localhost:3001/api/game/daily
   ```

## Troubleshooting

If the script isn't running:

1. Check the log files for error messages
2. Verify that the script paths are correct
3. Make sure Node.js and npm are in the system PATH
4. Check that the database connection details are correct in the .env file
5. Test running the script manually to see if it works 