import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { Cable, Cylinder, Dumbbell, PersonStanding } from 'lucide-react-native';
import { colors } from '../Theme/colors';

// An icon per equipment type, so an exercise row shows what it is
// actually done with rather than a shape cycled for decoration.
//
// lucide covers dumbbell, cable and bodyweight. It has no barbell,
// kettlebell, resistance band, machine or medicine ball, so those are
// drawn here — on the same 24x24 grid, 2px round-capped strokes, to sit
// alongside the lucide glyphs without looking imported from elsewhere.
//
// Values are the Free Exercise DB's own `equipment` strings; anything
// unrecognised falls back to a dumbbell.

export interface EquipmentIconProps {
  equipment?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface GlyphProps {
  size: number;
  color: string;
  strokeWidth: number;
}

/** Shared <Svg> wrapper — every custom glyph is drawn on a 24x24 grid. */
const Glyph: React.FC<GlyphProps & { children: React.ReactNode }> = ({
  size,
  children,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {children}
  </Svg>
);

/** A straight bar with a plate stack at each end. */
const BarbellGlyph: React.FC<GlyphProps> = (props) => {
  const { color, strokeWidth } = props;
  return (
    <Glyph {...props}>
      <Line
        x1="7.5"
        y1="12"
        x2="16.5"
        y2="12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Inner plates — the tall pair. */}
      <Line x1="6.5" y1="7.5" x2="6.5" y2="16.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="17.5" y1="7.5" x2="17.5" y2="16.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Outer plates and the sleeve ends. */}
      <Line x1="3.5" y1="9.5" x2="3.5" y2="14.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="20.5" y1="9.5" x2="20.5" y2="14.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="3.5" y1="12" x2="6.5" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="17.5" y1="12" x2="20.5" y2="12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Glyph>
  );
};

/** Barbell with the cambered middle an EZ bar is recognised by. */
const EzBarGlyph: React.FC<GlyphProps> = (props) => {
  const { color, strokeWidth } = props;
  return (
    <Glyph {...props}>
      <Path
        d="M7.5 12 L9 9.8 L11 14.2 L13 9.8 L15 14.2 L16.5 12"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="6" y1="8.5" x2="6" y2="15.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="18" y1="8.5" x2="18" y2="15.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="3.5" y1="10" x2="3.5" y2="14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1="20.5" y1="10" x2="20.5" y2="14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Glyph>
  );
};

/** Handle arc over a rounded bell. */
const KettlebellGlyph: React.FC<GlyphProps> = (props) => {
  const { color, strokeWidth } = props;
  return (
    <Glyph {...props}>
      <Path
        d="M9 8.5a3 3 0 0 1 6 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M8.6 9.4C6.8 11 6 13.2 6.6 15.6 7 17.5 8.4 19 12 19s5-1.5 5.4-3.4c.6-2.4-.2-4.6-2-6.2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Glyph>
  );
};

/** Two lengths of band, drawn as opposing waves with anchor loops. */
const BandGlyph: React.FC<GlyphProps> = (props) => {
  const { color, strokeWidth } = props;
  return (
    <Glyph {...props}>
      <Path
        d="M3 9c3 0 3 3 6 3s3-3 6-3 3 3 6 3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M3 15c3 0 3 3 6 3s3-3 6-3 3 3 6 3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.55}
      />
    </Glyph>
  );
};

/** Upright frame with a weight stack — the shape every gym machine shares. */
const MachineGlyph: React.FC<GlyphProps> = (props) => {
  const { color, strokeWidth } = props;
  return (
    <Glyph {...props}>
      <Line x1="5" y1="3.5" x2="5" y2="20.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Rect
        x="8.5"
        y="7"
        width="11"
        height="11"
        rx="2"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Line x1="8.5" y1="11" x2="19.5" y2="11" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="8.5" y1="14.5" x2="19.5" y2="14.5" stroke={color} strokeWidth={strokeWidth} />
      <Line x1="5" y1="5" x2="14" y2="5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Glyph>
  );
};

/** A ball with its seam, for medicine and exercise balls. */
const BallGlyph: React.FC<GlyphProps> = (props) => {
  const { color, strokeWidth } = props;
  return (
    <Glyph {...props}>
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5 8.5c4.5 1.6 9.5 1.6 14 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M5 15.5c4.5-1.6 9.5-1.6 14 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Glyph>
  );
};

type Renderer = React.FC<GlyphProps>;

/** Wraps a lucide icon in the same props shape as the custom glyphs. */
function fromLucide(Icon: typeof Dumbbell): Renderer {
  return ({ size, color, strokeWidth }) => (
    <Icon size={size} color={color} strokeWidth={strokeWidth} />
  );
}

const BY_EQUIPMENT: Record<string, { render: Renderer; accent: string }> = {
  barbell: { render: BarbellGlyph, accent: colors.primary },
  'e-z curl bar': { render: EzBarGlyph, accent: colors.primary },
  dumbbell: { render: fromLucide(Dumbbell), accent: colors.primary },
  kettlebells: { render: KettlebellGlyph, accent: colors.hypertrophy },
  cable: { render: fromLucide(Cable), accent: colors.secondary },
  machine: { render: MachineGlyph, accent: colors.secondary },
  bands: { render: BandGlyph, accent: colors.fats },
  'medicine ball': { render: BallGlyph, accent: colors.fats },
  'exercise ball': { render: BallGlyph, accent: colors.fats },
  'foam roll': { render: fromLucide(Cylinder), accent: colors.recovery },
  'body only': { render: fromLucide(PersonStanding), accent: colors.success },
  other: { render: fromLucide(Dumbbell), accent: colors.textSecondary },
};

function lookup(equipment?: string | null) {
  const key = (equipment ?? '').trim().toLowerCase();
  return BY_EQUIPMENT[key] ?? BY_EQUIPMENT.dumbbell;
}

/** The colour this equipment is drawn in — also used for the icon's
 * tinted background, so the two always agree. */
export function equipmentAccent(equipment?: string | null): string {
  return lookup(equipment).accent;
}

export const EquipmentIcon: React.FC<EquipmentIconProps> = ({
  equipment,
  size = 18,
  color,
  strokeWidth = 2,
}) => {
  const entry = lookup(equipment);
  const Render = entry.render;
  return <Render size={size} color={color ?? entry.accent} strokeWidth={strokeWidth} />;
};

export default EquipmentIcon;
