import { View } from 'react-native';
import { SliderRow } from './r3f-common/SliderRow';
import { hudStyles } from './r3f-common/hud';
import {
  AIM_MAX,
  AIM_STEP,
  POWER_MAX,
  POWER_STEP,
  aimLabel,
  powerLabel,
  stepAim,
  stepPower,
} from './basketball-logic';

/** The accessible way to shoot: an Aim slider and a Power slider, each with − and + buttons and screen-reader actions. */
export function BasketballControls({
  aim,
  power,
  onAim,
  onPower,
}: {
  aim: number;
  power: number;
  onAim: (v: number) => void;
  onPower: (v: number) => void;
}) {
  return (
    <View style={hudStyles.glassPanel}>
      <SliderRow
        label="Aim"
        value={aim}
        min={-AIM_MAX}
        max={AIM_MAX}
        step={5}
        valueText={aimLabel(aim)}
        onChange={onAim}
        onStep={(d) => onAim(stepAim(aim, d, AIM_STEP))}
      />
      <SliderRow
        label="Power"
        value={power}
        min={0}
        max={POWER_MAX}
        step={5}
        valueText={powerLabel(power)}
        onChange={onPower}
        onStep={(d) => onPower(stepPower(power, d, POWER_STEP))}
      />
    </View>
  );
}
