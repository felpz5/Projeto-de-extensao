import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import type { NavGroup } from './nav';

/**
 * Lista de navegação agrupada. `compact` = trilho só com ícones (tablet ou menu recolhido):
 * o nome aparece no tooltip e para leitores de tela (aria-label).
 */
export function NavGroups({
  groups,
  compact = false,
  onNavigate,
}: {
  groups: NavGroup[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          {compact ? (
            <div className="mx-auto mb-2 h-px w-8 bg-navy-700" aria-hidden />
          ) : (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted/70">
              {group.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  title={compact ? item.label : undefined}
                  aria-label={compact ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
                      compact ? 'mx-auto size-11 justify-center' : 'px-3 py-2.5',
                      isActive
                        ? 'bg-accent/15 text-accent'
                        : 'text-muted hover:bg-navy-800 hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* barra indicadora da página atual */}
                      <span
                        aria-hidden
                        className={cn(
                          'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-opacity',
                          isActive ? 'opacity-100' : 'opacity-0',
                          compact && '-left-3.5',
                        )}
                      />
                      <item.icon
                        className={cn('size-[18px] shrink-0 transition-transform group-hover:scale-110')}
                        aria-hidden
                      />
                      {!compact && <span className="truncate">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
