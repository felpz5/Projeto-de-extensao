import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './auth-layout';
import { useAuth } from './auth-context';
import { ChangePasswordForm } from './change-password-form';

/** Primeiro acesso com senha provisória (conta criada pelo dono do estabelecimento). */
export function ChangePasswordPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <AuthLayout
      side="password"
      title="Crie sua senha"
      description={`Olá, ${session?.user.name ?? ''}! Sua conta foi criada com uma senha provisória. Escolha uma senha só sua para continuar.`}
      footer={
        <Button variant="ghost" size="sm" onClick={() => logout()}>
          Sair
        </Button>
      }
    >
      <ChangePasswordForm onDone={() => navigate('/', { replace: true })} />
    </AuthLayout>
  );
}
