import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, Coffee, IceCreamCone, Sandwich, ShoppingBasket, Store, type LucideIcon } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput } from '@/components/ui/form';
import { handleFormError } from '@/lib/forms';
import { emailField, passwordField } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { useAuth } from './auth-context';
import { AuthLayout } from './auth-layout';
import { PasswordStrength } from './password-strength';

export const SEGMENTS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'acaiteria', label: 'Açaiteria', icon: IceCreamCone },
  { value: 'sorveteria', label: 'Sorveteria', icon: IceCreamCone },
  { value: 'lanchonete', label: 'Lanchonete', icon: Sandwich },
  { value: 'cafeteria', label: 'Cafeteria', icon: Coffee },
  { value: 'mercado', label: 'Mercado', icon: ShoppingBasket },
  { value: 'outro', label: 'Outro', icon: Store },
];

const schema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome').max(120),
    email: emailField,
    password: passwordField,
    confirm: z.string().min(1, 'Repita a senha'),
    establishmentName: z.string().trim().min(2, 'Informe o nome do estabelecimento').max(120),
    segment: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'As senhas não conferem',
    path: ['confirm'],
  });
type FormData = z.infer<typeof schema>;

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { segment: 'acaiteria' },
  });
  const password = useWatch({ control, name: 'password' }) ?? '';
  const confirm = useWatch({ control, name: 'confirm' }) ?? '';
  const segment = useWatch({ control, name: 'segment' });

  // Depois do cadastro o GuestOnly (guards.tsx) leva para o painel.
  const onSubmit = handleSubmit(async ({ confirm: _confirm, segment, ...data }) => {
    try {
      await createAccount({
        ...data,
        segment: segment || undefined,
        // O fuso do navegador costuma ser o da loja; dá para mudar depois nas configurações.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch (err) {
      handleFormError(err, setError, ['name', 'email', 'password', 'establishmentName', 'segment']);
    }
  });

  return (
    <AuthLayout
      side="register"
      title="Criar conta"
      description="Você será o dono do estabelecimento e poderá convidar a equipe depois."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-semibold text-accent hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-7" noValidate>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent/15 text-[11px]">1</span>
            Seus dados
          </legend>
          <Field label="Seu nome" error={errors.name?.message}>
            <Input autoComplete="name" placeholder="Como a equipe vai te ver" autoFocus {...register('name')} />
          </Field>
          <Field label="E-mail" error={errors.email?.message} hint="É com ele que você entra no sistema.">
            <Input type="email" inputMode="email" autoComplete="email" placeholder="voce@loja.com.br" {...register('email')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Field label="Senha" error={errors.password?.message}>
                <PasswordInput autoComplete="new-password" {...register('password')} />
              </Field>
              <PasswordStrength password={password} />
            </div>
            <div>
              <Field label="Confirme a senha" error={errors.confirm?.message}>
                <PasswordInput autoComplete="new-password" {...register('confirm')} />
              </Field>
              {confirm && password && confirm === password && !errors.confirm && (
                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-success">
                  <Check className="size-3.5" aria-hidden /> As senhas conferem
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent/15 text-[11px]">2</span>
            Seu estabelecimento
          </legend>
          <Field label="Nome do estabelecimento" error={errors.establishmentName?.message}>
            <Input autoComplete="organization" placeholder="Ex.: Açaí do Centro" {...register('establishmentName')} />
          </Field>

          <div role="radiogroup" aria-label="Segmento" className="grid grid-cols-3 gap-2">
            {SEGMENTS.map((s) => {
              const selected = segment === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setValue('segment', s.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-medium transition-all duration-200',
                    selected
                      ? 'scale-[1.03] border-accent bg-accent/15 text-accent shadow-lg shadow-accent/10'
                      : 'border-navy-700 bg-navy-900 text-muted hover:border-navy-600 hover:text-white',
                  )}
                >
                  <s.icon className="size-5" aria-hidden />
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Button type="submit" size="lg" loading={isSubmitting} className="group">
          Criar conta
          <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden />
        </Button>
      </form>
    </AuthLayout>
  );
}
