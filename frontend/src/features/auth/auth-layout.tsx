import { BellRing, Boxes, Check, Smartphone, TrendingUp, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo, LogoMark } from '@/components/layout/logo';
import { delay, Reveal, useReveal } from '@/features/landing/reveal';

type Side = 'login' | 'register' | 'password';

/**
 * Tela de entrada (login, cadastro, troca de senha).
 * Computador: painel da marca à esquerda + formulário à direita.
 * Celular: só o formulário, com a logo no topo (nada atrapalha quem quer entrar rápido).
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
  side = 'login',
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: Side;
}) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  return (
    <div ref={root} className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel side={side} />

      <main className="relative isolate flex flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        {side === 'password' ? (
          // brilho de fundo discreto no celular
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-accent/10 to-transparent lg:hidden" />
        ) : (
          <FormBackdrop />
        )}

        <div className="w-full max-w-md">
          <Reveal variant="down" className="mb-8 flex justify-center lg:hidden">
            <Link to="/apresentacao" aria-label="Conheça o Gestock">
              <Logo size="lg" className="text-2xl" />
            </Link>
          </Reveal>

          <Reveal variant="up" delay={80}>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {description && <p className="mt-2 text-sm text-muted">{description}</p>}
          </Reveal>

          <Reveal variant="up" delay={180} className="mt-8">
            {children}
          </Reveal>

          {footer && (
            <Reveal variant="up" delay={260} className="mt-8 text-center text-sm text-muted">
              {footer}
            </Reveal>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Fundo da área do formulário (login e cadastro): grade vetorial em SVG com gradiente azul,
 * mais forte atrás dos campos e sumindo nas bordas, e um brilho suave por cima.
 */
function FormBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {/* base: gradiente azul-marinho */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F45] via-navy-950 to-[#061024]" />

      {/*
        Grade vetorial com gradiente: as linhas são desenhadas por gradientes CSS (vetor puro,
        nítido em qualquer zoom) e coloridas por um gradiente azul-claro → índigo.
        A camada de fora apaga as bordas (vinheta). Tudo em CSS: leve até em celular simples
        (uma versão em SVG com <mask> travava a renderização junto com as luzes animadas).
      */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, black 20%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 45%, black 20%, transparent 80%)',
        }}
      >
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage: 'linear-gradient(135deg, #38BDF8 0%, #6366F1 55%, #38BDF8 100%)',
            maskImage:
              'linear-gradient(to right, black 1px, transparent 1px), linear-gradient(to bottom, black 1px, transparent 1px)',
            WebkitMaskImage:
              'linear-gradient(to right, black 1px, transparent 1px), linear-gradient(to bottom, black 1px, transparent 1px)',
            maskSize: '40px 40px',
            WebkitMaskSize: '40px 40px',
          }}
        />
        {/* pontos nos cruzamentos, a cada 4 quadrados */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: 'radial-gradient(circle at 0 0, #38BDF8 2px, transparent 2.5px)',
            backgroundSize: '160px 160px',
          }}
        />
      </div>

      {/* brilhos que dão profundidade */}
      <div className="absolute left-1/2 top-1/3 size-[28rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl motion-safe:animate-blob" />
      <div
        className="absolute -bottom-24 -right-24 size-80 rounded-full bg-indigo-500/15 blur-3xl motion-safe:animate-blob"
        style={{ animationDelay: '-9s' }}
      />
    </div>
  );
}

