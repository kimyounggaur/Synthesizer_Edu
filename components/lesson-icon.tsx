import {
  AudioLines,
  Camera,
  KeyboardMusic,
  Check,
  Layers,
  Music2,
  MoveHorizontal,
  Volume2,
  ArrowUpDown,
  Search,
  Monitor,
} from 'lucide-react';
export function LessonIcon({
  name,
  size = 23,
}: {
  name: string;
  size?: number;
}) {
  const icons: Record<string, typeof AudioLines> = {
    volume: Volume2,
    piano: KeyboardMusic,
    layers: Layers,
    music: Music2,
    split: MoveHorizontal,
    octave: ArrowUpDown,
    transpose: AudioLines,
    check: Check,
    search: Search,
    screen: Monitor,
    camera: Camera,
  };
  const Icon = icons[name] || AudioLines;
  return <Icon size={size} />;
}
