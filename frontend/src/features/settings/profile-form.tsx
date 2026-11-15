import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { api, ApiError } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import { qk } from '@/lib/queries';
import { emailField } from '@/lib/schemas';
import type { SessionUser } from '@/lib/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: emailField,
  currentPassword: z.string(),
});
type FormData = z.infer<typeof schema>;

/** Editar o próprio nome e e-mail (o e-mail é o login: trocar pede a senha atual). */
export function ProfileForm() {
  const { session, applySession } = useAuth();
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: session?.user.name ?? '', email: session?.user.email ?? '', currentPassword: '' },
  });
  const email = useWatch({ control, name: 'email' });
  const emailChanged = email.trim().toLowerCase() !== session?.user.email;

  const onSubmit = handleSubmit(async (d) => {
    if (!session) return;
    if (emailChanged && !d.currentPassword) {
      setError('currentPassword', { message: 'Informe a senha atual para trocar o e-mail' });
      return;
    }
    try {
      const user = await api<SessionUser>('/auth/me', {
        method: 'PATCH',
        body: {
          name: d.name,
          email: emailChanged ? d.email : undefined,
          currentPassword: emailChanged ? d.currentPassword : undefined,
        },
      });
      applySession({ ...session, user: { ...session.user, ...user } });
      queryClient.invalidateQueries({ queryKey: qk.me });
      reset({ name: user.name, email: user.email, currentPassword: '' });
      toast.success(emailChanged ? 'Dados salvos. Use o novo e-mail no próximo login.' : 'Dados salvos.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && /senha/i.test(err.message)) {
        setError('currentPassword', { message: err.message }, { shouldFocus: true });
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setError('email', { message: err.message }, { shouldFocus: true });
        return;
      }
      handleFormError(err, setError, ['name', 'email', 'currentPassword']);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Nome" error={errors.name?.message}>
        <Input autoComplete="name" {...register('name')} />
      </Field>
      <Field label="E-mail" error={errors.email?.message} hint="É com ele que você entra no sistema.">
        <Input type="email" inputMode="email" autoComplete="email" {...register('email')} />
      </Field>
      {emailChanged && (
        <Field label="Senha atual" error={errors.currentPassword?.message} hint="Necessária para trocar o e-mail.">
          <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
        </Field>
      )}
      <Button type="submit" className="self-start" loading={isSubmitting} disabled={!isDirty}>
        Salvar
      </Button>
    </form>
  );
}
