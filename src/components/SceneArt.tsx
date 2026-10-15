import type { TileAction, TileArt, TileObject, TileSubject } from "../types/scene";

/**
 * Renders a scene tile as line-art rather than a photograph.
 *
 * Every figure is drawn from the same canonical skeleton and every object
 * from the same vocabulary, which is the pedagogical point: two tiles that
 * differ by one Spanish word also differ by exactly one visual mark, so the
 * learner can map word to meaning by comparison instead of translation.
 */

const OBJECT_FILL: Record<TileObject, string> = {
  agua: "#7fb8de",
  vino: "#9c3050",
  leche: "#f4f0e4",
  pan: "#c89a5b",
  manzana: "#c8402f",
  naranja: "#e08a2b",
};

interface Pose {
  /** Arm that holds/raises the object: "mouth" | "out" | "none" */
  hand: "mouth" | "out" | "none";
  legs: "stand" | "stride" | "run";
  lean: number;
}

const POSE: Record<TileAction, Pose> = {
  beber: { hand: "mouth", legs: "stand", lean: 0 },
  comer: { hand: "mouth", legs: "stand", lean: 0 },
  tener: { hand: "out", legs: "stand", lean: 0 },
  correr: { hand: "none", legs: "run", lean: -8 },
  caminar: { hand: "none", legs: "stride", lean: 0 },
};

const IS_FEMALE: Record<TileSubject, boolean> = {
  nino: false,
  nina: true,
  hombre: false,
  mujer: true,
  hombres: false,
  mujeres: true,
};

const IS_CHILD: Record<TileSubject, boolean> = {
  nino: true,
  nina: true,
  hombre: false,
  mujer: false,
  hombres: false,
  mujeres: false,
};

const IS_PLURAL: Record<TileSubject, boolean> = {
  nino: false,
  nina: false,
  hombre: false,
  mujer: false,
  hombres: true,
  mujeres: true,
};

/** One figure in its own 40x80 coordinate space, positioned by the caller. */
function Figure({ female, pose }: { female: boolean; pose: Pose }) {
  const stroke = "currentColor";
  const common = { stroke, strokeWidth: 3, strokeLinecap: "round" as const, fill: "none" };

  const legs =
    pose.legs === "run" ? (
      <>
        <path d="M20 48 L10 62 L6 74" {...common} />
        <path d="M20 48 L31 60 L36 56" {...common} />
      </>
    ) : pose.legs === "stride" ? (
      <>
        <path d="M20 48 L13 64 L11 76" {...common} />
        <path d="M20 48 L27 64 L29 76" {...common} />
      </>
    ) : (
      <>
        <path d="M20 48 L15 62 L15 76" {...common} />
        <path d="M20 48 L25 62 L25 76" {...common} />
      </>
    );

  const arms =
    pose.hand === "mouth" ? (
      // Forearm angles up and out to the object, keeping it clear of the face.
      <>
        <path d="M20 28 L31 33 L35 23" {...common} />
        <path d="M20 28 L10 40" {...common} />
      </>
    ) : pose.hand === "out" ? (
      <>
        <path d="M20 28 L32 36 L40 44" {...common} />
        <path d="M20 28 L9 38" {...common} />
      </>
    ) : pose.legs === "run" ? (
      <>
        <path d="M20 28 L31 24 L34 32" {...common} />
        <path d="M20 28 L9 32 L5 24" {...common} />
      </>
    ) : (
      <>
        <path d="M20 28 L29 40" {...common} />
        <path d="M20 28 L11 40" {...common} />
      </>
    );

  return (
    <g transform={`rotate(${pose.lean} 20 48)`}>
      <circle cx={20} cy={12} r={8.5} stroke={stroke} strokeWidth={3} fill="none" />
      {female ? (
        <path d="M20 21 L20 34 M11 50 L20 34 L29 50 Z" stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
      ) : (
        <path d="M20 21 L20 48" {...common} />
      )}
      {arms}
      {legs}
    </g>
  );
}

/** The held/consumed object, drawn near whichever hand the pose uses. */
function ObjectMark({ object }: { object: TileObject }) {
  const fill = OBJECT_FILL[object];

  switch (object) {
    case "agua":
    case "vino":
    case "leche":
      // A vessel: tapered glass for wine, straight tumbler otherwise.
      return object === "vino" ? (
        <g>
          <path d="M-6 -8 L6 -8 L1.5 1 L-1.5 1 Z" fill={fill} stroke="currentColor" strokeWidth={1.6} />
          <path d="M0 1 L0 7 M-4 7 L4 7" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      ) : (
        <path d="M-5 -8 L5 -8 L3.5 6 L-3.5 6 Z" fill={fill} stroke="currentColor" strokeWidth={1.6} />
      );
    case "pan":
      return <ellipse cx={0} cy={0} rx={8} ry={5} fill={fill} stroke="currentColor" strokeWidth={1.6} />;
    case "manzana":
      return (
        <g>
          <circle cx={0} cy={1} r={6} fill={fill} stroke="currentColor" strokeWidth={1.6} />
          <path d="M0 -5 L0 -9" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </g>
      );
    case "naranja":
      return (
        <g>
          <circle cx={0} cy={0} r={6.5} fill={fill} stroke="currentColor" strokeWidth={1.6} />
          <path d="M-6.5 0 L6.5 0 M0 -6.5 L0 6.5" stroke="currentColor" strokeWidth={1.2} opacity={0.5} />
        </g>
      );
  }
}

export function SceneArt({ art, className }: { art: TileArt; className?: string }) {
  const pose = POSE[art.action];
  const female = IS_FEMALE[art.subject];
  const child = IS_CHILD[art.subject];
  const plural = IS_PLURAL[art.subject];

  // Children are drawn smaller and stand lower so the size difference alone
  // distinguishes "niño" from "hombre".
  const scale = child ? 0.76 : 1.08;
  const baseY = child ? 22 : 6;

  // Where the object sits relative to the figure's active hand, in the
  // figure's own coordinate space before scaling. Pushed clear of the head so
  // the object reads as a separate mark rather than part of the figure.
  const handPoint = pose.hand === "mouth" ? { x: 37, y: 20 } : { x: 42, y: 46 };

  const figures = plural
    ? [
        { tx: 8, s: scale * 0.8 },
        { tx: 52, s: scale * 0.8 },
      ]
    : [{ tx: 26, s: scale }];

  return (
    <svg viewBox="0 0 100 100" className={className} role="presentation" aria-hidden="true">
      {figures.map((f, i) => (
        <g key={i} transform={`translate(${f.tx} ${baseY}) scale(${f.s})`}>
          <Figure female={female} pose={pose} />
          {art.object && !plural ? (
            <g transform={`translate(${handPoint.x} ${handPoint.y})`}>
              <ObjectMark object={art.object} />
            </g>
          ) : null}
        </g>
      ))}
      {/* For plural subjects the object is drawn once, between the figures. */}
      {art.object && plural ? (
        <g transform="translate(50 30)">
          <ObjectMark object={art.object} />
        </g>
      ) : null}
    </svg>
  );
}
