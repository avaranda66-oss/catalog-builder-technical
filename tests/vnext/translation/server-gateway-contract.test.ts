import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const gatewayPath = resolve(process.cwd(), 'supabase/functions/vnext-translation-provider/index.ts');
const gatewaySource = readFileSync(gatewayPath, 'utf8');

describe('W5.A VNext server gateway contract', () => {
  it('uses a server-managed Gemini secret and never a Father/browser credential field', () => {
    expect(gatewaySource).toContain("Deno.env.get('GEMINI_API_KEY')");
    expect(gatewaySource).toContain("'x-goog-api-key': providerSecret");
    expect(gatewaySource).toContain("['apiKey', 'providerSecret', 'geminiKey', 'credential']");
    expect(gatewaySource).toContain('Credenciais de provedor não são aceitas no payload.');
    expect(gatewaySource).not.toContain('localStorage');
    expect(gatewaySource).not.toContain('sessionStorage');
    expect(gatewaySource).not.toContain('console.log');
    expect(gatewaySource).not.toContain('console.error');
  });

  it('uses the shared P2 allowlist/profile with unchanged authentication, roles and bounded request surface', () => {
    expect(gatewaySource).toContain("from '../../../src/vnext/translation/language-registry.ts'");
    expect(gatewaySource).toContain('const CONTRACT_VERSION = VNEXT_TRANSLATION_PROFILES[0].contractVersion');
    expect(gatewaySource).toContain('resolveGatewayProfile(value.sourceLocale, value.targetLocale, value.profileVersion)');
    expect(gatewaySource).toContain('profileVersion === current.profileVersion');
    expect(gatewaySource).toContain('profileVersion === CANONICAL_SPANISH_PROFILE.profileVersion');
    expect(gatewaySource).toContain('maxUnits: 60');
    expect(gatewaySource).toContain('maxCharsPerRun: 4_000');
    expect(gatewaySource).toContain('maxTotalChars: 30_000');
    expect(gatewaySource).toContain("request.headers.get('Authorization')");
    expect(gatewaySource).toContain("profile.role !== 'admin' && profile.role !== 'editor'");
  });

  it('strictly validates provider identity and technical placeholders before returning semantic output', () => {
    expect(gatewaySource).toContain('exactStringSet(request.units.map((unit) => unit.unitId), returnedIds)');
    expect(gatewaySource).toContain('placeholderMultiset(expectedRun.protectedText)');
    expect(gatewaySource).toContain('placeholderMultiset(rawRun.translatedText)');
    expect(gatewaySource).toContain("'INVALID_PROVIDER_RESPONSE'");
    expect(gatewaySource).toContain('providerId: translationProfile.providerId');
    expect(gatewaySource).toContain('modelId: translationProfile.modelId');
  });
});
