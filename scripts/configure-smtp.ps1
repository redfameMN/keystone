# Configures Supabase Auth to send via Resend as hello@milkweed.garden.
# Reads the Resend API key from ~/.resend_key (save it first with:
#   Set-Content -Path "$env:USERPROFILE\.resend_key" -Value "re_YOUR_KEY")
# Also raises the auth email rate limit to 30/hour.
$t = (Get-Content "$env:USERPROFILE\.supabase\access-token" -Raw).Trim()
$key = (Get-Content "$env:USERPROFILE\.resend_key" -Raw -ErrorAction Stop).Trim()
if ($key -notlike "re_*") { Write-Error "~/.resend_key doesn't look like a Resend key (should start with re_)"; exit 1 }
$body = @{
  external_email_enabled = $true
  smtp_admin_email = "hello@milkweed.garden"
  smtp_sender_name = "Milkweed"
  smtp_host = "smtp.resend.com"
  smtp_port = "465"
  smtp_user = "resend"
  smtp_pass = $key
  rate_limit_email_sent = 30
} | ConvertTo-Json
$r = Invoke-RestMethod -Method Patch -Uri "https://api.supabase.com/v1/projects/uoagpyprgmcxogobkzuw/config/auth" `
  -Headers @{ Authorization = "Bearer $t" } -ContentType "application/json" -Body $body
"SMTP configured:"
$r | Select-Object smtp_host, smtp_admin_email, smtp_sender_name, rate_limit_email_sent
