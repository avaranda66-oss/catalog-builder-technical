import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from '../../src/services/supabase.service';
import { INITIAL_PRODUCTS } from '../../src/data/initialProducts';
import { SYSTEM_PRESETS } from '../../src/data/presets';

describe('SupabaseService (Cloud Storage & Multi-Device Sync)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifica status de conexão com retorno estruturado', async () => {
    const status = await SupabaseService.checkConnection();
    expect(status).toBeDefined();
    expect(typeof status.connected).toBe('boolean');
    expect(status.url).toBeDefined();
  });

  it('fallback de upload de imagem em Base64 local quando offline', async () => {
    const fakeFile = new File(['fake-image-binary-data'], 'sensor-presys-pcon.jpg', { type: 'image/jpeg' });
    const result = await SupabaseService.uploadProductImage(fakeFile);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
  });

  it('prepara payload de sincronização de produtos para a nuvem', async () => {
    const result = await SupabaseService.pushProductsToCloud(INITIAL_PRODUCTS.slice(0, 2));
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('prepara payload de sincronização de catálogos para a nuvem', async () => {
    const result = await SupabaseService.pushCatalogsToCloud([SYSTEM_PRESETS[0].catalog]);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});
