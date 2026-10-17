$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host "\nPERSONAL THINK TANK - AI Version" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is needed. Install the LTS version from https://nodejs.org and run START_WINDOWS.bat again.' -ForegroundColor Yellow
  exit 1
}
if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
  Write-Host 'A separate OpenAI API key is required. Get one at https://platform.openai.com/api-keys' -ForegroundColor Yellow
  Write-Host 'API usage is billed separately from ChatGPT. The key is not saved to disk.'
  $secure = Read-Host 'Paste your OpenAI API key (characters hidden)' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) { Write-Host 'No API key entered.'; exit 1 }
Write-Host 'Starting the local app. Your browser should open automatically.' -ForegroundColor Green
Write-Host 'To stop the local server, press Ctrl+C in this window.'
& node ./server.mjs

