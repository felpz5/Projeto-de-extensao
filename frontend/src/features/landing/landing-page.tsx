import {
  ArrowRight,
  BellRing,
  Boxes,
  Check,
  ClipboardCheck,
  Coffee,
  Globe,
  IceCreamCone,
  Lock,
  PackagePlus,
  Receipt,
  Sandwich,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/layout/logo';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import { delay, Reveal, useCountUp, useReveal, useScrollProgress } from './reveal';

/**
 * Página de apresentação do Gestock (pública). As animações disparam quando cada bloco entra
 * na tela (reveal.tsx + index.css) e somem para quem pediu "reduzir movimento" no sistema.
 * Os números mostrados são da açaiteria de DEMONSTRAÇÃO (seed) e estão sinalizados assim.
 */
export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Gestock — estoque e previsão de demanda para pequenos negócios';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div ref={root} className="relative overflow-x-clip">
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />
        <Segments />
        <BeforeAfter />
        <Features />
        <HowItWorks />
        <DashboardShowcase />
        <ForecastShowcase />
        <Team />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Navegação

function ScrollProgress() {
  const { progress } = useScrollProgress();
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-accent to-cyan-200"
      style={{ transform: `scaleX(${progress})` }}
    />
  );
}

function PrimaryCta({ className, label }: { className?: string; label?: string }) {
  const { status } = useAuth();
  const logged = status === 'authenticated';
  return (
    <Link
      to={logged ? '/' : '/cadastro'}
      className={cn(
        buttonVariants({ size: 'lg' }),
        'group shadow-lg shadow-accent/20 motion-safe:animate-glow',
        className,
      )}
    >
      {logged ? 'Abrir o painel' : (label ?? 'Começar agora')}
      <ArrowRight className="transition-transform group-hover:translate-x-1" aria-hidden />
    </Link>
  );
}

