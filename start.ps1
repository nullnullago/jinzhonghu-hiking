# PowerShell 启动脚本
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🏃 行稳致远共奋进 - 金钟湖健步行        ║" -ForegroundColor Cyan
Write-Host "║   中山联通 2026                          ║" -ForegroundColor Cyan
Write-Host "║                                          ║" -ForegroundColor Cyan
Write-Host "║   正在启动测试环境...                    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 检查 Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "[信息] $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "[错误] 未找到 Python，请先安装 Python 3.8+" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
}

# 检查虚拟环境
if (-not (Test-Path "venv")) {
    Write-Host "[信息] 创建虚拟环境..." -ForegroundColor Yellow
    python -m venv venv
    & .\venv\Scripts\Activate.ps1
    Write-Host "[信息] 安装依赖..." -ForegroundColor Yellow
    pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[警告] 依赖安装失败，尝试使用国内镜像..." -ForegroundColor Yellow
        pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    }
} else {
    & .\venv\Scripts\Activate.ps1
}

# 检查数据库目录
if (-not (Test-Path "data")) {
    Write-Host "[信息] 创建数据库目录..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "data" -Force | Out-Null
}

# 启动服务
Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   主应用:  http://localhost:3000         ║" -ForegroundColor Green
Write-Host "║   管理后台: http://localhost:3000/admin  ║" -ForegroundColor Green
Write-Host "║   默认密码: zhongshan2026                ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "按 Ctrl+C 停止服务" -ForegroundColor Yellow
Write-Host ""

python app.py

Read-Host "按 Enter 退出"