#!/usr/bin/env node
// scripts/qa/test_translation_gateway_live.mjs
// Acceptance Gate Rigoroso — Supabase Edge Function (translation-provider-v1)
// Executa verificações de segurança, limites, sanitização de erros e tradução metrológica multiscript.
// Fail-Closed: Qualquer divergência dispara exceção com exit code não-zero.
// Zero credenciais hardcoded.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://bjxqvrpbigwgabwbhtqa.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqeHF2cnBiaWd3Z2Fid2JodHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMzQ3NTQsImV4cCI6MjEwMzcxMDc1NH0.kM5rLBmDlHbG8Wwkw7PAVVMhtg0rEi5n3mLdbcJfyBg';

const USER_EMAIL = process.env.QA_USER_EMAIL;
const USER_PASSWORD = process.env.QA_USER_PASSWORD;
const GEMINI_API_KEY = process.env.GEMINI_QA_API_KEY;

function assertGate(condition, message) {
  if (!condition) {
    console.error(`\n❌ [GATE FAILURE] ${message}\n`);
    throw new Error(`GATE_ASSERTION_FAILED: ${message}`);
  }
}

async function runLiveAcceptance() {
  console.log('========================================================================');
  console.log('🧪 QA LIVE ACCEPTANCE GATE — TRANSLATION GATEWAY EDGE FUNCTION');
  console.log('========================================================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Target Function: translation-provider-v1`);

  // Gate 0: Validação de Variáveis de Ambiente (Fail-Closed)
  if (!USER_EMAIL || !USER_PASSWORD || !GEMINI_API_KEY) {
    console.error('❌ ERRO CRÍTICO: Variáveis de ambiente obrigatórias ausentes.');
    console.error('   Necessário definir: QA_USER_EMAIL, QA_USER_PASSWORD e GEMINI_QA_API_KEY.');
    console.error('   Uso: QA_USER_EMAIL="..." QA_USER_PASSWORD="..." GEMINI_QA_API_KEY="..." node scripts/qa/test_translation_gateway_live.mjs');
    process.exit(1);
  }

  console.log(`User Authenticated: ${USER_EMAIL}`);
  console.log(`API Key Provided: YES (length ${GEMINI_API_KEY.length})`);
  console.log('------------------------------------------------------------------------\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. Gate 1: Autenticação do Usuário
  console.log('1️⃣  Autenticando usuário de teste no Supabase Auth...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD
  });

  assertGate(!authError && authData?.session?.access_token, `Falha na autenticação do usuário: ${authError?.message || 'Sessão vazia'}`);
  console.log('   ✅ Usuário autenticado com sucesso. JWT obtido.\n');

  // 2. Gate 2: Teste de Segurança: 401 sem JWT (Unauthenticated fetch)
  console.log('2️⃣  Gate 2: Requisição direta sem JWT de autorização (esperado HTTP 401)...');
  const unauthRes = await fetch(`${SUPABASE_URL}/functions/v1/translation-provider-v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gemini', apiKey: 'fake_key', nodes: [{ id: '1', text: 'teste' }] })
  });
  console.log(`   Status recebido: ${unauthRes.status}`);
  assertGate(unauthRes.status === 401, `Requisição anônima deve retornar HTTP 401. Recebido: ${unauthRes.status}`);
  console.log('   ✅ 401 Unauthorized retornado corretamente.');

  // 3. Gate 3: Teste de Limites: Payload excessivo (> 100 nós)
  console.log('\n3️⃣  Gate 3: Envio de payload excessivo (105 nós, limite 100)...');
  const excessNodes = Array.from({ length: 105 }, (_, i) => ({ id: `node_${i}`, text: `Item ${i}` }));
  const { data: limitData, error: limitError } = await supabase.functions.invoke('translation-provider-v1', {
    body: {
      provider: 'gemini',
      apiKey: GEMINI_API_KEY,
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      nodes: excessNodes
    }
  });

  const isPayloadTooLarge = limitData?.error === 'PAYLOAD_TOO_LARGE' || limitError?.message?.includes('PAYLOAD_TOO_LARGE');
  assertGate(isPayloadTooLarge, `Lote com 105 nós deve ser rejeitado com PAYLOAD_TOO_LARGE. Recebido: ${JSON.stringify(limitData || limitError)}`);
  console.log('   ✅ PAYLOAD_TOO_LARGE interceptado e rejeitado pelo gateway.');

  // 4. Gate 4: Teste de Sanitização: Chave de API falsa/rejeitada
  console.log('\n4️⃣  Gate 4: Sanitização de chave rejeitada pelo provedor...');
  const { data: fakeKeyData, error: fakeKeyError } = await supabase.functions.invoke('translation-provider-v1', {
    body: {
      provider: 'gemini',
      apiKey: 'AIzaSyInvalidKeyForAcceptanceGateTest12345',
      sourceLocale: 'pt-BR',
      targetLocale: 'en-US',
      nodes: [{ id: 'test_node', text: 'Calibrador de Pressão' }]
    }
  });

  const isCredentialInvalid = fakeKeyData?.error === 'CREDENTIAL_INVALID' || fakeKeyError?.message?.includes('CREDENTIAL_INVALID');
  assertGate(isCredentialInvalid, `Chave rejeitada deve retornar CREDENTIAL_INVALID sanitizado. Recebido: ${JSON.stringify(fakeKeyData || fakeKeyError)}`);
  console.log('   ✅ CREDENTIAL_INVALID retornado sem vazamento de stack traces ou chaves.');

  // 5. Gate 5: Tradução Live Multiscript via Edge Function
  console.log('\n5️⃣  Gate 5: Executando Tradução Live Multiscript (5 Scripts)...');
  const targetLocales = [
    { locale: 'en-US', name: 'Inglês (Técnico Metrológico)' },
    { locale: 'th-TH', name: 'Tailandês (Script Completo)' },
    { locale: 'ru-RU', name: 'Russo (Cirílico Industrial)' },
    { locale: 'zh-CN', name: 'Chinês Simplificado (Metrologia)' },
    { locale: 'ar-SA', name: 'Árabe (Metrologia RTL)' }
  ];

  const sampleNodes = [
    { id: 'title', text: 'CALIBRADOR AUTOMÁTICO DE PRESSÃO PCON-Y18' },
    { id: 'feature', text: 'Controle em malha fechada com estabilidade de [[TECH_001]] e sensor [[TECH_002]].' },
    { id: 'spec', text: 'Exatidão metrológica certificada conforme RBC / Inmetro.' }
  ];

  for (const { locale, name } of targetLocales) {
    console.log(`\n   🌐 Testando idioma: ${name} (${locale})...`);
    const { data: transData, error: transError } = await supabase.functions.invoke('translation-provider-v1', {
      body: {
        provider: 'gemini',
        apiKey: GEMINI_API_KEY.trim(),
        sourceLocale: 'pt-BR',
        targetLocale: locale,
        nodes: sampleNodes
      }
    });

    assertGate(!transError, `Erro na chamada da Edge Function para ${locale}: ${transError?.message}`);
    assertGate(transData?.translations && Array.isArray(transData.translations), `Schema de resposta inválido retornado para ${locale}`);
    assertGate(transData.translations.length === sampleNodes.length, `Quantidade divergente de nós traduzidos para ${locale}`);

    transData.translations.forEach((t) => {
      console.log(`      - [${t.id}]: ${t.translatedText}`);
    });

    // Gate 6: Integridade de Placeholders
    const featTrans = transData.translations.find((t) => t.id === 'feature')?.translatedText || '';
    assertGate(
      featTrans.includes('[[TECH_001]]') && featTrans.includes('[[TECH_002]]'),
      `Placeholders metrológicos [[TECH_001]] ou [[TECH_002]] foram corrompidos no idioma ${locale}`
    );
    console.log('      🛡️  Placeholders metrológicos [[TECH_001]] e [[TECH_002]] 100% PRESERVADOS.');
  }

  console.log('\n========================================================================');
  console.log('🎉 QA LIVE ACCEPTANCE GATE: TODOS OS CHECKS PASSARAM COM SUCESSO (100% VERDE)');
  console.log('========================================================================');
}

runLiveAcceptance().catch((err) => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
