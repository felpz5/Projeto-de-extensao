import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { SEGMENTS } from '@/features/auth/register-page';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import { qk, useTenant } from '@/lib/queries';
import type { Tenant } from '@/lib/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  segment: z.string().max(60),
  timezone: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

function timeZones(current: string) {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf('timeZone');
  } catch {
    // navegador antigo: só o fuso atual
  }
  const list = all.filter((tz) => tz.startsWith('America/'));
  return list.includes(current) ? list : [current, ...list];
}

export function TenantTab() {
  const { isOwner } = useAuth();
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // keepDirtyValues: uma recarga em segundo plano não apaga o que está sendo editado.
  useEffect(() => {
    if (tenant.data)
      reset(
        {
          name: tenant.data.name,
          segment: tenant.data.segment ?? '',
          timezone: tenant.data.timezone,
        },
        { keepDirtyValues: true },
      );
  }, [tenant.data, reset]);

  const zones = useMemo(() => timeZones(tenant.data?.timezone ?? 'America/Sao_Paulo'), [tenant.data?.timezone]);

  const mutation = useMutation({
    mutationFn: (body: unknown) => api<Tenant>('/tenant', { method: 'PATCH', body }),
    onSuccess: (t) => {
      // Salvo: o formulário passa a refletir o servidor (e deixa de estar "alterado").
      reset({ name: t.name, segment: t.segment ?? '', timezone: t.timezone });
      queryClient.setQueryData(qk.tenant, t);
      queryClient.invalidateQueries({ queryKey: qk.me });
      toast.success('Dados do estabelecimento salvos.');
    },
    onError: (err) => handleFormError(err, setError, ['name', 'segment', 'timezone']),
  });

  if (tenant.isPending) return <Spinner />;
  if (tenant.isError) return <ErrorState error={tenant.error} onRetry={() => tenant.refetch()} />;

  return (
    <Card className="max-w-xl">
      <CardHeader
        title="Estabelecimento"
        description={isOwner ? 'Só o dono pode alterar estes dados.' : 'Apenas o dono pode alterar estes dados.'}
      />
      <form
        onSubmit={handleSubmit((d) =>
          mutation.mutate({ name: d.name, segment: d.segment || null, timezone: d.timezone }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <fieldset disabled={!isOwner} className="flex flex-col gap-4">
          <Field label="Nome" error={errors.name?.message}>
            <Input {...register('name')} />
          </Field>
          <Field label="Segmento" error={errors.segment?.message}>
            <Select {...register('segment')}>
              <option value="">Não informado</option>
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Fuso horário"
            error={errors.timezone?.message}
            hint="Define o que é 'hoje' nos relatórios e na previsão."
          >
            <Select {...register('timezone')}>
              {zones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('America/', '').replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
        {isOwner && (
          <Button type="submit" className="self-start" disabled={!isDirty} loading={mutation.isPending}>
            Salvar
          </Button>
        )}
      </form>
    </Card>
  );
}
