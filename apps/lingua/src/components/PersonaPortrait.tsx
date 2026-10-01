import type { Portrait } from "@/lib/personas";

/**
 * A friendly illustrated portrait drawn from a few parameters, so every
 * partner has a face without stock photos or generated images.
 */
export function PersonaPortrait({
  portrait,
  size = 160,
  speaking = 0,
  title,
}: {
  portrait: Portrait;
  size?: number;
  /** 0–1 voice level; opens the mouth a little while talking. */
  speaking?: number;
  title?: string;
}) {
  const { skin, hair, hairStyle, shirt, background, accessory } = portrait;
  const mouthOpen = Math.min(1, speaking * 1.6);
  // Identical portraits share an identical clip path, so a parameter-derived id is safe.
  const clipId = `clip-${[skin, hair, shirt, background].join("").replace(/[^0-9a-z]/gi, "")}`;

  const backHair: Record<string, React.ReactNode> = {
    long: <path d="M50 92 Q48 40 100 38 Q152 40 150 92 L156 160 Q100 178 44 160 Z" fill={hair} />,
    wavy: <path d="M48 96 Q44 40 100 36 Q156 40 152 96 Q160 128 150 150 Q100 166 50 150 Q40 128 48 96 Z" fill={hair} />,
    curly: (
      <g fill={hair}>
        {[
          [62, 64], [80, 48], [100, 42], [120, 48], [138, 64], [146, 86], [54, 86], [148, 108], [52, 108],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={20} />
        ))}
      </g>
    ),
    bob: <path d="M52 100 Q48 40 100 38 Q152 40 148 100 L148 122 Q128 128 120 116 L80 116 Q72 128 52 122 Z" fill={hair} />,
  };

  const frontHair: Record<string, React.ReactNode> = {
    short: <path d="M62 82 Q60 46 100 44 Q140 46 138 82 Q124 64 100 62 Q76 64 62 82 Z" fill={hair} />,
    buzz: <path d="M64 80 Q64 50 100 48 Q136 50 136 80 Q120 66 100 66 Q80 66 64 80 Z" fill={hair} opacity={0.85} />,
    long: <path d="M60 86 Q62 46 100 46 Q138 46 140 86 Q122 62 98 64 Q78 66 60 86 Z" fill={hair} />,
    wavy: <path d="M60 88 Q60 48 100 46 Q140 48 140 88 Q130 70 112 66 Q92 76 60 88 Z" fill={hair} />,
    curly: <path d="M64 80 Q70 54 100 52 Q130 54 136 80 Q120 68 100 68 Q80 68 64 80 Z" fill={hair} />,
    bob: <path d="M60 88 Q62 46 100 46 Q138 46 140 88 Q136 70 100 68 Q66 70 60 88 Z" fill={hair} />,
    bun: (
      <g fill={hair}>
        <circle cx={100} cy={30} r={18} />
        <path d="M62 84 Q62 46 100 46 Q138 46 138 84 Q120 62 100 62 Q80 62 62 84 Z" />
      </g>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={title ?? "Conversation partner"}
      className="block"
    >
      <circle cx={100} cy={100} r={100} fill={background} />
      <clipPath id={clipId}>
        <circle cx={100} cy={100} r={100} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {backHair[hairStyle]}
        {/* shoulders */}
        <path d="M30 210 Q34 152 100 146 Q166 152 170 210 Z" fill={shirt} />
        {accessory === "scarf" && (
          <path d="M60 150 Q100 176 140 150 L146 168 Q100 196 54 168 Z" fill="#E8D4B0" opacity={0.95} />
        )}
        {/* neck */}
        <rect x={86} y={126} width={28} height={28} rx={10} fill={skin} />
        {/* face */}
        <ellipse cx={100} cy={96} rx={40} ry={46} fill={skin} />
        {/* ears */}
        <ellipse cx={60} cy={98} rx={7} ry={10} fill={skin} />
        <ellipse cx={140} cy={98} rx={7} ry={10} fill={skin} />
        {accessory === "earrings" && (
          <g fill="#E8B94A">
            <circle cx={60} cy={112} r={3.5} />
            <circle cx={140} cy={112} r={3.5} />
          </g>
        )}
        {frontHair[hairStyle]}
        {/* eyes */}
        <g fill="#2A1E18">
          <ellipse cx={84} cy={96} rx={4} ry={5} />
          <ellipse cx={116} cy={96} rx={4} ry={5} />
        </g>
        <g stroke="#2A1E18" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.7}>
          <path d="M76 84 Q84 80 92 84" />
          <path d="M108 84 Q116 80 124 84" />
        </g>
        {accessory === "glasses" && (
          <g stroke="#2A2A2A" strokeWidth={3} fill="none">
            <circle cx={84} cy={96} r={12} />
            <circle cx={116} cy={96} r={12} />
            <path d="M96 96 L104 96" />
          </g>
        )}
        {/* cheeks */}
        <g fill="#E07A6A" opacity={0.18}>
          <circle cx={74} cy={112} r={7} />
          <circle cx={126} cy={112} r={7} />
        </g>
        {accessory === "beard" && (
          <path
            d="M64 108 Q66 140 100 144 Q134 140 136 108 Q128 128 100 128 Q72 128 64 108 Z"
            fill={hair}
            opacity={0.9}
          />
        )}
        {/* mouth: a smile that opens with the voice */}
        <path
          d={`M88 ${118} Q100 ${126 + mouthOpen * 6} 112 ${118} Q100 ${120 + mouthOpen * 10} 88 ${118} Z`}
          fill="#8A3B33"
          stroke="#8A3B33"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
