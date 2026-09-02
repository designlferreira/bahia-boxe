import { useEffect, useRef, useState } from "react";
import { DIMENSIONS, DIMENSION_SHORT_LABELS, type Dimension } from "@/lib/boxingProfile";

interface BoxingRadarChartProps {
  scores: Record<Dimension, number>;
  /** Segunda série opcional (ex.: avaliação do professor), sobreposta em traço tracejado neutro. */
  compareScores?: Record<Dimension, number>;
  size?: number;
}

const RINGS = [25, 50, 75, 100];
const ANIMATION_MS = 650;

function zeroScores(): Record<Dimension, number> {
  return Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<Dimension, number>;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Anima dos valores atuais até `scores` sempre que o alvo muda (primeira montagem parte de zero).
 * Sem lib de animação: é só um tween de números via requestAnimationFrame — o que muda de fato no
 * SVG é `points`, que CSS não anima sozinho. Pula direto pro valor final quando o usuário pede
 * menos movimento (`prefers-reduced-motion`).
 */
function useAnimatedScores(target: Record<Dimension, number>) {
  const [animated, setAnimated] = useState<Record<Dimension, number>>(() => (prefersReducedMotion() ? target : zeroScores()));
  const fromRef = useRef(animated);
  const rafRef = useRef<number>();
  const targetKey = DIMENSIONS.map((d) => target[d]).join(",");

  useEffect(() => {
    if (prefersReducedMotion()) {
      setAnimated(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / ANIMATION_MS);
      const eased = easeOutCubic(t);
      const next = Object.fromEntries(DIMENSIONS.map((d) => [d, from[d] + (target[d] - from[d]) * eased])) as Record<
        Dimension,
        number
      >;
      setAnimated(next);
      fromRef.current = next;
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  return animated;
}

/**
 * SVG próprio, sem biblioteca de gráfico — o projeto não tinha nenhuma, e um radar de 8 eixos não
 * justifica uma dependência nova. Decorativo (`aria-hidden`): a lista numérica logo abaixo
 * (renderizada por quem usa este componente) é a representação acessível de verdade.
 */
export function BoxingRadarChart({ scores, compareScores, size = 280 }: BoxingRadarChartProps) {
  const animatedScores = useAnimatedScores(scores);
  // Chamado incondicionalmente (regra dos hooks) mesmo sem `compareScores` — nesse caso o valor
  // não é usado pra desenhar nada, então não há tween "fantasma" visível.
  const animatedCompare = useAnimatedScores(compareScores ?? scores);
  const center = size / 2;
  const maxRadius = size / 2 - 36; // deixa espaço pros rótulos dos eixos

  function pointFor(index: number, valuePct: number) {
    const angle = (Math.PI * 2 * index) / DIMENSIONS.length - Math.PI / 2;
    const r = (valuePct / 100) * maxRadius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  }

  const dataPoints = DIMENSIONS.map((dim, i) => pointFor(i, animatedScores[dim]));
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  const compareDataPoints = compareScores ? DIMENSIONS.map((dim, i) => pointFor(i, animatedCompare[dim])) : null;
  const compareDataPath = compareDataPoints?.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} aria-hidden="true">
      {RINGS.map((ring) => {
        const ringPoints = DIMENSIONS.map((_, i) => pointFor(i, ring));
        return (
          <polygon
            key={ring}
            points={ringPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        );
      })}

      {DIMENSIONS.map((dim, i) => {
        const outer = pointFor(i, 100);
        const label = pointFor(i, 118);
        return (
          <g key={dim}>
            <line x1={center} y1={center} x2={outer.x} y2={outer.y} stroke="hsl(var(--border))" strokeWidth={1} />
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10.5}
              fill="hsl(var(--muted-foreground))"
            >
              {DIMENSION_SHORT_LABELS[dim]}
            </text>
          </g>
        );
      })}

      {compareDataPath && (
        <>
          <polygon
            points={compareDataPath}
            fill="none"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
          {compareDataPoints!.map((p, i) => (
            <circle key={`compare-${DIMENSIONS[i]}`} cx={p.x} cy={p.y} r={2.5} fill="hsl(var(--muted-foreground))" />
          ))}
        </>
      )}

      <polygon points={dataPath} fill="hsl(var(--accent) / 0.22)" stroke="hsl(var(--accent))" strokeWidth={2} strokeLinejoin="round" />
      {dataPoints.map((p, i) => (
        <circle key={DIMENSIONS[i]} cx={p.x} cy={p.y} r={2.5} fill="hsl(var(--accent))" />
      ))}
    </svg>
  );
}
