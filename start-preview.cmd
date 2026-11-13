@echo off
rem SPDX-License-Identifier: AGPL-3.0-only
rem Copyright (C) 2026 ttttsdaf and contributors. See LICENSE and NOTICE.md.
setlocal
py -3 -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
    set "previewPython=py"
    set "previewArgs=-3"
    goto run
)
python -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
if not errorlevel 1 (
    set "previewPython=python"
    set "previewArgs="
    goto run
)
rem Also support per-user Python installs when Windows App Aliases are unavailable.
for /d %%P in ("%LOCALAPPDATA%\Python\pythoncore-3.*" "%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if exist "%%~fP\python.exe" (
        "%%~fP\python.exe" -c "import sys; sys.exit(sys.version_info < (3, 10))" >nul 2>&1
        if not errorlevel 1 (
            set "previewPython=%%~fP\python.exe"
            set "previewArgs="
            goto run
        )
    )
)
echo Python 3.10 or newer is required. Install Python and reopen this launcher.
echo You can also run serve.py with your Python executable directly.
pause
exit /b 1

:run
echo Starting the local preview. Keep this window open; press Ctrl-C to stop.
"%previewPython%" %previewArgs% "%~dp0serve.py" --open %*
set "previewExit=%errorlevel%"
if not "%previewExit%"=="0" (
    echo Preview exited with code %previewExit%. See the message above.
    pause
)
exit /b %previewExit%
