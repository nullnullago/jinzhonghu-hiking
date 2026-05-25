@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════╗
echo ║   🏃 行稳致远共奋进 - 金钟湖健步行        ║
echo ║   中山联通 2026                          ║
echo ║                                          ║
echo ║   正在启动测试环境...                    ║
echo ╚══════════════════════════════════════════╝
echo.

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

REM 检查虚拟环境
if not exist "venv" (
    echo [信息] 创建虚拟环境...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [信息] 安装依赖...
    pip install -r requirements.txt >nul
    if errorlevel 1 (
        echo [警告] 依赖安装失败，尝试使用国内镜像...
        pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple >nul
    )
) else (
    call venv\Scripts\activate.bat
)

REM 检查数据库
if not exist "data" (
    echo [信息] 创建数据库目录...
    mkdir data
)

REM 启动服务
echo [信息] 启动 Flask 服务...
echo.
echo ╔══════════════════════════════════════════╗
echo ║   主应用:  http://localhost:3000         ║
echo ║   管理后台: http://localhost:3000/admin  ║
echo ║   默认密码: zhongshan2026                ║
echo ╚══════════════════════════════════════════╝
echo.
echo 按 Ctrl+C 停止服务
echo.

python app.py

pause