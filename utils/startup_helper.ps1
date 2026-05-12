# -----------------------------------------------------------------------------
# AIV2 - Startup Orchestrator (PowerShell)
# Pro-level service management for Local Enterprise RAG
# -----------------------------------------------------------------------------

$ErrorActionPreference = "SilentlyContinue"

# --- CONFIGURACION ---
$BASE_DIR = $PSScriptRoot | Split-Path
$LOG_DIR = Join-Path $BASE_DIR "logs"
$LOG_FILE = Join-Path $LOG_DIR "startup.log"
$PORTS = @{
    Backend  = 3000
    Frontend = 5180
    Ollama   = 11434
    Qdrant   = 6333
}

if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR | Out-Null }

function Log-Message {
    param([string]$message, [string]$color = "Gray")
    $ts = Get-Date -Format "HH:mm:ss"
    Write-Host "[$ts] " -NoNewline -ForegroundColor DarkGray
    Write-Host $message -ForegroundColor $color
    "[$ts] $message" | Add-Content -Path $LOG_FILE
}

# --- VALIDACIONES DE SISTEMA ---
function Test-Port {
    param([int]$port)
    $connection = New-Object System.Net.Sockets.TcpClient
    try {
        $connection.Connect("127.0.0.1", $port)
        $connection.Close()
        return $true
    }
    catch {
        return $false
    }
}

function Kill-ProcessOnPort {
    param([int]$port)
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $pids) {
                if ($pid -gt 0) {
                    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($proc) {
                        Log-Message "Limpiando puerto $port (Proceso: $($proc.Name), PID: $pid)..." "Yellow"
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                        Start-Sleep -Milliseconds 500
                    }
                }
            }
        }
    } catch {}
}

# --- HEALTH CHECKS ---
function Wait-For-Service {
    param([string]$name, [string]$url, [int]$timeout = 30)
    Log-Message "Esperando a que $name responda..." "Cyan"
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $timeout) {
        try {
            $resp = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 2
            if ($resp) { return $true }
        } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

function Wait-For-Backend-Ready {
    Log-Message "Verificando salud del Backend..." "Cyan"
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt 120) {
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get
            if ($resp.status -eq "ready") {
                return $true
            }
            Log-Message "Backend inicializando..." "DarkGray"
        } catch {}
        Start-Sleep -Seconds 3
    }
    return $false
}

# --- ACCIONES ---
function Start-Dependencies {
    Log-Message "--- INICIANDO DEPENDENCIAS ---" "Magenta"
    
    if (-not (Test-Port $PORTS.Ollama)) {
        Log-Message "Iniciando Ollama Serve..." "Cyan"
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
        if (-not (Wait-For-Service "Ollama" "http://localhost:11434/api/tags")) {
            Log-Message "ERROR: Ollama no arranco a tiempo." "Red"
            return $false
        }
    }
    Log-Message "Ollama [OK]" "Green"

    if (-not (Test-Port $PORTS.Qdrant)) {
        Log-Message "Iniciando Qdrant..." "Cyan"
        Start-Process "cmd" -ArgumentList "/c start_qdrant.bat" -WorkingDirectory $BASE_DIR -WindowStyle Hidden
        if (-not (Wait-For-Service "Qdrant" "http://localhost:6333/collections")) {
            Log-Message "ERROR: Qdrant no arranco a tiempo." "Red"
            return $false
        }
    }
    Log-Message "Qdrant [OK]" "Green"
    return $true
}

function Start-Backend {
    Log-Message "--- INICIANDO BACKEND ---" "Magenta"
    Kill-ProcessOnPort $PORTS.Backend
    
    Log-Message "Lanzando Node.js Server..." "Cyan"
    Start-Process "node" -ArgumentList "server.js" -WorkingDirectory $BASE_DIR -WindowStyle Normal
    
    if (Wait-For-Backend-Ready) {
        Log-Message "Backend [LISTO]" "Green"
        return $true
    } else {
        Log-Message "ERROR: El Backend no paso el Health Check." "Red"
        return $false
    }
}

function Start-Frontend {
    Log-Message "--- INICIANDO FRONTEND ---" "Magenta"
    Kill-ProcessOnPort $PORTS.Frontend
    
    Log-Message "Lanzando Vite Dev Server..." "Cyan"
    Start-Process "cmd" -ArgumentList "/c npm run dev" -WorkingDirectory $BASE_DIR -WindowStyle Hidden
    
    $count = 0
    while (-not (Test-Port $PORTS.Frontend) -and $count -lt 15) {
        Start-Sleep -Seconds 2
        $count++
    }
    
    if (Test-Port $PORTS.Frontend) {
        Log-Message "Frontend [OK]" "Green"
        Start-Process "http://localhost:$($PORTS.Frontend)"
    }
}

function Diagnose {
    Clear-Host
    Log-Message "=== DIAGNOSTICO INTEGRAL ===" "Cyan"
    
    foreach ($k in $PORTS.Keys) {
        $p = $PORTS[$k]
        $active = Test-Port $p
        if ($active) {
            Log-Message "$($k): ONLINE ($p)" "Green"
        } else {
            Log-Message "$($k): OFFLINE ($p)" "Red"
        }
    }

    $nodes = Get-Process node -ErrorAction SilentlyContinue
    Log-Message "Instancias Node: $($nodes.Count)" "White"
    
    Log-Message " "
    Log-Message "Presiona una tecla para volver..." "DarkGray"
    $null = [Console]::ReadKey()
}

# --- MAIN ---
$action = $args[0]

switch ($action) {
    "dashboard" { }
    "full-auto" {
        Clear-Host
        Log-Message "--- INICIO AUTOMATIZADO ---" "Cyan"
        if (Start-Dependencies) {
            if (Start-Backend) {
                Start-Frontend
                Log-Message " "
                Log-Message "SISTEMA LISTO." "Green"
            }
        }
        Start-Sleep -Seconds 5
    }
    "stop-all" {
        Log-Message "Deteniendo servicios..." "Yellow"
        Kill-ProcessOnPort $PORTS.Backend
        Kill-ProcessOnPort $PORTS.Frontend
        Kill-ProcessOnPort $PORTS.Qdrant
        Log-Message "OK." "Green"
    }
    "diagnose" {
        Diagnose
    }
}
