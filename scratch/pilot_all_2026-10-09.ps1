# Piloto de modelos 2026-10-09: corre las 150 preguntas de SQLite contra un
# servidor de PRUEBA (puerto 3999) con cada configuración. Producción (3000) no se toca.
# Reanudable: si se corta, volver a ejecutar; cada corrida retoma su JSON.
$ErrorActionPreference = 'Continue'
Set-Location C:\AIV2

$configs = @(
    @{ name = 'A_qwen25_7b'; env = @{ OLLAMA_MODEL = 'qwen2.5:latest'; LLM_PROMPT_STYLE = 'chat'; OLLAMA_NUM_CTX = '8192'; LLM_SKIP_REASONING = 'true' } },
    # B (qwen3:8b) omitido 2026-10-09: el usuario eligió qwen2.5 7B Instruct.
    # @{ name = 'B_qwen3_8b';  env = @{ OLLAMA_MODEL = 'qwen3:8b';       LLM_PROMPT_STYLE = 'chat'; OLLAMA_NUM_CTX = '8192'; LLM_SKIP_REASONING = 'true'; OLLAMA_THINK = 'false' } },
    @{ name = 'C_llama32_base'; env = @{ OLLAMA_MODEL = 'llama3.2' } }
)

function Stop-TestServer {
    $c = Get-NetTCPConnection -LocalPort 3999 -State Listen -ErrorAction SilentlyContinue
    $prod = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
    if ($c -and $c.OwningProcess -ne $prod) { Stop-Process -Id $c.OwningProcess -Force -Confirm:$false }
}

foreach ($cfg in $configs) {
    $out = "scratch\pilot_$($cfg.name).json"
    "=== $(Get-Date -Format HH:mm:ss) $($cfg.name) ==="
    Stop-TestServer
    Start-Sleep 3
    # Variables solo para el proceso de prueba
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'node'
    $psi.Arguments = 'server.js'
    $psi.WorkingDirectory = 'C:\AIV2'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.EnvironmentVariables['PORT'] = '3999'
    $psi.EnvironmentVariables['QDRANT_COLLECTION'] = 'plastitec_docs_p0'
    foreach ($k in @('LLM_PROMPT_STYLE','OLLAMA_NUM_CTX','LLM_SKIP_REASONING','OLLAMA_THINK')) { $psi.EnvironmentVariables.Remove($k) }
    foreach ($k in $cfg.env.Keys) { $psi.EnvironmentVariables[$k] = $cfg.env[$k] }
    $proc = [System.Diagnostics.Process]::Start($psi)
    # Vaciar la salida para que el buffer no bloquee el proceso
    $null = $proc.StandardOutput.ReadToEndAsync()
    $null = $proc.StandardError.ReadToEndAsync()
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep 2
        try { if ((Invoke-RestMethod http://localhost:3999/api/health -TimeoutSec 3).status -eq 'ready') { $ok = $true; break } } catch {}
    }
    if (-not $ok) { "No arrancó el servidor de prueba para $($cfg.name)"; continue }
    node scratch\pilot_run_2026-10-09.mjs http://localhost:3999/api/query $out "piloto-$($cfg.name)"
    Stop-TestServer
}
"=== FIN $(Get-Date -Format HH:mm:ss) ==="
