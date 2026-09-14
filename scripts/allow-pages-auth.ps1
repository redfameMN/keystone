# Adds the public origins (GitHub Pages + milkweed.garden) to the Supabase auth
# redirect allow-list, and points the default Site URL at the custom domain.
$t = (Get-Content "$env:USERPROFILE\.supabase\access-token" -Raw).Trim()
$body = '{"site_url":"https://milkweed.garden","uri_allow_list":"http://localhost:5173,http://127.0.0.1:5173,https://redfamemn.github.io/**,https://milkweed.garden/**,https://www.milkweed.garden/**"}'
$r = Invoke-RestMethod -Method Patch -Uri "https://api.supabase.com/v1/projects/uoagpyprgmcxogobkzuw/config/auth" `
  -Headers @{ Authorization = "Bearer $t" } -ContentType "application/json" -Body $body
$r | Select-Object site_url, uri_allow_list
