import { cn } from '@/lib/utils';

/**
 * Marca do Gestock: um "G" formado por um arco, três barras crescentes (o gráfico) e o gancho.
 * Vetorizada a partir da logo oficial — usa currentColor (normalmente branco sobre azul-marinho).
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 320 300"
      className={className}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* arco superior do G, com as pontas cortadas em diagonal */}
      <path d="M0 200V145A145 145 0 0 1 142 0H317L287 22H142A123 123 0 0 0 22 145V185Z" />
      {/* barras do gráfico, topo inclinado subindo para a direita */}
      <path d="M12 228L44 208V294H12Z" />
      <path d="M67 190L99 170V294H67Z" />
      <path d="M121 152L153 132V294H121Z" />
      {/* gancho do G */}
      <path d="M178 132H317V180A114 114 0 0 1 203 294H172V272H203A92 92 0 0 0 295 180V152H178Z" />
    </svg>
  );
}

/** Selo (marca dentro de um quadrado azul-marinho) + nome. */
export function Logo({
  className,
  showText = true,
  size = 'md',
}: {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'size-7 rounded-lg p-1.5', md: 'size-8 rounded-lg p-1.5', lg: 'size-12 rounded-xl p-2.5' }[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-lg font-bold tracking-tight', className)}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center border border-white/10 bg-gradient-to-br from-[#0B2A6B] to-[#001849] text-white shadow-sm',
          box,
        )}
      >
        <LogoMark className="size-full" />
      </span>
      {showText && <span>Gestock</span>}
    </span>
  );
}
