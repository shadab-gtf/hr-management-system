# AdMob specification

Status: intentionally disabled for internal HR · Owner: Product + Security/Privacy · Updated: 2026-09-28

## Decision

GTF HR is an internal employee system. Its default monetization model is company-funded operation, with **no advertisements**. AdMob is not a requirement for HR, payroll, attendance, or self-service. This document covers the requested topic explicitly; it does not authorize installing an advertising SDK or opening an ad account.

## Current implementation contract

- No AdMob SDK/package, advertising identifier collection, mediation SDK, ad network request, remote ad script, rewarded ad, interstitial, banner, or tracking pixel.
- No advertising placeholders or blank slots in layouts; employee tasks and payroll access cannot depend on viewing ads.
- No employee profile, department, salary, attendance, medical, location, tax, performance, or helpdesk information sent to advertising services.
- No advertising account credentials or app/ad-unit IDs in configuration.
- Optional feature flags must default false, but the stronger initial control is that ad code is absent from the dependency graph and builds.

Operational analytics, if approved, use minimal first-party events and never become ad targeting. Public company marketing systems are a separate product boundary; their presence on the company website is not permission to include them in HR.

## Future reconsideration gate

Only a separately scoped public consumer application could justify reconsideration. Product must document audience, revenue model, why advertising is appropriate, ad-free alternatives, data flows, age handling, consent/permission requirements, platform/store disclosures, SDK supply-chain review, and current official AdMob policies. Security/Privacy must review current requirements at that time; this document deliberately contains no unverified SDK or policy integration instructions.

Even if a separate public product is approved, authenticated employee/payroll screens remain ad-free unless GTF explicitly revises that product/security decision after review. Rewarding attendance, approvals, access to payslips, or essential HR services with ads is prohibited in this specification.

## Verification

Dependency/SBOM review finds no ad SDK. Network capture across sign-in, attendance, leave, payroll, and downloads finds no ad endpoints. CSP/connect-src reflects only approved service origins. App privacy declarations match actual behavior. A failed check blocks release and creates a security/privacy defect, not an unexplained exception.

Decision record: ADR-008 in [decisions](decisions.md). No advertising implementation task is active.
