# Branche la ligne d'etat Claude Code sur Claude Suivi : les limites du forfait (5 h, semaine)
# arrivent alors toutes seules dans l'onglet Usage.
# Usage : npm run install-statusline            (installe)
#         npm run install-statusline -- -Retirer (enleve)
param([switch]$Retirer)
$ErrorActionPreference = 'Stop'

$script = (Join-Path $PSScriptRoot 'statusline\claude-suivi-statusline.js') -replace '\\', '/'
$reglages = Join-Path $env:USERPROFILE '.claude\settings.json'
$commande = "node `"$script`""

if (-not (Test-Path ($script -replace '/', '\'))) { throw "Script introuvable : $script" }

$json = if (Test-Path $reglages) { Get-Content $reglages -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{} }
$actuelle = $json.PSObject.Properties['statusLine']
$estLaNotre = $actuelle -and ($actuelle.Value.command -like '*claude-suivi-statusline*')

if ($Retirer) {
  if ($estLaNotre) {
    $json.PSObject.Properties.Remove('statusLine')
    [IO.File]::WriteAllText($reglages, ($json | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Ligne d etat retiree.'
  } else { Write-Host 'Rien a retirer : la ligne d etat actuelle n est pas celle de Claude Suivi.' }
  return
}

if ($actuelle -and -not $estLaNotre) {
  Write-Host 'Tu as deja une ligne d etat dans settings.json, je n y touche pas :'
  Write-Host "  $($actuelle.Value.command)"
  Write-Host 'Pour la combiner avec Claude Suivi, appelle le script depuis la tienne :'
  Write-Host "  $commande"
  exit 1
}

if (Test-Path $reglages) { Copy-Item $reglages ($reglages + '.bak-claude-suivi') -Force }
New-Item -ItemType Directory -Force -Path (Split-Path $reglages) | Out-Null
$nouvelle = [pscustomobject]@{ type = 'command'; command = $commande }
$json | Add-Member -NotePropertyName statusLine -NotePropertyValue $nouvelle -Force
[IO.File]::WriteAllText($reglages, ($json | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
Write-Host "Ligne d etat installee dans $reglages"
Write-Host "Commande : $commande"
