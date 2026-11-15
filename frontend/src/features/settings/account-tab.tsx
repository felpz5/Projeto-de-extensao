import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { useAuth } from '@/features/auth/auth-context';
import { ChangePasswordForm } from '@/features/auth/change-password-form';
import { api, errorMessage } from '@/lib/api';
import { formatDate, ROLE_LABEL } from '@/lib/format';
import { qk, useMe } from '@/lib/queries';
import { ProfileForm } from './profile-form';

export function AccountTab() {
  const { session, switchTenant } = useAuth();
  const me = useMe();
  const queryClient = useQueryClient();

  const accept = useMutation({
    mutationFn: (tenantId: string) => api(`/auth/invitations/${tenantId}/accept`, { method: 'POST' }),
    onSuccess: async (_, tenantId) => {
      toast.success('Convite aceito.');
      await queryClient.invalidateQueries({ queryKey: qk.me });
      if (confirm('Abrir o estabelecimento agora?')) await switchTenant(tenantId);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const decline = useMutation({
    mutationFn: (tenantId: string) => api(`/auth/invitations/${tenantId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Convite recusado.');
      queryClient.invalidateQueries({ queryKey: qk.me });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Meus dados"
          description={session && `Seu acesso neste estabelecimento: ${ROLE_LABEL[session.tenant.role]}`}
        />
        <ProfileForm />
      </Card>

      <Card>
        <CardHeader title="Convites" description="Estabelecimentos que adicionaram você à equipe." />
        {me.isPending ? (
          <Spinner />
        ) : !me.data?.invitations.length ? (
          <EmptyState icon={<Mail aria-hidden />} title="Nenhum convite pendente" />
        ) : (
          <ul className="divide-y divide-navy-800">
            {me.data.invitations.map((inv) => (
              <li key={inv.tenant.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{inv.tenant.name}</p>
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <Badge>{ROLE_LABEL[inv.role]}</Badge> desde {formatDate(inv.invitedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={decline.isPending && decline.variables === inv.tenant.id}
                    onClick={() => decline.mutate(inv.tenant.id)}
                  >
                    Recusar
                  </Button>
                  <Button
                    size="sm"
                    loading={accept.isPending && accept.variables === inv.tenant.id}
                    onClick={() => accept.mutate(inv.tenant.id)}
                  >
                    Aceitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="lg:col-span-2 lg:max-w-xl">
        <CardHeader title="Trocar senha" description="As sessões em outros aparelhos são encerradas." />
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
