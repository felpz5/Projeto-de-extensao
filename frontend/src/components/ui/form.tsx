import { Eye, EyeOff } from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  cloneElement,
} from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-navy-700 bg-navy-950 px-3 text-sm text-white placeholder:text-muted/60 transition-colors focus:border-accent disabled:opacity-50 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, 'h-10', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, 'min-h-20 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/** Select nativo: funciona bem no celular (abre o seletor do sistema). */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(control, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-white', className)} {...props} />;
}

interface FieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
  /** Um único Input/Select/Textarea: recebe id e aria-* automaticamente. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Rótulo + controle + mensagem de erro/ajuda, já ligados para leitores de tela. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Senha com botão de mostrar/ocultar e aviso de Caps Lock ligado.
 * Recebe id/aria-* do <Field> e repassa para o <input> de verdade.
 */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, onKeyUp, onBlur, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    return (
      <div>
        <div className="relative">
          <input
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={cn(control, 'h-10 pr-10', className)}
            onKeyUp={(e) => {
              setCapsLock(e.getModifierState?.('CapsLock') ?? false);
              onKeyUp?.(e);
            }}
            onBlur={(e) => {
              setCapsLock(false);
              onBlur?.(e);
            }}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted hover:text-white"
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {capsLock && (
          <p className="mt-1 text-xs text-warning" role="status">
            Caps Lock está ligado.
          </p>
        )}
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

/** forwardRef: o register() do React Hook Form precisa da ref para ler o valor marcado. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }
>(({ label, className, ...props }, ref) => (
  <label className={cn('flex cursor-pointer items-center gap-2 text-sm', className)}>
    <input ref={ref} type="checkbox" className="size-4 rounded accent-accent" {...props} />
    {label}
  </label>
));
Checkbox.displayName = 'Checkbox';
