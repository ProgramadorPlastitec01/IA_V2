# Levanta un servidor de prueba en el puerto 3998 con la configuración actual
# (qwen2.5 + bge-m3) y corre el banco de preguntas generado. No toca producción (3000).
Set-Location C:\AIV2
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'node'; $psi.Arguments = 'server.js'; $psi.WorkingDirectory = 'C:\AIV2'
$psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
$psi.EnvironmentVariables['PORT'] = '3998'
$psi.EnvironmentVariables['QDRANT_COLLECTION'] = 'plastitec_docs_bge'
$psi.EnvironmentVariables['OLLAMA_MODEL'] = 'qwen2.5:latest'
$psi.EnvironmentVariables['LLM_PROMPT_STYLE'] = 'chat'
$psi.EnvironmentVariables['OLLAMA_NUM_CTX'] = '8192'
$psi.EnvironmentVariables['LLM_SKIP_REASONING'] = 'true'
$psi.EnvironmentVariables['OLLAMA_EMBED_MODEL'] = 'bge-m3'
$psi.EnvironmentVariables['RATE_LIMIT_MAX_REQUESTS'] = '10000'
$p = [System.Diagnostics.Process]::Start($psi)
$out = $p.StandardOutput.ReadToEndAsync(); $null = $p.StandardError.ReadToEndAsync()
for ($i = 0; $i -lt 30; $i++) { Start-Sleep 2; try { if ((Invoke-RestMethod http://localhost:3998/api/health -TimeoutSec 3).status -eq 'ready') { break } } catch {} }
node scratch\gen_run_2026-10-13.mjs http://localhost:3998/api/query scratch\gen_questions_2026-10-13.json scratch\gen_results_2026-10-13.json
Stop-Process -Id $p.Id -Force
Start-Sleep 1
[IO.File]::WriteAllText('C:\AIV2\scratch\gen_run_2026-10-13.log', $out.Result)
"log guardado"
