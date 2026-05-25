@echo off
echo.
echo ============================================
echo    Jinzhonghu Hiking - Zhongshan Unicom
echo    2026
echo.
echo    Starting test environment...
echo ============================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.8+
    pause
    exit /b 1
)

REM Check virtual environment
if not exist "venv" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [INFO] Installing dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [WARN] Retry with mirror...
        pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    )
) else (
    call venv\Scripts\activate.bat
)

REM Check data directory
if not exist "data" (
    echo [INFO] Creating data directory...
    mkdir data
)

REM Start server
echo.
echo ============================================
echo    App:       http://localhost:3000
echo    Admin:     http://localhost:3000/admin
echo    Password:  zhongshan2026
echo ============================================
echo.
echo Press Ctrl+C to stop
echo.

python app.py

pause