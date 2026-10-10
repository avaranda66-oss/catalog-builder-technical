# Multi-provider device BYOK — bounded implementation report
Date 2026-10-09. Branch codex/provider-byok-vault-20261009 based on draft PR #71 HEAD ecda64551debee9586abcfd248d3cd8c989c9f7f.

## Features
- `ProviderCredentialsSettings` is accessible from the experimental Creator's Library page via "Configurar provedores de IA no dispositivo".
- Provider registry: Google Gemini, OpenAI, Anthropic Claude. This is a **credential storage registry**, not a claim that every provider API is integrated yet.
- Add one provider API key via the user's own keyboard; protect with a separate 12+ character vault passphrase; encrypt client-side with PBKDF2-HMAC-SHA256 (310,000 iterations / 16-byte salt), AES-256-GCM (12-byte random nonce), provider-bound associated data; store ciphertext **only** in device/browser IndexedDB.
- Unlock with passphrase, lock on page reload, delete locally. Never store plaintext or passphrase on disk, in URLs, in localStorage or in catalog/session records. Browser memory is not malware/XSS safe; users should not leave a shared device unlocked.
- A future authenticated BYOK gateway must be separately authorized/implemented, with provider-specific endpoint allowlist, durable per-user aggregate spend enforcement, rate limits and tenant isolation. **This PR does not execute a real provider call**.

## Test proofs
- Vitest crypto 7 PASS, including three provider IDs, wrong password, provider-binding and tamper rejection, and unique cipher per save.
- Actual Chromium browser flow with synthetic fake key: encrypted IndexedDB payload never contained fake key/passphrase; wrong password rejected; correct passphrase unlocked; reload reverted to "saved/locked"; removal deleted the record; no external requests. Receipt under scratch/provider-local-byok-proof/result.json.
- React StrictMode effect replay initially caused saved-state invisibility after reload. Found by real browser proof and corrected; precise regression retained.
- User-provided exposed API key was NOT used in tools or source. Attempted tool-mediated use was blocked by platform security; no workaround. User may enter a credential directly into this interface in a future authorized preview, with explicit disclosure that live provider generation is not available yet.

## Release scope and outstanding dependencies
- Parent stacked PR #71 CI 38015158347 FAILED only inherited PR #70 27-page proof waiting for publication READY on Linux. CI other focused gates including local PDF upload test passed. Parent issue must be fixed before merging.
- No merge, live Edge deploy, data migration, external paid Gemini testing or production change.
- A device vault is not a full agent. Further milestones: audited model gateway, PDF fact extraction with source page+bbox and visuals, agent tool operations over cloud Library, role/tenant limits, translations, visual Additel-inspired editorial review, Marc actual human pilot.
