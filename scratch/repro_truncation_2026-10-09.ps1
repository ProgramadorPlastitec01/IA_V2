# Reproduce el truncamiento de listas con qwen2.5 en un servidor de prueba
# en el puerto 3998 (no toca producción ni el piloto en 3999). Guarda el log.
Set-Location C:\AIV2
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'node'; $psi.Arguments = 'server.js'; $psi.WorkingDirectory = 'C:\AIV2'
$psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
$psi.EnvironmentVariables['PORT'] = '3998'
$psi.EnvironmentVariables['QDRANT_COLLECTION'] = 'plastitec_docs_p0'
$psi.EnvironmentVariables['OLLAMA_MODEL'] = 'qwen2.5:latest'
$psi.EnvironmentVariables['LLM_PROMPT_STYLE'] = 'chat'
$psi.EnvironmentVariables['OLLAMA_NUM_CTX'] = '8192'
$psi.EnvironmentVariables['LLM_SKIP_REASONING'] = 'true'
$p = [System.Diagnostics.Process]::Start($psi)
$out = $p.StandardOutput.ReadToEndAsync(); $null = $p.StandardError.ReadToEndAsync()
for ($i = 0; $i -lt 30; $i++) { Start-Sleep 2; try { if ((Invoke-RestMethod http://localhost:3998/api/health -TimeoutSec 3).status -eq 'ready') { break } } catch {} }
node scratch\repeat_q_2026-10-09.mjs http://localhost:3998/api/query 1 "¿Qué sistemas de gestión y control ha implementado y adoptado PLASTITEC para prevenir el riesgo de lavado de activos?"
Stop-Process -Id $p.Id -Force
Start-Sleep 1
[IO.File]::WriteAllText('C:\AIV2\scratch\repro_truncation_2026-10-09.log', $out.Result)
"log guardado"
