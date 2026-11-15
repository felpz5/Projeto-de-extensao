import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';
import { useMe } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Lista os estabelecimentos do usuário e os convites pendentes. */
export function TenantSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { session, switchTenant } = useAuth();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (tenantId: string) => {
    if (tenantId === session?.tenant.id) return onOpenChange(false);
    setBusy(tenantId);
    try {
      await switchTenant(tenantId);
      onOpenChange(false);
      navigate('/');
      toast.success('Estabelecimento trocado.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const invitations = me.data?.invitations ?? [];
  const managed = me.data?.tenants.filter((t) => t.role === 'OWNER' || t.role === 'MANAGER').length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Estabelecimentos" description="Escolha onde você quer trabalhar agora.">
      <ul className="flex flex-col gap-2">
        {(me.data?.tenants ?? []).map((t) => {
          const current = t.id === session?.tenant.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => choose(t.id)}
                disabled={busy !== null}
                aria-current={current || undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                  current ? 'border-accent bg-accent/10' : 'border-navy-700 hover:bg-navy-800',
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-accent">
                  <Building2 className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="text-xs text-muted">{busy === t.id ? 'Abrindo…' : ROLE_LABEL[t.role]}</span>
                </span>
                {current && <Check className="size-4 text-accent" aria-label="Atual" />}
              </button>
            </li>
          );
        })}
      </ul>
      {managed > 1 && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => {
            onOpenChange(false);
            navigate('/lojas');
          }}
        >
          <Building2 aria-hidden /> Ver resumo de todas as lojas
        </Button>
      )}
      {invitations.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge tone="warning">{invitations.length}</Badge> convite(s) pendente(s).
          <button
            type="button"
            className="font-semibold text-accent hover:underline"
            onClick={() => {
              onOpenChange(false);
              queryClient.invalidateQueries({ queryKey: ['me'] });
              navigate('/configuracoes?aba=conta');
            }}
          >
            Ver convites
          </button>
        </p>
      )}
    </Dialog>
  );
}
