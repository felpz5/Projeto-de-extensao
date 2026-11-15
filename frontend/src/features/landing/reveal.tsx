import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type RefObject,
} from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Dispara as animações de entrada: cada [data-reveal] dentro de `root` ganha a classe
 * .is-visible quando entra na tela (uma vez só). As animações em si estão no index.css.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));

    // Sem IntersectionObserver (navegador antigo) ou com "reduzir movimento": mostra tudo.
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      targets.forEach((t) => t.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [root]);
}

type Variant = 'up' | 'down' | 'left' | 'right' | 'zoom' | 'blur' | 'group';

/** Elemento que anima ao aparecer. `delay` em ms cria o efeito cascata. */
export function Reveal({
  as: Tag = 'div',
  variant = 'up',
  delay = 0,
  className,
  style,
  children,
  id,
}: {
  as?: ElementType;
  variant?: Variant;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <Tag
      id={id}
      data-reveal={variant}
      className={className}
      style={{ ...style, '--delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Atraso de transição para filhos animados (.grow-bar, .draw-line, .pop-in...). */
export const delay = (ms: number) => ({ '--delay': `${ms}ms` }) as CSSProperties;

/**
 * Número que "conta" de 0 até o valor final quando aparece na tela (ease-out).
 * Devolve a ref para pôr no elemento e o valor atual.
 */
export function useCountUp(end: number, durationMs = 1600) {
  const ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
      setValue(end);
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - t, 3);
          setValue(end * eased);
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [end, durationMs]);

  return [ref, value] as const;
}

/** Progresso da rolagem da página (0 a 1), atualizado no máximo uma vez por quadro. */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
      setScrolled(window.scrollY > 12);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return { progress, scrolled };
}
