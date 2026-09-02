import { DIMENSIONS, DIMENSION_SHORT_LABELS, type Dimension } from "@/lib/boxingProfile";

interface BoxingRadarChartProps {
  scores: Record<Dimension, number>;
  size?: number;
}

const RINGS = [25, 50, 75, 100];

/**
 * SVG próprio, sem biblioteca de gráfico — o projeto não tinha nenhuma, e um radar de 8 eixos não
 * justifica uma dependência nova. Decorativo (`aria-hidden`): a lista numérica logo abaixo
 * (renderizada por quem usa este componente) é a representação acessível de verdade.
 */
export function BoxingRadarChart({ scores, size = 280 }: BoxingRadarChartProps) {
  const center = size / 2;
  const maxRadius = size / 2 - 36; // deixa espaço pros rótulos dos eixos

  function pointFor(index: number, valuePct: number) {
    const angle = (Math.PI * 2 * index) / DIMENSIONS.length - Math.PI / 2;
    const r = (valuePct / 100) * maxRadius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  }

  const dataPoints = DIMENSIONS.map((dim, i) => pointFor(i, scores[dim]));
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

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

      <polygon points={dataPath} fill="hsl(var(--accent) / 0.22)" stroke="hsl(var(--accent))" strokeWidth={2} strokeLinejoin="round" />
      {dataPoints.map((p, i) => (
        <circle key={DIMENSIONS[i]} cx={p.x} cy={p.y} r={2.5} fill="hsl(var(--accent))" />
      ))}
    </svg>
  );
}
