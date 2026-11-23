import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const RED = { disc: '#C93E1C', edge: '#7A1E0C', rim: 'rgba(255,255,255,0.28)' };
const BLACK = { disc: '#1E1A17', edge: '#000000', rim: 'rgba(255,255,255,0.22)' };

/** A disc: red or black, with a gold crown when it is a king. */
export function Disc({
  size,
  seat,
  king,
  lifted,
}: {
  size: number;
  seat: 0 | 1;
  king: boolean;
  lifted?: boolean;
}) {
  const c = seat === 0 ? RED : BLACK;
  const lift = Math.max(2, size * 0.08);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: c.disc,
        borderWidth: Math.max(2, size * 0.07),
        borderColor: c.rim,
        marginTop: lifted ? -lift * 1.5 : 0,
        boxShadow: `0px ${lift}px 0px ${c.edge}, 0px ${lift * 2}px ${lift * 2}px rgba(0,0,0,0.45)`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {king ? (
        <Svg width={size * 0.55} height={size * 0.4} viewBox="0 0 40 26">
          <Path
            d="M3 24 L6 6 L14 15 L20 2 L26 15 L34 6 L37 24 Z"
            fill="#FFD27A"
            stroke="#A86F12"
            strokeWidth={2}
          />
        </Svg>
      ) : null}
    </View>
  );
}
