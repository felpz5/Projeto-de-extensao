import { Download, Share, SquarePlus, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useInstall, useOnline } from '@/lib/pwa';
import { cn } from '@/lib/utils';

/**
 * Botão "Instalar app". Some quando já está instalado ou o navegador não permite.
 * No iPhone (sem instalação automática) abre o passo a passo do Safari.
 */
export function InstallButton({
  className,
  variant = 'secondary',
  size = 'sm',
  onDone,
}: {
  className?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  onDone?: () => void;
}) {
  const { state, install } = useInstall();
  const [iosHelp, setIosHelp] = useState(false);

  if (state === 'installed' || state === 'unavailable') return null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={async () => {
          if (state === 'ios') return setIosHelp(true);
          await install();
          onDone?.();
        }}
      >
        <Download aria-hidden /> Instalar app
      </Button>

      <Dialog
        open={iosHelp}
        onOpenChange={setIosHelp}
        title="Instalar no iPhone"
        description="Pelo Safari, em três toques:"
      >
        <ol className="flex flex-col gap-4 text-sm">
          <li className="flex items-center gap-3">
            <Step n={1} />
            Toque em <Share className="size-5 text-accent" aria-label="Compartilhar" /> (Compartilhar), na barra do Safari.
          </li>
          <li className="flex items-center gap-3">
            <Step n={2} />
            Escolha <SquarePlus className="size-5 text-accent" aria-hidden /> <b>Adicionar à Tela de Início</b>.
          </li>
          <li className="flex items-center gap-3">
            <Step n={3} />
            Toque em <b>Adicionar</b>. O Gestock aparece como app na tela inicial.
          </li>
        </ol>
      </Dialog>
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
      {n}
    </span>
  );
}

/** Faixa fixa quando o aparelho fica sem internet (o app abre, mas os dados vêm da API). */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-sm font-semibold text-navy-950 transition-transform duration-300',
        online ? '-translate-y-full' : 'translate-y-0',
      )}
    >
      {!online && (
        <>
          <WifiOff className="size-4" aria-hidden />
          Sem internet — vendas e estoque voltam a carregar quando a conexão voltar.
        </>
      )}
    </div>
  );
}
