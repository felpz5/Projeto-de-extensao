import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput } from '@/components/ui/form';
import { ApiError, errorMessage } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import { emailField } from '@/lib/schemas';
import { useAuth } from './auth-context';
import { AuthLayout } from './auth-layout';

const schema = z.object({
  email: emailField,
  password: z.string().min(1, 'Informe a senha'),
});
type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  // Senha errada, conta bloqueada ou limite de tentativas: aparece fixo no formulário
  // (um toast some antes de a pessoa ler).
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // Depois do login, o GuestOnly (guards.tsx) leva para a página de origem ou para a troca de senha.
  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    try {
      await login(data);
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 429].includes(err.status)) {
        setFormError(errorMessage(err));
        setValue('password', '');
      } else {
        handleFormError(err, setError, ['email', 'password']);
      }
    }
  });

  return (
    <AuthLayout
      side="login"
      title="Entrar"
      description="Acesse o estoque e as vendas do seu estabelecimento."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-accent hover:underline">
            Cadastre seu estabelecimento
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {formError && (
          <div role="alert" className="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </div>
        )}
        <Field label="E-mail" error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" placeholder="voce@loja.com.br" autoFocus {...register('email')} />
        </Field>
        <Field label="Senha" error={errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" loading={isSubmitting} className="group mt-1">
          Entrar
          <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden />
        </Button>

        {/* Atalho só no `npm run dev`: preenche a conta da açaiteria de demonstração (seed). */}
        {import.meta.env.DEV && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue('email', 'demo@gestock.app');
              setValue('password', 'gestock123');
            }}
          >
            <FlaskConical aria-hidden /> Preencher conta de demonstração
          </Button>
        )}
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Esqueceu a senha? A recuperação por e-mail ainda não está disponível.
      </p>
    </AuthLayout>
  );
}
