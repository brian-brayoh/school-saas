# Ada - set all production environment variables on Vercel from the terminal.
# Run from the project folder, ideally in the same window where you ran the
# production DB commands (so DATABASE_URL / DIRECT_URL are already set):
#   npm run vercel:env
#
# Values are passed through a temporary file with no trailing newline
# (piping in PowerShell would add one and silently break them), and each temp
# file is deleted immediately. Existing variables with the same name are replaced.

$ErrorActionPreference = "Stop"

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Set-VercelEnv([string]$name, [string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { throw "$name is empty." }
  $value = $value.Trim()
  $tmp = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($tmp, $value)   # no newline
    cmd /c "npx --yes vercel env rm $name production --yes >nul 2>&1"
    cmd /c "npx --yes vercel env add $name production < `"$tmp`""
    if ($LASTEXITCODE -ne 0) { throw "Vercel refused $name (see the message above)." }
    Write-Host "  set $name" -ForegroundColor Green
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "Ada - Vercel production environment" -ForegroundColor Cyan

if (-not (Test-Path ".vercel\project.json")) {
  Write-Host "Linking this folder to your Vercel project first (log in if asked)..."
  cmd /c "npx --yes vercel link"
  if ($LASTEXITCODE -ne 0) { throw "vercel link failed." }
}

$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl -or $databaseUrl -notlike "*-pooler*") { $databaseUrl = Read-Secret "Paste DATABASE_URL (pooled, school_app)" }
$directUrl = $env:DIRECT_URL
if (-not $directUrl -or $directUrl -like "*-pooler*") { $directUrl = Read-Secret "Paste DIRECT_URL (direct, neondb_owner)" }
if ($databaseUrl -notlike "*school_app*") { throw "DATABASE_URL must use the school_app login, not the owner." }
if ($directUrl -like "*-pooler*") { throw "DIRECT_URL must be the direct host (no -pooler)." }

$domain = (Read-Host "Your domain, e.g. adaschool.co.ke (no https://)").Trim().ToLower() -replace '^https?://', '' -replace '/.*$', ''
$whatsapp = (Read-Host "WhatsApp number for 'Book a demo' (2547XXXXXXXX, or Enter to skip)").Trim()

$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32; $rng.GetBytes($bytes); $encKey = [Convert]::ToBase64String($bytes)
$bytes2 = New-Object byte[] 32; $rng.GetBytes($bytes2); $authSecret = [Convert]::ToBase64String($bytes2)

Write-Host ""
Write-Host "Setting variables on Vercel (production)..." -ForegroundColor Cyan
Set-VercelEnv "DATABASE_URL" $databaseUrl
Set-VercelEnv "DIRECT_URL" $directUrl
Set-VercelEnv "AUTH_SECRET" $authSecret
Set-VercelEnv "AUTH_TRUST_HOST" "true"
Set-VercelEnv "ROOT_DOMAIN" $domain
Set-VercelEnv "ADMIN_SUBDOMAIN" "admin"
Set-VercelEnv "APP_ENCRYPTION_KEY" $encKey
Set-VercelEnv "PUBLIC_CALLBACK_BASE_URL" "https://$domain"
Set-VercelEnv "ENABLE_PAYMENT_SIMULATOR" "true"
if ($whatsapp) { Set-VercelEnv "SALES_WHATSAPP" ($whatsapp -replace '\D', '') }

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ""
Write-Host "SAVE THIS APP_ENCRYPTION_KEY in your password manager now." -ForegroundColor Yellow
Write-Host "If it is ever lost or changed, schools' saved M-Pesa keys can't be read." -ForegroundColor Yellow
Write-Host "Press Enter to copy it to the clipboard."
[void](Read-Host)
Set-Clipboard -Value $encKey
Write-Host "Copied. Paste it into your password manager, then press Enter to clear the clipboard."
[void](Read-Host)
Set-Clipboard -Value " "
$encKey = $null; $authSecret = $null; $databaseUrl = $null; $directUrl = $null
Write-Host "Clipboard cleared. Deploy with:  npx vercel --prod"
