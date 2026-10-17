# Copie le skill claude-suivi dans le dossier des skills de Claude (%USERPROFILE%\.claude\skills\claude-suivi)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'skill\claude-suivi'
$cible = Join-Path $env:USERPROFILE '.claude\skills\claude-suivi'

if (-not (Test-Path (Join-Path $source 'SKILL.md'))) { throw "SKILL.md introuvable dans $source" }

New-Item -ItemType Directory -Force -Path $cible | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $cible -Recurse -Force
Write-Host "Skill installe : $cible"
