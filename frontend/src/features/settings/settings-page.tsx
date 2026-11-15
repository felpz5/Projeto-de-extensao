import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/feedback';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import { AccountTab } from './account-tab';
import { CategoriesTab } from './categories-tab';
import { TeamTab } from './team-tab';
import { TenantTab } from './tenant-tab';

const TABS = [
  { key: 'estabelecimento', label: 'Estabelecimento', managerOnly: false },
  { key: 'equipe', label: 'Equipe', managerOnly: true },
  { key: 'categorias', label: 'Categorias', managerOnly: false },
  { key: 'conta', label: 'Minha conta', managerOnly: false },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function SettingsPage() {
  const { isManager } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => isManager || !t.managerOnly);
  const requested = params.get('aba') as TabKey | null;
  const tab: TabKey = tabs.some((t) => t.key === requested) ? requested! : 'estabelecimento';

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-navy-700" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ aba: t.key }, { replace: true })}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
              tab === t.key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'estabelecimento' && <TenantTab />}
      {tab === 'equipe' && <TeamTab />}
      {tab === 'categorias' && <CategoriesTab />}
      {tab === 'conta' && <AccountTab />}
    </>
  );
}
