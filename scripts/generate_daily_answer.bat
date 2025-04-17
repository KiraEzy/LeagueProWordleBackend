@echo off
REM Script to generate daily answer for LeagueProWordle

ECHO ===== %DATE% %TIME% ===== >> E:\LeagueProWordle\daily-answer.log
ECHO Generating daily answer... >> E:\LeagueProWordle\daily-answer.log

REM Navigate to project directory
cd /d E:\LeagueProWordle\LeagueProWordleBackend

REM Run the TypeScript script
npx ts-node src/scripts/set-daily-answer.ts >> E:\LeagueProWordle\daily-answer.log 2>&1

REM Check result
IF %ERRORLEVEL% EQU 0 (
  ECHO Successfully generated daily answer >> E:\LeagueProWordle\daily-answer.log
) ELSE (
  ECHO Error generating daily answer >> E:\LeagueProWordle\daily-answer.log
)

ECHO ===== Done ===== >> E:\LeagueProWordle\daily-answer.log
ECHO. >> E:\LeagueProWordle\daily-answer.log 