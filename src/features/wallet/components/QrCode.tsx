import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import qrcode from 'qrcode-generator';

/**
 * A QR code for `value`, drawn as one SVG path. Always dark on white with a quiet zone, whatever the theme,
 * because scanners need the contrast. The wallet puts only a link with a request code in here.
 */
export function QrCode({
  value,
  size = 224,
  label = 'QR code',
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M'); // type 0 = pick the smallest size that fits
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { count: n, path: d };
  }, [value]);

  const quiet = 3;
  const box = count + quiet * 2;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${box} ${box}`}
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <Rect x={-quiet} y={-quiet} width={box} height={box} fill="#FFFFFF" />
      <Path d={path} fill="#1B140F" />
    </Svg>
  );
}
