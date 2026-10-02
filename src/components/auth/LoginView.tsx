import React, { FormEvent, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import '@/vnext/app/product-primitives.css';

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
    <main className="vnext-login-shell">
      <section className="vnext-login-card" aria-labelledby="login-title">
        <div className="vnext-brand">
          <div className="vnext-brand-mark">
            <LockKeyhole size={18} aria-hidden="true" />
          </div>
          <div>
            <p className="vnext-dialog-eyebrow">PRESYS · Catalog Builder</p>
            <h1 id="login-title">Acesse seus catálogos</h1>
          </div>
        </div>
        <p className="vnext-login-intro">Entre com sua conta de trabalho para criar e editar catálogos técnicos.</p>
        <form className="vnext-form" onSubmit={handleSubmit}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {errorMessage && <p className="vnext-status" data-tone="error" role="alert">{errorMessage}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="vnext-btn-primary"
          >
            <LogIn size={17} aria-hidden="true" />
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="vnext-login-help">
          Contas são criadas e liberadas internamente. Para trocar senha ou solicitar acesso, fale com o administrador.
        </p>
      </section>
    </main>
  );
};
