# Ada - production database setup.
# Run from the project folder:   npm run db:prod-setup
#
# Paste ONE connection string from the ada-production Neon project, then type
# the passwords when asked (hidden). The script builds the direct and pooled
# URLs, runs migrations + row-level security + seed + the isolation check,
# and can copy the URLs for Vercel to your clipboard.
# Nothing is written to disk; the settings vanish when the script ends.

$ErrorActionPreference = "Stop"

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Run-Step([string]$label, [string]$script) {
  Write-Host ""
  Write-Host "==> $label" -ForegroundColor Cyan
  npm run $script
  if ($LASTEXITCODE -ne 0) { throw "$label failed. Fix the error above and run the script again (it is safe to repeat)." }
}

Write-Host ""
Write-Host "Ada production database setup" -ForegroundColor Cyan
Write-Host "In Neon, open the ada-production project, click Connect and copy the connection string."
Write-Host ""

$conn = (Read-Host "Paste the connection string").Trim().Trim('"')
if ($conn -notmatch '^postgres(?:ql)?://([^:@/]+)(?::[^@]*)?@([^/:?]+)(?::\d+)?/([^?]+)') {
  throw "That doesn't look like a Neon connection string (postgresql://user:password@host/db...)."
}
$user = $Matches[1]; $hostname = $Matches[2]; $db = $Matches[3]
$owner = if ($user -eq "school_app") { "neondb_owner" } else { $user }

$direct = $hostname -replace '-pooler\.', '.'
if ($direct -notmatch '^(ep-[^.]+)(\..+)$') { throw "Couldn't find the Neon endpoint in '$hostname'." }
$pooled = "$($Matches[1])-pooler$($Matches[2])"

Write-Host ""
Write-Host "  Owner login:  $owner"
Write-Host "  Direct host:  $direct"
Write-Host "  Pooled host:  $pooled"
Write-Host "  Database:     $db"
if ($direct -notlike "*eu-central-1*") {
  Write-Warning "This database is not in Frankfurt (eu-central-1). The app runs in Frankfurt, so every query will be slower."
}
Write-Host ""

$ownerPw = Read-Secret "Password for $owner"
$appPw = Read-Secret "Password for school_app (the one you set with CREATE ROLE)"
$adminEmail = (Read-Host "Platform admin email (your sign-in at admin.yourdomain)").Trim()
$adminPw = Read-Secret "Platform admin password (long and unique)"
if ($adminPw.Length -lt 10) { throw "Use a platform admin password of at least 10 characters." }

$q = "sslmode=require&connect_timeout=15"
$directUrl = "postgresql://${owner}:$([uri]::EscapeDataString($ownerPw))@${direct}/${db}?${q}"
$pooledUrl = "postgresql://school_app:$([uri]::EscapeDataString($appPw))@${pooled}/${db}?${q}"

$env:DIRECT_URL = $directUrl
$env:DATABASE_URL = $pooledUrl
$env:SEED_PLATFORM_ADMIN_EMAIL = $adminEmail
$env:SEED_PLATFORM_ADMIN_PASSWORD = $adminPw

try {
  Run-Step "Migrations and row-level security" "db:deploy"
  Run-Step "Platform admin and demo school" "db:seed"
  Run-Step "Tenant isolation check" "rls:check"

  Write-Host ""
  Write-Host "Production database is ready." -ForegroundColor Green
  Write-Host "Next, add the two database URLs to Vercel (Settings > Environment Variables)."
  if ((Read-Host "Copy DATABASE_URL to the clipboard now? (y/n)") -eq "y") {
    Set-Clipboard -Value $pooledUrl
    Write-Host "Copied. Paste it into Vercel as DATABASE_URL, then press Enter here."
    [void](Read-Host)
  }
  if ((Read-Host "Copy DIRECT_URL to the clipboard now? (y/n)") -eq "y") {
    Set-Clipboard -Value $directUrl
    Write-Host "Copied. Paste it into Vercel as DIRECT_URL, then press Enter here."
    [void](Read-Host)
    Set-Clipboard -Value " "
    Write-Host "Clipboard cleared."
  }
}
finally {
  Remove-Item Env:DIRECT_URL, Env:DATABASE_URL, Env:SEED_PLATFORM_ADMIN_EMAIL, Env:SEED_PLATFORM_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  $ownerPw = $null; $appPw = $null; $adminPw = $null
}
