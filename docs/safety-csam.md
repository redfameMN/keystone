# Child-safety runbook (operator)

Milkweed screens every uploaded photo with a vision model before it can go live.
When it detects a **minor together with nudity or sexual content**, it treats the
image as **suspected child sexual abuse material (CSAM)** and does the following
automatically:

1. **Removes it from public view** — the image is deleted from the public `photos`
   bucket, so its URL stops working immediately.
2. **Preserves it as evidence** — the bytes are moved to the private `quarantine`
   bucket (not publicly reachable; service-role access only). It is **not deleted**,
   because deleting evidence you are required to report is itself unlawful.
3. **Logs an incident** — a row in `safety_incident` (metadata only: post id, author
   id, timestamp, classifier labels — never the image). This surfaces as a red banner
   in your in-app **Queue** view.
4. The post stays hidden; the poster only sees a generic "didn't pass screening".

## What you must do when an incident appears

**In the United States, an electronic service provider that becomes aware of
apparent CSAM has a legal duty to report it to NCMEC** (National Center for Missing
& Exploited Children) under 18 U.S.C. § 2258A. Knowingly failing to report is a
crime. You are not required (or advised) to investigate or view the content.

1. **Do not open or download the image.** Viewing suspected CSAM is neither necessary
   nor advisable; NCMEC and law enforcement handle the content itself.
2. **File a CyberTipline report** at <https://report.cybertip.org>. Provide the
   metadata from the incident (timestamp, the account's email/id — look the author id
   up in the `profile` / `auth.users` tables via the Supabase dashboard) and note that
   the file is preserved and available to law enforcement on request.
3. **Preserve the evidence** for at least 90 days (the statutory period) — leave the
   file in the `quarantine` bucket; do not delete it. Provide it only to NCMEC/law
   enforcement through proper legal channels.
4. **Handle the account** — consider disabling the user in the Supabase Auth dashboard.
5. In the app, click **Mark reported** on the incident once you have filed.

## Important limits — read before a public launch

- This is a **classifier-based stopgap, not hash-matching.** It catches a broad class
  of content but is not the legal/industry gold standard, which is matching image
  hashes against known-CSAM databases. Before opening Milkweed to the general public
  (beyond friends), enroll in one of:
  - **Microsoft PhotoDNA** (free for vetted orgs; application required) — RECOMMENDED
    for Milkweed. It is a REST API, host-agnostic, so it drops into the `scan-post`
    Edge Function alongside the Claude scan with no re-architecting, and offers an API
    to file the NCMEC report. Apply: https://www.microsoft.com/en-us/photodna/
  - **Cloudflare CSAM Scanning Tool** (free, easy onboarding) — but it only hashes
    images that pass THROUGH Cloudflare's cache. Milkweed serves photos from Supabase
    Storage, not through Cloudflare, so this tool would NOT see them as things are
    built. It would require moving image serving to Cloudflare R2 or proxying storage
    through an orange-clouded domain first. Docs:
    https://developers.cloudflare.com/cache/reference/csam-scanning/
  - A commercial trust-and-safety provider (Thorn Safer, Hive, etc.) — API-based,
    fits the Edge Function model, paid.
- The vision model can miss things or misjudge age. The community **report** button
  and this incident flow are the backstop — keep an eye on both.
- Keep the `quarantine` bucket private and never add a public policy to it.

## Related safety mechanisms already in place

- Every post is quarantined (`status='hidden'`) until screened — enforced by a DB
  trigger, not client code (`enforce_post_status`).
- Rejected adult content (sexual/violence/other) is deleted from the public bucket.
- Photos are EXIF/GPS-stripped in the browser before upload.
- Reports from 3 distinct users auto-hide a live post; per-user report spam is blocked.
- Posting is rate-limited (6/hour, 20/day per account) to blunt spam and scan-cost abuse.
