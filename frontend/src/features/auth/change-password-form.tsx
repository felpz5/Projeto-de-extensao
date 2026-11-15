import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, PasswordInput } from '@/components/ui/form';
import { api, ApiError } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import { passwordField } from '@/lib/schemas';
import type { Session } from '@/lib/types';
import { useAuth } from './auth-context';
import { PasswordStrength } from './password-strength';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    newPassword: passwordField,
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'As senhas não conferem',
    path: ['confirm'],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'A nova senha precisa ser diferente da atual',
    path: ['newPassword'],
  });
type FormData = z.infer<typeof schema>;

/** Troca a senha. A API encerra as outras sessões e devolve uma nova para este aparelho. */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { applySession } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const newPassword = useWatch({ control, name: 'newPassword' }) ?? '';

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      const session = await api<Session>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
        // A API responde 401 para "Senha atual incorreta": não é sessão expirada.
        refreshOn401: false,
      });
      applySession(session);
      reset();
      toast.success('Senha alterada. As outras sessões foram encerradas.');
      onDone?.();
    } catch (err) {
      // "Senha atual incorreta" (401) aparece no próprio campo.
      if (err instanceof ApiError && err.status === 401) {
        setError('currentPassword', { message: err.message }, { shouldFocus: true });
        return;
      }
      handleFormError(err, setError, ['currentPassword', 'newPassword']);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Senha atual" error={errors.currentPassword?.message}>
        <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
      </Field>
      <div>
        <Field label="Nova senha" error={errors.newPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('newPassword')} />
        </Field>
        <PasswordStrength password={newPassword} />
      </div>
      <Field label="Confirme a nova senha" error={errors.confirm?.message}>
        <PasswordInput autoComplete="new-password" {...register('confirm')} />
      </Field>
      <Button type="submit" loading={isSubmitting}>
        Alterar senha
      </Button>
    </form>
  );
}
