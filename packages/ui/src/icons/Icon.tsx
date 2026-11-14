import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/**
 * Dyce icon set: 24x24, stroke 2-2.4, rounded caps and joins. No emoji as UI icons (CLAUDE.md).
 * These are the Phase 0 set from docs/DESIGN_SYSTEM.md; the design-system engineer refines the artwork.
 */
export type IconName =
  | 'chat'
  | 'planet'
  | 'wallet'
  | 'search'
  | 'plus'
  | 'back'
  | 'menu'
  | 'shield'
  | 'block'
  | 'qr'
  | 'scan'
  | 'send'
  | 'request'
  | 'history'
  | 'bell'
  | 'gear'
  | 'check';

export const ICON_NAMES: IconName[] = [
  'chat',
  'planet',
  'wallet',
  'search',
  'plus',
  'back',
  'menu',
  'shield',
  'block',
  'qr',
  'scan',
  'send',
  'request',
  'history',
  'bell',
  'gear',
  'check',
];

export type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 24, color, strokeWidth = 2.2 }: IconProps) {
  const p = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    // Decorative: the parent control carries the accessible label. The hiding props live on a View
    // because react-native-svg forwards unknown props to the DOM on web.
    // `aria-hidden` maps to the right native flags on iOS/Android and to the DOM attribute on web.
    <View style={{ width: size, height: size }} aria-hidden>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === 'chat' && (
          <Path
            {...p}
            d="M21 11.5a8.5 8.5 0 0 1-12.2 7.6L3.5 20.5l1.4-4.7A8.5 8.5 0 1 1 21 11.5Z"
          />
        )}
        {name === 'planet' && (
          <>
            <Circle {...p} cx={12} cy={12} r={5.5} />
            <Ellipse {...p} cx={12} cy={12} rx={10} ry={3.6} transform="rotate(-24 12 12)" />
          </>
        )}
        {name === 'wallet' && (
          <>
            <Rect {...p} x={3} y={6} width={18} height={13} rx={3.5} />
            <Path {...p} d="M3.5 10h17" />
            <Circle cx={16.5} cy={14.5} r={1.1} fill={color} />
          </>
        )}
        {name === 'search' && (
          <>
            <Circle {...p} cx={11} cy={11} r={6.5} />
            <Path {...p} d="M16 16l4.5 4.5" />
          </>
        )}
        {name === 'plus' && <Path {...p} d="M12 5v14M5 12h14" />}
        {name === 'check' && <Path {...p} d="M5 12.5l4.5 4.5L19 7.5" />}
        {name === 'back' && <Path {...p} d="M15 5l-7 7 7 7" />}
        {name === 'menu' && <Path {...p} d="M4 7h16M4 12h16M4 17h16" />}
        {name === 'shield' && (
          <Path {...p} d="M12 3l7.5 3v5.5c0 4.4-3.1 8-7.5 9.5-4.4-1.5-7.5-5.1-7.5-9.5V6L12 3Z" />
        )}
        {name === 'block' && (
          <>
            <Circle {...p} cx={12} cy={12} r={9} />
            <Path {...p} d="M5.6 5.6l12.8 12.8" />
          </>
        )}
        {name === 'qr' && (
          <>
            <Rect {...p} x={3.5} y={3.5} width={6.5} height={6.5} rx={1.5} />
            <Rect {...p} x={14} y={3.5} width={6.5} height={6.5} rx={1.5} />
            <Rect {...p} x={3.5} y={14} width={6.5} height={6.5} rx={1.5} />
            <Path {...p} d="M14 14h3v3h-3zM20.5 14v.5M17 20.5h3.5M20.5 17.5v3" />
          </>
        )}
        {name === 'scan' && (
          <Path
            {...p}
            d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16"
          />
        )}
        {name === 'send' && <Path {...p} d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z" />}
        {name === 'request' && <Path {...p} d="M12 4v11M7 11l5 5 5-5M5 20h14" />}
        {name === 'history' && (
          <Path {...p} d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2" />
        )}
        {name === 'bell' && (
          <Path {...p} d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15L6 16.5ZM10 21.5h4" />
        )}
        {name === 'gear' && (
          <>
            <Circle {...p} cx={12} cy={12} r={3.2} />
            <Path
              {...p}
              d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"
            />
          </>
        )}
      </Svg>
    </View>
  );
}