const CONTENT: Record<Side, { title: ReactNode; text: string; items: { icon: LucideIcon; text: string }[] }> = {
  login: {
    title: (
      <>
        Bem-vindo de volta.
        <br />
        <span className="text-gradient motion-safe:animate-shine">Sua loja está esperando.</span>
      </>
    ),
    text: 'Vendas, estoque e previsão de compras do seu estabelecimento em um só lugar.',
    items: [
      { icon: Smartphone, text: 'Registre vendas no balcão pelo celular' },
      { icon: BellRing, text: 'Saiba o que está acabando antes de faltar' },
      { icon: TrendingUp, text: 'Compre na medida certa com a previsão' },
    ],
  },
  register: {
    title: (
      <>
        Comece hoje.
        <br />
        <span className="text-gradient motion-safe:animate-shine">Saia do caderno em minutos.</span>
      </>
    ),
    text: 'Você cria a conta do estabelecimento e vira o dono. A equipe entra depois, com as permissões certas.',
    items: [
      { icon: Check, text: 'Crie a conta do seu estabelecimento' },
      { icon: Boxes, text: 'Cadastre ingredientes e produtos' },
      { icon: Smartphone, text: 'Registre a primeira venda no celular' },
    ],
  },
  password: {
    title: (
      <>
        Quase lá.
        <br />
        <span className="text-gradient motion-safe:animate-shine">Crie uma senha só sua.</span>
      </>
    ),
    text: 'Sua conta foi criada com uma senha provisória. Troque agora para proteger o acesso da loja.',
    items: [
      { icon: Check, text: 'Use pelo menos 8 caracteres' },
      { icon: Check, text: 'Misture letras, números e símbolos' },
      { icon: Check, text: 'Não reutilize senhas de outros sites' },
    ],
  },
};

function BrandPanel({ side }: { side: Side }) {
  const content = CONTENT[side];
  const bars = [38, 55, 47, 70, 62, 86, 78];
  return (
    <aside className="relative isolate hidden overflow-hidden border-r border-navy-800 bg-[#001849] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {/* fundo: luzes, grade e a marca gigante girando devagar */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-accent/20 blur-3xl motion-safe:animate-blob" />
        <div className="absolute -bottom-32 right-0 size-[26rem] rounded-full bg-indigo-500/20 blur-3xl motion-safe:animate-blob" style={{ animationDelay: '-8s' }} />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(#A9B8D0 1px, transparent 1px), linear-gradient(90deg, #A9B8D0 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 70%)',
          }}
        />
        <LogoMark className="absolute -bottom-16 -right-20 size-[26rem] text-white/[0.04]" />
      </div>

      <Reveal variant="down">
        <Link to="/apresentacao" aria-label="Conheça o Gestock" className="inline-flex">
          <Logo size="lg" className="text-2xl" />
        </Link>
      </Reveal>

      <div className="max-w-lg">
        <Reveal as="h2" variant="blur" delay={120} className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
          {content.title}
        </Reveal>
        <Reveal as="p" variant="up" delay={240} className="mt-5 text-lg text-muted">
          {content.text}
        </Reveal>
        <ul className="mt-8 flex flex-col gap-4">
          {content.items.map((item, i) => (
            <Reveal as="li" key={item.text} variant="left" delay={360 + i * 140} className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                {side === 'register' ? (
                  <span className="text-sm font-bold">{i + 1}</span>
                ) : (
                  <item.icon className="size-4" aria-hidden />
                )}
              </span>
              <span>{item.text}</span>
            </Reveal>
          ))}
        </ul>
      </div>

      {/* cartão flutuante: mini painel com barras que crescem (fora do login) */}
      {side === 'login' ? (
        <div aria-hidden />
      ) : (
      <Reveal variant="up" delay={700} className="max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md motion-safe:animate-float-slow">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Vendas da semana</span>
            <span className="rounded-full bg-success/15 px-2 py-0.5 font-semibold text-success">+ fim de semana</span>
          </div>
          <div data-reveal="group" className="mt-3 flex h-16 items-end gap-1.5">
            {bars.map((h, i) => (
              <div
                key={i}
                className="grow-bar flex-1 rounded-t bg-gradient-to-t from-accent/50 to-accent"
                style={{ height: `${h}%`, ...delay(900 + i * 80) }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted">
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
              <span key={d} className="flex-1 text-center">
                {d}
              </span>
            ))}
          </div>
        </div>
      </Reveal>
      )}
    </aside>
  );
}
