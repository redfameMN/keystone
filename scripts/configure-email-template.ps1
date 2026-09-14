# Installs the branded magic-link email (scripts/magic-link-email.html) and subject.
$t = (Get-Content "$env:USERPROFILE\.supabase\access-token" -Raw).Trim()
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = [System.IO.File]::ReadAllText((Join-Path $here "magic-link-email.html"), [System.Text.Encoding]::UTF8)
$butterfly = [char]::ConvertFromUtf32(0x1F98B)
$body = @{
  mailer_subjects_magic_link = "Your Milkweed sign-in link $butterfly"
  mailer_templates_magic_link_content = $html
} | ConvertTo-Json
$r = Invoke-RestMethod -Method Patch -Uri "https://api.supabase.com/v1/projects/uoagpyprgmcxogobkzuw/config/auth" `
  -Headers @{ Authorization = "Bearer $t" } -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
"Template installed. Subject: " + $r.mailer_subjects_magic_link
