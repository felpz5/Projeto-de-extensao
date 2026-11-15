import { cn } from '@/lib/utils';

/** Pontua a senha de 0 a 4: tamanho e variedade de caracteres. Só orienta; a regra é do back. */
export function passwordScore(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  else if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 0.5;
  return Math.min(4, Math.floor(score));
}

const LEVELS = [
  { label: 'Muito fraca', color: 'bg-danger', text: 'text-danger' },
  { label: 'Fraca', color: 'bg-danger', text: 'text-danger' },
  { label: 'Razoável', color: 'bg-warning', text: 'text-warning' },
  { label: 'Boa', color: 'bg-success', text: 'text-success' },
  { label: 'Forte', color: 'bg-success', text: 'text-success' },
];

/** Barra de força da senha: 4 segmentos que acendem conforme a senha melhora. */
export function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  const level = LEVELS[score];
  if (!password) return null;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-800">
            <div
              className={cn('h-full rounded-full transition-all duration-500', level.color)}
              style={{ width: i < Math.max(score, 1) ? '100%' : '0%' }}
            />
          </div>
        ))}
      </div>
      <p className={cn('mt-1 text-xs font-medium', level.text)}>
        Senha {level.label.toLowerCase()}
        {password.length < 8 && <span className="font-normal text-muted"> · mínimo de 8 caracteres</span>}
      </p>
    </div>
  );
}
