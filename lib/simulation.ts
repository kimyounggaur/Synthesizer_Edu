import type { Step } from './content';
export type Simulation = {
  dial: number;
  display: string;
  dual: boolean;
  split: boolean;
  octave: number;
  transpose: number;
};
export function initialSimulation(id: string): Simulation {
  return {
    dial: 35,
    display:
      id === 'octave'
        ? 'OCTAVE  0'
        : id === 'transpose'
          ? 'TRANSPOSE  0'
          : 'PIANO  001',
    dual: false,
    split: false,
    octave: 0,
    transpose: 0,
  };
}
export function applySimulation(
  old: Simulation,
  step: Step,
  id: string,
  value?: number,
): Simulation {
  const next = { ...old };
  if (value !== undefined) next.dial = value;
  else if (step.motion === 'rotate' || step.motion === 'slide')
    next.dial = step.value ?? 50;
  if (id === 'front.dual') {
    next.dual = step.value !== 0;
    next.display = next.dual ? 'UPPER + LOWER' : 'PIANO  001';
  }
  if (id === 'front.split') {
    next.split = step.value !== 0;
    next.display = next.split ? 'LOWER | UPPER' : 'PIANO  001';
  }
  if (id === 'front.piano') next.display = 'PIANO  001';
  if (id === 'front.keyboard') next.display = 'KEYBOARD  001';
  if (id === 'front.orchestra') next.display = 'ORCHESTRA  001';
  if (id === 'front.value')
    next.display =
      next.display.split('  ')[0] +
      '  ' +
      String((value ?? step.value ?? 2) + 1).padStart(3, '0');
  if (id.startsWith('front.octave_') && step.motion !== 'hold_and_press') {
    next.octave = step.value ?? 0;
    next.display = 'OCTAVE  ' + next.octave;
  }
  if (step.motion === 'hold_and_press') {
    next.transpose = step.value ?? 0;
    next.display = 'TRANSPOSE  ' + next.transpose;
  }
  return next;
}
