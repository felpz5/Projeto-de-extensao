import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
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
  const { isOwner, session } = useAuth();
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
        description="Dono: tudo · Gerente: cadastros, estoque, relatórios e previsão · Funcionário: vendas e entradas de estoque."
        action={
          isOwner && (
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
              {isOwner && <Th className="sr-only">Ações</Th>}
            </tr>
          </thead>
          <tbody>
            {query.data.map((m) => {
              const editable = isOwner && m.role !== 'OWNER' && m.user.id !== session?.user.id;
              return (
                <Tr key={m.id}>
                  <Td>
                    <p className="font-medium">{m.user.name}</p>
                    <p className="text-xs text-muted">{m.user.email}</p>
                  </Td>
                  <Td>
                    {editable ? (
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
                  {isOwner && (
                    <Td className="whitespace-nowrap text-right">
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

      <AddMemberDialog open={adding} onOpenChange={setAdding} />
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

function AddMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
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
            <option value="MANAGER">Gerente</option>
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
