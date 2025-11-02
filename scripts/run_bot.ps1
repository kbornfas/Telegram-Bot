param(
    [switch]$Watch
)

if (-not $Env:BOT_TOKEN) {
    Write-Error "BOT_TOKEN must be set in the environment."
    exit 1
}

if (-not $Env:TELETHON_API_ID -or -not $Env:TELETHON_API_HASH) {
    Write-Error "TELETHON_API_ID and TELETHON_API_HASH must be set in the environment."
    exit 1
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Error "Python interpreter not found in PATH."
    exit 1
}

$arguments = @('-m', 'src.bot_app')
if ($Watch) {
    Write-Host "Watch mode is not yet implemented; running once."
}

Write-Host "Starting bot..."
python @arguments
