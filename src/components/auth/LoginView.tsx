import React, { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';

export const LoginView: React.FC = () => {
  const signIn = useAuthStore((state) => state.signIn);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    await signIn(email.trim(), password);
    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-5">
      <section className="w-full max-w-sm bg-white border border-slate-300 shadow-sm p-6" aria-labelledby="login-title">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
          <div className="w-9 h-9 bg-[#003366] text-white flex items-center justify-center">
            <LockKeyhole className="w-4 h-4" />
          </div>
          <div>
            <h1 id="login-title" className="font-bold text-slate-900">PRESYS Catalog Studio</h1>
            <p className="text-xs text-slate-500">Acesso interno</p>
          </div>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-800">
            E-mail
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 rounded-none focus:outline-none focus:border-[#003366]"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 rounded-none focus:outline-none focus:border-[#003366]"
            />
          </label>
          {errorMessage && <p className="text-sm text-red-700" role="alert">{errorMessage}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#003366] text-white py-2 font-semibold disabled:opacity-60 flex items-center justify-center gap-2 rounded-none"
          >
            <LogIn className="w-4 h-4" />
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="mt-5 text-xs text-slate-500 leading-relaxed">
          Contas são criadas e liberadas internamente. Para trocar senha ou solicitar acesso, fale com o administrador.
        </p>
      </section>
    </main>
  );
};
