import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from '../../src/services/supabase.service';
import { MOCK_PRODUCTS, MOCK_CATALOG } from '../fixtures/mockData';

describe('SupabaseService (Isolamento Estrito em Teste & Mocking Total)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('verifica status de conexão com retorno estruturado via mock', async () => {
    const status = await SupabaseService.checkConnection();
    expect(status).toBeDefined();
    expect(typeof status.connected).toBe('boolean');
    expect(status.url).toBeDefined();
  });

  it('realiza upload simulado de imagem sem chamada de rede real', async () => {
    const fakeFile = new File(['fake-binary-content'], 'sensor-presys-test.jpg', { type: 'image/jpeg' });
    const result = await SupabaseService.uploadProductImage(fakeFile);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
    expect(typeof result.url).toBe('string');
  });

  it('prepara e executa sincronização de produtos via mock em memória', async () => {
    const result = await SupabaseService.pushProductsToCloud(MOCK_PRODUCTS);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(result.success).toBe(true);
  });

  it('prepara e executa sincronização de catálogos via mock em memória', async () => {
    const result = await SupabaseService.pushCatalogsToCloud([MOCK_CATALOG]);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(result.success).toBe(true);
  });

  it('bloqueia e impede chamadas de rede externas de produção durante testes', async () => {
    // Garante que a barreira de segurança global do tests/setup.ts funciona
    await expect(async () => {
      await fetch('https://bjxqvrpbigwgabwbhtqa.supabase.co/rest/v1/products');
    }).rejects.toThrow(/Live network call prohibited in unit test suite/);
  });
});
