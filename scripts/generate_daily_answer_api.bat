@echo off
REM Script to generate daily answer for LeagueProWordle via API

SET LOG_FILE=E:\LeagueProWordle\daily-answer-api.log
SET API_ENDPOINT=http://localhost:3001/api/admin/generate-daily-answers
SET API_KEY=LeagueProWordle_Admin_API_Key_2025
SET TEMP_FILE=%TEMP%\api_response.json

ECHO ===== %DATE% %TIME% ===== >> %LOG_FILE%
ECHO Calling daily answer generation API... >> %LOG_FILE%

REM Call the API using PowerShell's Invoke-WebRequest with full path
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -Command "try { $response = Invoke-WebRequest -Uri '%API_ENDPOINT%' -Method POST -Headers @{'X-API-Key'='%API_KEY%'} -ContentType 'application/json' -ErrorAction Stop; $response.Content | Out-File -FilePath '%TEMP_FILE%' -Encoding utf8; Write-Output 'API call succeeded' } catch { Write-Output ('API call failed: ' + $_.Exception.Message) }" >> %LOG_FILE% 2>&1

REM Display response if available
IF EXIST %TEMP_FILE% (
  ECHO Response: >> %LOG_FILE%
  TYPE %TEMP_FILE% >> %LOG_FILE%
  DEL %TEMP_FILE%
)

ECHO ===== Done ===== >> %LOG_FILE%
ECHO. >> %LOG_FILE% 