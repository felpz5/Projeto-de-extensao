import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, Notice, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { api, errorMessage } from '@/lib/api';
import { formatDate, ROLE_LABEL } from '@/lib/format';
import { handleFormError } from '@/lib/forms';
import { qk } from '@/lib/queries';
import { emailField, passwordField } from '@/lib/schemas';
import type { Member, MembershipStatus } from '@/lib/types';

const STATUS: Record<MembershipStatus, { label: string; tone: 'success' | 'neutral' | 'warning' }> = {
  ACTIVE: { label: 'Ativo', tone: 'success' },
  DISABLED: { label: 'Desativado', tone: 'neutral' },
  INVITED: { label: 'Convite pendente', tone: 'warning' },
};

export function TeamTab() {
  const { isOwner, isManager, session } = useAuth();
  const [resetting, setResetting] = useState<Member | null>(null);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const query = useQuery({ queryKey: qk.members, queryFn: () => api<Member[]>('/tenant/members') });

  const update = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: object }) =>
      api(`/tenant/members/${userId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast.success('Acesso atualizado.');
      queryClient.invalidateQueries({ queryKey: qk.members });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api(`/tenant/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Membro removido.');
      queryClient.invalidateQueries({ queryKey: qk.members });
      setRemoving(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader
        title="Equipe"
        description="Dono: tudo · Gerente: cadastros, estoque, relatórios, previsão e os funcionários da equipe · Funcionário: vendas, caixa e entrada de mercadoria."
        action={
          isManager && (
            <Button onClick={() => setAdding(true)}>
              <UserPlus aria-hidden /> Adicionar
            </Button>
          )
        }
      />
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Pessoa</Th>
              <Th>Papel</Th>
              <Th>Situação</Th>
              <Th>Desde</Th>
              {isManager && <Th className="sr-only">Ações</Th>}
            </tr>
          </thead>
          <tbody>
            {query.data.map((m) => {
              // Dono: todos menos ele mesmo. Gerente: só funcionários.
              const editable =
                m.role !== 'OWNER' &&
                m.user.id !== session?.user.id &&
                (isOwner || (isManager && m.role === 'STAFF'));
              return (
                <Tr key={m.id}>
                  <Td>
                    <p className="font-medium">{m.user.name}</p>
                    <p className="text-xs text-muted">{m.user.email}</p>
                  </Td>
                  <Td>
                    {editable && isOwner ? (
                      <Select
                        aria-label={`Papel de ${m.user.name}`}
                        className="h-9 w-40"
                        value={m.role}
                        onChange={(e) => update.mutate({ userId: m.user.id, body: { role: e.target.value } })}
                      >
                        <option value="MANAGER">Gerente</option>
                        <option value="STAFF">Funcionário</option>
                      </Select>
                    ) : (
                      ROLE_LABEL[m.role]
                    )}
                  </Td>
                  <Td>
                    <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
                  </Td>
                  <Td className="text-muted">{formatDate(m.createdAt)}</Td>
                  {isManager && (
                    <Td className="whitespace-nowrap text-right">
                      {editable && m.status !== 'INVITED' && (
                        <Button variant="ghost" size="sm" onClick={() => setResetting(m)}>
                          <KeyRound aria-hidden /> Senha
                        </Button>
                      )}
                      {editable && m.status !== 'INVITED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            update.mutate({
                              userId: m.user.id,
                              body: { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' },
                            })
                          }
                        >
                          {m.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                        </Button>
                      )}
                      {editable && (
                        <Button variant="ghost" size="icon" onClick={() => setRemoving(m)} aria-label={`Remover ${m.user.name}`}>
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </Td>
                  )}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <AddMemberDialog open={adding} onOpenChange={setAdding} canAddManager={isOwner} />
      {resetting && <ResetPasswordDialog member={resetting} onClose={() => setResetting(null)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remover ${removing?.user.name}?`}
        description="A pessoa perde o acesso a este estabelecimento. A conta dela continua existindo."
        confirmLabel="Remover"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.user.id)}
      />
    </Card>
  );
}

const addSchema = z.object({
  email: emailField,
  role: z.enum(['MANAGER', 'STAFF']),
  name: z.string().trim().max(120),
  password: z.union([z.literal(''), passwordField]),
});
type AddForm = z.infer<typeof addSchema>;

function AddMemberDialog({
  open,
  onOpenChange,
  canAddManager,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Gerente só adiciona funcionário. */
  canAddManager: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { email: '', role: 'STAFF', name: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: (body: object) => api<{ status: MembershipStatus }>('/tenant/members', { method: 'POST', body }),
    onSuccess: (m) => {
      toast.success(
        m.status === 'INVITED'
          ? 'Convite enviado. A pessoa aceita ao entrar na conta dela.'
          : 'Conta criada. Passe a senha provisória para a pessoa — ela vai trocar no primeiro acesso.',
      );
      queryClient.invalidateQueries({ queryKey: qk.members });
      reset();
      onOpenChange(false);
    },
    onError: (err) => handleFormError(err, setError, ['email', 'role', 'name', 'password']),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar à equipe"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="member-form" loading={mutation.isPending}>
            Adicionar
          </Button>
        </>
      }
    >
      <form
        id="member-form"
        onSubmit={handleSubmit((d) =>
          mutation.mutate({
            email: d.email,
            role: d.role,
            name: d.name || undefined,
            password: d.password || undefined,
          }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <Field label="E-mail" error={errors.email?.message}>
          <Input type="email" autoFocus {...register('email')} />
        </Field>
        <Field label="Papel" error={errors.role?.message}>
          <Select {...register('role')}>
            <option value="STAFF">Funcionário</option>
            {canAddManager && <option value="MANAGER">Gerente</option>}
          </Select>
        </Field>
        <Notice>
          Se a pessoa já tem conta no Gestock, ela recebe um convite. Se ainda não tem, preencha nome
          e uma senha provisória.
        </Notice>
        <Field label="Nome" error={errors.name?.message} hint="Só para conta nova.">
          <Input autoComplete="off" {...register('name')} />
        </Field>
        <Field label="Senha provisória" error={errors.password?.message} hint="Só para conta nova. Mínimo 8 caracteres.">
          <Input type="text" autoComplete="new-password" {...register('password')} />
        </Field>
      </form>
    </Dialog>
  );
}

/** Gera uma senha provisória fácil de ditar (sem caracteres confundíveis como 0/O, 1/l). */
function suggestPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const random = new Uint32Array(10);
  crypto.getRandomValues(random);
  const s = Array.from(random, (n) => chars[n % chars.length]).join('');
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/**
 * Senha provisória para quem esqueceu a dele. A pessoa troca no próximo acesso e as sessões
 * abertas dela são encerradas. Só funciona para contas usadas apenas neste estabelecimento.
 */
function ResetPasswordDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const [password, setPassword] = useState(suggestPassword);
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      api(`/tenant/members/${member.user.id}/password`, { method: 'POST', body: { password } }),
    onSuccess: () => setDone(true),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Nova senha para ${member.user.name}`}
      description={done ? undefined : 'Use quando a pessoa esqueceu a senha. Ela vai trocar no próximo acesso.'}
      footer={
        done ? (
          <Button onClick={onClose}>Pronto</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={mutation.isPending} disabled={password.length < 8} onClick={() => mutation.mutate()}>
              Definir senha provisória
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3 text-sm">
          <p>Senha provisória definida. Passe para {member.user.name.split(' ')[0]}:</p>
          <p className="tabular select-all rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-center text-lg font-bold tracking-wider">
            {password}
          </p>
          <p className="text-muted">
            No próximo acesso ela cria uma senha própria. As sessões abertas em outros aparelhos foram
            encerradas.
          </p>
        </div>
      ) : (
        // O <Field> liga o rótulo ao primeiro filho: o campo fica sozinho dentro dele.
        <div className="flex items-start gap-2">
          <Field
            className="flex-1"
            label="Senha provisória"
            hint="Mínimo 8 caracteres. Sugerimos uma fácil de ditar."
          >
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className="tabular"
            />
          </Field>
          <Button
            variant="secondary"
            size="icon"
            className="mt-7"
            onClick={() => setPassword(suggestPassword())}
            aria-label="Gerar outra senha"
          >
            <RefreshCw aria-hidden />
          </Button>
        </div>
      )}
    </Dialog>
  );
}