function Nav() {
  const { scrolled } = useScrollProgress();
  const { status } = useAuth();
  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-all duration-300',
        scrolled ? 'border-b border-navy-700/70 bg-navy-950/80 backdrop-blur-md' : 'bg-transparent',
      )}
    >
      <nav aria-label="Apresentação" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link to="/apresentacao" aria-label="Gestock — início">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-6 text-sm text-muted md:flex">
          {[
            ['#recursos', 'Recursos'],
            ['#como-funciona', 'Como funciona'],
            ['#previsao', 'Previsão'],
            ['#equipe', 'Equipe'],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="transition-colors hover:text-white">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          {status !== 'authenticated' && (
            <Link to="/entrar" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Entrar
            </Link>
          )}
          <Link
            to={status === 'authenticated' ? '/' : '/cadastro'}
            className={buttonVariants({ size: 'sm' })}
          >
            {status === 'authenticated' ? 'Painel' : 'Criar conta'}
          </Link>
        </div>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------------------------
// Hero

function Hero() {
  return (
    <section className="relative isolate px-4 pb-20 pt-32 sm:pt-40">
      {/* Fundo: manchas de luz que flutuam + grade sutil */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 top-10 size-[28rem] rounded-full bg-accent/20 blur-3xl motion-safe:animate-blob" />
        <div
          className="absolute -right-24 top-40 size-[24rem] rounded-full bg-indigo-500/20 blur-3xl motion-safe:animate-blob"
          style={{ animationDelay: '-6s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 size-[20rem] rounded-full bg-cyan-400/10 blur-3xl motion-safe:animate-blob"
          style={{ animationDelay: '-12s' }}
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#A9B8D0 1px, transparent 1px), linear-gradient(90deg, #A9B8D0 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          }}
        />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div className="text-center lg:text-left">
          <Reveal as="h1" variant="blur" delay={120} className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Seu estoque sob controle.{' '}
            <span className="text-gradient motion-safe:animate-shine">Sua próxima compra, prevista.</span>
          </Reveal>
          <Reveal as="p" variant="up" delay={260} className="mx-auto mt-6 max-w-xl text-lg text-muted lg:mx-0">
            Registre vendas pelo celular, acompanhe o estoque em tempo real e saiba o que comprar
            antes de faltar — com previsões honestas, que mostram o quanto dá para confiar.
          </Reveal>
          <Reveal variant="up" delay={400} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryCta />
            <a href="#como-funciona" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              Ver como funciona
            </a>
          </Reveal>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

/** Mini painel "de mentira" flutuando, montado com os próprios componentes visuais. */
function HeroMockup() {
  const bars = [52, 68, 45, 80, 62, 92, 74, 58, 86, 70, 96, 78];
  return (
    <Reveal variant="zoom" delay={300} className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="motion-safe:animate-float-slow">
        <div className="rounded-2xl border border-navy-700 bg-navy-900/90 p-5 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">Faturamento · 30 dias</p>
              <p className="tabular text-2xl font-bold">R$ 25.019</p>
            </div>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">1.011 pedidos</span>
          </div>
          <div data-reveal="group" className="mt-5 flex h-32 items-end gap-1.5">
            {bars.map((h, i) => (
              <div
                key={i}
                className="grow-bar flex-1 rounded-t bg-gradient-to-t from-accent/60 to-accent"
                style={{ height: `${h}%`, ...delay(500 + i * 60) }}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Estoque baixo', '1', 'text-warning'],
              ['Sem estoque', '4', 'text-danger'],
              ['Ticket médio', 'R$ 24,75', 'text-white'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-lg bg-navy-800 p-2">
                <p className="text-muted">{label}</p>
                <p className={cn('tabular text-sm font-bold', tone)}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------------------------
// Faixa de segmentos (rolagem infinita)

const SEGMENTS: { icon: LucideIcon; label: string }[] = [
  { icon: IceCreamCone, label: 'Açaiterias' },
  { icon: IceCreamCone, label: 'Sorveterias' },
  { icon: Sandwich, label: 'Lanchonetes' },
  { icon: Coffee, label: 'Cafeterias' },
  { icon: ShoppingBasket, label: 'Mercadinhos' },
  { icon: Store, label: 'Docerias' },
];

function Segments() {
  const row = [...SEGMENTS, ...SEGMENTS];
  return (
    <section aria-label="Para quem é" className="border-y border-navy-800 bg-navy-900/40 py-6">
      <div
        className="overflow-hidden"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)',
        }}
      >
        <ul className="flex w-max gap-12 motion-safe:animate-marquee hover:[animation-play-state:paused]">
          {row.map((s, i) => (
            <li key={i} aria-hidden={i >= SEGMENTS.length} className="flex items-center gap-2 whitespace-nowrap text-muted">
              <s.icon className="size-5 text-accent" aria-hidden />
              <span className="font-medium">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Antes x depois

function BeforeAfter() {
  const before = [
    'Vendas anotadas no caderno, somadas no fim do dia',
    'Descobre que acabou o creme quando o cliente pede',
    'Compra "no olho", sobra ou falta toda semana',
    'Ninguém sabe quanto de cada ingrediente sai por dia',
  ];
  const after = [
    'Venda registrada no celular em segundos, no balcão ou online',
    'Alerta quando um ingrediente chega no mínimo',
    'Sugestão de compra com base no que você realmente vende',
    'Consumo calculado por receita ou composição do produto',
  ];
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Do caderno para o painel" title="Menos adivinhação, mais decisão" />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Reveal variant="left" className="rounded-2xl border border-danger/20 bg-danger/5 p-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-danger">Sem o Gestock</p>
            <ul className="flex flex-col gap-3">
              {before.map((t) => (
                <li key={t} className="flex gap-3 text-muted">
                  <X className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal variant="right" delay={150} className="rounded-2xl border border-success/25 bg-success/5 p-6">
            <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-success">Com o Gestock</p>
            <ul className="flex flex-col gap-3">
              {after.map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Recursos

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Smartphone,
    title: 'Venda no celular',
    text: 'Balcão com peso e valor, ou pedido online com os ingredientes escolhidos. Botões grandes, feito para usar com uma mão.',
  },
  {
    icon: Boxes,
    title: 'Estoque que se atualiza sozinho',
    text: 'Cada venda dá baixa pela receita do produto ou pela composição média do pote. Entradas, perdas e ajustes ficam no histórico.',
  },
  {
    icon: BellRing,
    title: 'Alertas antes de faltar',
    text: 'Defina o mínimo de cada ingrediente e veja na hora o que está baixo ou zerado — sem abrir planilha.',
  },
  {
    icon: TrendingUp,
    title: 'Previsão de demanda',
    text: 'Média ponderada com o efeito do dia da semana: o sábado de açaí não é igual à terça. Sempre com faixa de incerteza.',
  },
  {
    icon: ClipboardCheck,
    title: 'Contagem que corrige tudo',
    text: 'Contou o estoque? O sistema lança a diferença e ajusta as estimativas. Errou um lançamento? Estorne sem apagar nada.',
  },
  {
    icon: Receipt,
    title: 'Relatórios que importam',
    text: 'Faturamento por dia, ticket médio, balcão x online e os produtos que mais vendem, no período que você escolher.',
  },
];

function Features() {
  return (
    <section id="recursos" className="scroll-mt-20 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          eyebrow="Recursos"
          title="Tudo que a loja precisa, nada que atrapalhe"
          text="Pensado com uma açaiteria de verdade: simples no balcão, completo na gestão."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} variant="up" delay={(i % 3) * 120}>
              <article className="group relative h-full overflow-hidden rounded-2xl border border-navy-700 bg-navy-900 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-xl hover:shadow-accent/10">
                {/* brilho que segue o hover */}
                <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                  <f.icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Como funciona

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: PackagePlus,
    title: 'Cadastre o que você usa e vende',
    text: 'Ingredientes com unidade e estoque mínimo; produtos com receita (milkshake) ou composição por peso (açaí no pote).',
  },
  {
    icon: Smartphone,
    title: 'Registre vendas e entradas',
    text: 'A equipe lança as vendas no celular e as compras que chegam. O estoque se ajusta sozinho a cada lançamento.',
  },
  {
    icon: TrendingUp,
    title: 'Receba previsões e sugestões',
    text: 'Com uma semana de histórico o Gestock já prevê a demanda e diz quanto comprar de cada item, já contando o prazo de entrega.',
  },
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 bg-navy-900/40 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Como funciona" title="Em três passos você sai do caderno" />
        <Reveal variant="group" className="relative mt-16">
          {/* Linha que se preenche ligando os passos (computador) */}
          <div aria-hidden className="absolute left-[16.66%] right-[16.66%] top-7 hidden h-0.5 bg-navy-700 md:block">
            <div className="fill-x h-full bg-gradient-to-r from-accent to-cyan-200" style={delay(300)} />
          </div>
          <ol className="grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} variant="up" delay={200 + i * 350} className="relative text-center">
                <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border border-accent/40 bg-navy-950 text-accent shadow-lg shadow-accent/10">
                  <s.icon className="size-6" aria-hidden />
                  <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-navy-950">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Vitrine do painel (contadores + gráfico)

function Counter({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const [ref, current] = useCountUp(value);
  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} className={cn('tabular', className)}>
      {format(current)}
    </span>
  );
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const int = (n: number) => Math.round(n).toLocaleString('pt-BR');

function DashboardShowcase() {
  const days = [42, 38, 55, 47, 61, 88, 93, 45, 41, 52, 50, 66, 91, 97, 48, 44, 57, 53, 70, 95, 99];
  const top = [
    { name: 'Açaí no peso', value: 88 },
    { name: 'Milkshake de açaí 500 ml', value: 12 },
  ];
  return (
    <section className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionTitle
            align="left"
            eyebrow="Painel"
            title="O dia da loja em uma tela"
            text="Faturamento, pedidos, ticket médio, mais vendidos, alertas e as últimas movimentações. O funcionário vê só o estoque; relatórios ficam com o dono e o gerente."
          />
          <Reveal variant="up" delay={200} className="mt-8 flex flex-col gap-3">
            {['Escolha o período: 7, 30 ou 90 dias', 'Gráfico ou tabela, como preferir', 'Datas no fuso horário da sua loja'].map((t) => (
              <p key={t} className="flex items-center gap-3 text-sm">
                <span className="flex size-6 items-center justify-center rounded-full bg-accent/15">
                  <Check className="size-3.5 text-accent" aria-hidden />
                </span>
                {t}
              </p>
            ))}
          </Reveal>
        </div>

        <Reveal variant="right" className="rounded-2xl border border-navy-700 bg-navy-900 p-5 shadow-2xl shadow-black/30 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-navy-800 p-3">
              <p className="text-xs text-muted">Faturamento</p>
              <Counter value={25019} format={brl} className="text-lg font-bold sm:text-xl" />
            </div>
            <div className="rounded-xl bg-navy-800 p-3">
              <p className="text-xs text-muted">Pedidos</p>
              <Counter value={1011} format={int} className="text-lg font-bold sm:text-xl" />
            </div>
            <div className="col-span-2 rounded-xl bg-navy-800 p-3 sm:col-span-1">
              <p className="text-xs text-muted">Ticket médio</p>
              <Counter value={24.75} format={(n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} className="text-lg font-bold sm:text-xl" />
            </div>
          </div>

          <div data-reveal="group" className="mt-5">
            <p className="mb-2 text-xs font-semibold text-muted">Faturamento por dia</p>
            <div className="flex h-36 items-end gap-1">
              {days.map((h, i) => (
                <div
                  key={i}
                  className="grow-bar flex-1 rounded-t-sm bg-accent"
                  style={{ height: `${h}%`, opacity: [5, 6, 12, 13, 19, 20].includes(i) ? 1 : 0.75, ...delay(i * 45) }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Os picos são os fins de semana — e a previsão leva isso em conta.</p>

            <p className="mb-2 mt-5 text-xs font-semibold text-muted">Mais vendidos</p>
            <ul className="flex flex-col gap-3">
              {top.map((p, i) => (
                <li key={p.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="tabular font-semibold">{p.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-navy-800">
                    <div className="fill-x h-2 rounded-full bg-accent" style={{ width: `${p.value}%`, ...delay(600 + i * 200) }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-right text-[11px] text-muted/70">Dados da açaiteria de demonstração</p>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Vitrine da previsão (linha que se desenha + sugestões)

function ForecastShowcase() {
  const expected = [37.8, 38.9, 21.7, 24.6, 20.9, 21.0, 38.7];
  const spread = [4.7, 4.9, 4.2, 4.4, 4.3, 4.3, 4.9];
  const labels = ['sáb', 'dom', 'seg', 'ter', 'qua', 'qui', 'sex'];
  const W = 600;
  const H = 220;
  const PAD = 24;
  const max = 50;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (expected.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = expected.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const band =
    expected.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v + spread[i])}`).join(' ') +
    ' ' +
    [...expected]
      .map((v, i) => [v, i] as const)
      .reverse()
      .map(([v, i]) => `L${x(i)},${y(v - spread[i])}`)
      .join(' ') +
    ' Z';

  const suggestions = [
    { name: 'Leite integral', tag: 'Sem estoque', tone: 'danger', qty: '11,2 L', extra: '' },
    { name: 'Paçoca', tag: 'Urgente', tone: 'danger', qty: '893 g', extra: 'Estimado' },
    { name: 'Açaí tradicional', tag: 'Comprar', tone: 'warning', qty: '34,8 kg', extra: 'Estimado' },
  ] as const;

  return (
    <section id="previsao" className="scroll-mt-20 bg-navy-900/40 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          eyebrow="Previsão e reposição"
          title="Saiba o que comprar antes de faltar"
          text="Nada de caixa-preta: cada previsão mostra a faixa de incerteza, quantos dias de histórico foram usados e o nível de confiança."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Reveal variant="group" className="rounded-2xl border border-navy-700 bg-navy-900 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Açaí no peso · próximos 7 dias</h3>
                <p className="text-sm text-muted">203 vendas previstas (191–215)</p>
              </div>
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                Confiança média · 59 dias
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H + 20}`} className="mt-4 w-full" role="img" aria-label="Gráfico de previsão: mais vendas no sábado, domingo e sexta-feira, menos no meio da semana.">
              {[0, 10, 20, 30, 40, 50].map((v) => (
                <line key={v} x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="#1E3A6B" strokeWidth="1" />
              ))}
              <path d={band} fill="#38BDF8" className="fade-in" style={{ ...delay(900), fillOpacity: 0.16 }} />
              <path d={line} fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw-line" style={delay(200)} />
              {expected.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r="6" fill="#38BDF8" stroke="#0F2040" strokeWidth="3" className="pop-in" style={delay(400 + i * 220)} />
              ))}
              {labels.map((l, i) => (
                <text key={l} x={x(i)} y={H + 14} textAnchor="middle" fill="#A9B8D0" fontSize="13">
                  {l}
                </text>
              ))}
            </svg>
            <p className="mt-2 text-xs text-muted">
              Linha = valor esperado · faixa = mínimo e máximo prováveis.{' '}
              <span className="text-muted/70">Dados de demonstração.</span>
            </p>
          </Reveal>

          <div className="flex flex-col gap-3">
            {suggestions.map((s, i) => (
              <Reveal key={s.name} variant="right" delay={300 + i * 180}>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-navy-700 bg-navy-900 p-4 transition-colors hover:border-accent/40">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-semibold',
                          s.tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning',
                        )}
                      >
                        {s.tag}
                      </span>
                      {s.extra && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                          <Sparkles className="size-3" aria-hidden /> {s.extra}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">Comprar</p>
                    <p className="tabular text-lg font-bold">{s.qty}</p>
                  </div>
                </div>
              </Reveal>
            ))}
            <Reveal variant="up" delay={900} className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-warning">
                <Sparkles className="size-4" aria-hidden /> Honesto por padrão
              </p>
              <p className="mt-1 text-muted">
                Ingrediente escolhido não é quantidade medida. Todo número que vem de estimativa
                leva o selo <b className="text-warning">Estimado</b> — e a contagem do estoque
                corrige o erro.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Equipe e segurança

const ROLES = [
  { role: 'Dono', text: 'Tudo: dados da loja, equipe, relatórios, previsão e cadastros.', icon: Store },
  { role: 'Gerente', text: 'Cadastros, ajustes e contagem de estoque, relatórios e previsão.', icon: Users },
  { role: 'Funcionário', text: 'Registra vendas e entradas de mercadoria. Simples assim.', icon: Smartphone },
];

function Team() {
  return (
    <section id="equipe" className="scroll-mt-20 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionTitle eyebrow="Equipe e segurança" title="Cada um vê o que precisa" />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {ROLES.map((r, i) => (
            <Reveal key={r.role} variant="zoom" delay={i * 140}>
              <div className="h-full rounded-2xl border border-navy-700 bg-navy-900 p-6 text-center transition-transform duration-300 hover:-translate-y-1">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <r.icon className="size-5" aria-hidden />
                </div>
                <h3 className="text-lg font-semibold">{r.role}</h3>
                <p className="mt-2 text-sm text-muted">{r.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Dados isolados por loja', text: 'Uma loja nunca enxerga os dados de outra — garantido no próprio banco.' },
            { icon: Lock, title: 'Senhas protegidas', text: 'Criptografia forte, bloqueio após tentativas erradas e troca obrigatória da senha provisória.' },
            { icon: Zap, title: 'Histórico que não se apaga', text: 'Lançamento errado é estornado, não apagado. Ações sensíveis ficam registradas.' },
          ].map((s, i) => (
            <Reveal key={s.title} variant="up" delay={i * 120} className="flex gap-3 rounded-xl border border-navy-800 p-4">
              <s.icon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal variant="up" delay={200} className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
          <Globe className="size-4 text-accent" aria-hidden />
          Trabalha em mais de uma loja? Troque de estabelecimento com um toque.
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Chamada final e rodapé

function FinalCta() {
  return (
    <section className="px-4 pb-24">
      <Reveal
        variant="zoom"
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-6 py-16 text-center"
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl motion-safe:animate-blob" />
        <h2 className="relative text-3xl font-bold sm:text-4xl">Pronto para largar o caderno?</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-muted">
          Crie a conta do seu estabelecimento, cadastre os ingredientes e registre a primeira venda
          hoje mesmo. Convide a equipe quando quiser.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryCta label="Criar minha conta" />
          <Link to="/entrar" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            Já tenho conta
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-navy-800 px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted sm:flex-row">
        <Logo className="text-base" />
        <p>Projeto de extensão · gestão de estoque e previsão de demanda</p>
      </div>
    </footer>
  );
}

function SectionTitle({
  eyebrow,
  title,
  text,
  align = 'center',
}: {
  eyebrow: string;
  title: string;
  text?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={cn(align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-xl')}>
      <Reveal as="p" variant="up" className="text-sm font-semibold uppercase tracking-widest text-accent">
        {eyebrow}
      </Reveal>
      <Reveal as="h2" variant="up" delay={80} className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </Reveal>
      {text && (
        <Reveal as="p" variant="up" delay={160} className="mt-4 text-muted">
          {text}
        </Reveal>
      )}
    </div>
  );
}
