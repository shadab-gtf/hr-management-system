# Scraping specification

Status: disabled by default; optional public research only · Owner: Integration Owner + Privacy · Updated: 2026-09-28

## Purpose and boundary

The HR platform does not need scraping to operate. Employee, payroll, attendance, bank, and identity data must come from approved internal sources or contractual APIs. The company website was read for this planning task; no recurring crawler is installed or authorized by this document.

A future crawler may monitor approved public statutory notices or company content for human review. It must not scrape employee social profiles, candidate background information, authenticated portals, biometric data, competitor customer data, or financial systems. Use an official feed/API/download first when available. Do not evade authentication, anti-bot controls, or site restrictions.

## Source onboarding

Before enabling a source, record: source owner, allowed hostname/path list, intended data fields, lawful purpose, terms/robots review, update frequency, contact/user-agent identity, retention, reviewer, and stop conditions. `robots.txt` is an operational signal, not a legal authorization. Private sites require an explicit integration agreement.

Initial candidate categories are GTF-owned public branding pages and official government publication indexes. There are no approved automated source URLs yet. Exact URLs and extraction selectors must be fixture-tested and approved per source; broad wildcard crawling is disallowed.

## Fetch pipeline

Scheduler → allowlist validation → DNS/IP and redirect validation → conditional fetch → size/type validation → text extraction → quarantine → checksum/diff → review queue → approved knowledge record.

Baseline operating limits: one concurrent request per host, no more than one request every five seconds, maximum 20 pages per scheduled run, maximum 5 MiB response, ten-second connect/read budget, and at most two transient retries with exponential backoff. These are conservative engineering defaults, not a grant to crawl. Respect stricter source terms, `Retry-After`, and operator limits. Stop on CAPTCHA, access denial, repeated errors, or policy change.

Validate resolved addresses at each connection and redirect; reject localhost, private/link-local ranges, cloud metadata targets, unsupported schemes, URL credentials, and off-allowlist destinations. Disable arbitrary browser execution, form submission, and downloaded executable content. Use a sandboxed parser for approved PDF sources and enforce decompression/page limits.

## Extracted record

Fields: source URL, final URL, publisher, title, publication date if explicit, fetch timestamp, content checksum, extract version, language, short summary, effective-date candidates, source artifact reference, and review status. Unknown dates remain unknown; fetch time is not publication or legal commencement time.

Statuses: `fetched → extracted → review_required → approved | rejected | superseded`. A changed checksum creates a new version and review task. A failed extraction leaves the last approved version intact with a stale marker. Content containing instructions is untrusted data, never a command to the system or assistant.

## No automatic payroll or policy updates

A notice may propose a rule-review task. Only a qualified reviewer can map jurisdiction, coverage, effective period, formula, rounding, and applicability into a statutory rule version. A second Finance approver publishes it after regression tests. A public notice never directly changes employee balances or payroll calculations.

## Verification and operation

Tests cover redirect SSRF, DNS changes, robots denial, 429 handling, oversized/decompression payloads, selector drift, malformed encoding, duplicate content, removed notices, and misleading date text. Metrics include fetch status, extraction success, age of last reviewed source, changed content count, and rate-limit hits. No full sensitive payloads in logs.

Kill switch disables schedules and in-flight retries. Retain only necessary evidence, honor approved takedown/retention rules, and audit source additions. [Data sources](data-sources.md) remains authoritative for production ingestion.
