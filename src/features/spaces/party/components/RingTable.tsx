import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ringSlots } from '../common-logic';

/**
 * Seats around a table: you at the bottom, the others clockwise in table order, on an ellipse that fills
 * the width. `surface` draws the table itself (it gets the size), `center` sits in the middle, and
 * `renderSeat` draws each player. Positions come from `ringSlots`, so every screen agrees.
 */
export function RingTable({
  players,
  myId,
  height,
  seatWidth = 84,
  seatHeight = 120,
  surface,
  center,
  renderSeat,
}: {
  players: readonly string[];
  myId: string;
  height: number;
  seatWidth?: number;
  seatHeight?: number;
  surface?: (size: { w: number; h: number }) => ReactNode;
  center?: ReactNode;
  renderSeat: (id: string, index: number) => ReactNode;
}) {
  const [w, setW] = useState(0);
  const slots = ringSlots(players, myId);
  const rx = Math.max(0, w / 2 - seatWidth / 2 - 4);
  const ry = Math.max(0, height / 2 - seatHeight / 2 - 2);
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <>
          <View style={StyleSheet.absoluteFill} pointerEvents="none" aria-hidden>
            {surface?.({ w, h: height })}
          </View>
          {center ? (
            <View style={styles.center} pointerEvents="box-none">
              {center}
            </View>
          ) : null}
          {players.map((id, i) => {
            const s = slots[i]!;
            return (
              <View
                key={id}
                style={{
                  position: 'absolute',
                  width: seatWidth,
                  height: seatHeight,
                  left: w / 2 + s.x * rx - seatWidth / 2,
                  top: height / 2 + s.y * ry - seatHeight / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {renderSeat(id, i)}
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
