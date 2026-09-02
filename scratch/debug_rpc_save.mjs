import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bjxqvrpbigwgabwbhtqa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqeHF2cnBiaWd3Z2Fid2JodHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMzQ3NTQsImV4cCI6MjEwMzcxMDc1NH0.kM5rLBmDlHbG8Wwkw7PAVVMhtg0rEi5n3mLdbcJfyBg';

async function debugRpc() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // 1. Login
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'avaranda66@gmail.com',
    password: 'admin123456'
  });

  console.log('Auth result:', { user: authData?.user?.id, email: authData?.user?.email, error: authError });

  // 2. Query TA-25N
  const { data: catData, error: catError } = await supabase
    .from('catalogs')
    .select('*')
    .eq('id', '3f67436b-103d-43aa-9f1f-cc3880e52fc4')
    .single();

  console.log('TA-25N in db:', { id: catData?.id, version: catData?.version, name: catData?.name });

  // 3. Try to save with save_catalog_v3
  const catalogPayload = {
    id: catData.id,
    title: catData.name,
    subtitle: catData.brand?.subtitle || '',
    themeId: catData.brand?.themeId || 'default-technical',
    pages: catData.brand?.pages || [],
    version: catData.version
  };

  // Modify cover title
  catalogPayload.pages[0].blocks[0].title = 'REALTIME-COVER-A-001';

  console.log('Calling save_catalog_v3 with expectedVersion =', catData.version);

  const { data: rpcData, error: rpcError } = await supabase.rpc('save_catalog_v3', {
    p_catalog: catalogPayload,
    p_expected_version: catData.version,
    p_summary: 'Teste RPC direto'
  });

  console.log('RPC Response:', { rpcData, rpcError });
}

debugRpc().catch(console.error);
