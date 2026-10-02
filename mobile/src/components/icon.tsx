// Line icons in the same style as the web app and the wireframes
// (24px grid, round caps, drawn with a stroke rather than filled).
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const PATHS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  logbook: ['M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z', 'M8 9h8', 'M8 13h8', 'M8 17h5'],
  plus: ['M12 5v14', 'M5 12h14'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  more: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z'],
  fuel: ['M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18', 'M3 22h10', 'M14 9h3l3 3v6a1 1 0 0 1-1 1h-1', 'M6 7h4'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z'],
  gauge: ['M12 14l4-4', 'M3.3 17a9 9 0 1 1 17.4 0'],
  // A pound sign - the app's money is in £, so no dollar here.
  quote: ['M17 7.5A4 4 0 0 0 9.5 6C9 7 9 8 9 9.5V13c0 2.6-.9 5-3 7h12', 'M6 13.5h8'],
  part: ['M12 2v4', 'M12 18v4', 'M4.9 4.9l2.8 2.8', 'M16.3 16.3l2.8 2.8', 'M2 12h4', 'M18 12h4', 'M4.9 19.1l2.8-2.8', 'M16.3 7.7l2.8-2.8'],
  bill: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8'],
  labour: ['M15 12l-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9', 'M17.6 6.4 20 4', 'M13 3l8 8', 'M11 5l8 8'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  check: ['M20 6 9 17l-5-5'],
  compare: ['M12 3v18', 'M8 21h8', 'M4 7h16', 'M7 7 4 14h6z', 'M17 7l-3 7h6z'],
  calculator: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M8.5 6.5h7v3h-7z', 'M9 14h.01', 'M12 14h.01', 'M15 14h.01', 'M9 18h.01', 'M12 18h.01', 'M15 18h.01'],
  search: ['M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z', 'm20 20-4.2-4.2'],
  chart: ['M3 20h18', 'M6 16v-5', 'M11 16V6', 'M16 16v-8', 'M21 16v-3'],
  story: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z', 'M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5', 'M9 8h7', 'M9 12h5'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  transfer: ['M4 8h14', 'm14 4 4 4-4 4', 'M20 16H6', 'm10 12-4 4 4 4'],
  settings: ['M4 6h9', 'M17 6h3', 'M15 4v4', 'M4 12h3', 'M11 12h9', 'M9 10v4', 'M4 18h11', 'M19 18h1', 'M17 16v4'],
  shield: ['M12 3l8 3v6c0 5-3.4 8.3-8 9.5C7.4 20.3 4 17 4 12V6z', 'm9 12 2 2 4-4'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  pencil: ['M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z', 'm15 5 4 4'],
  dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z'],
  share: ['M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'm8.6 13.5 6.8 4', 'm15.4 6.5-6.8 4'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color, strokeWidth = 2 }: { name: IconName; size?: number; color: ColorValue; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
      {name === 'camera' || name === 'part' ? <Circle cx={12} cy={name === 'camera' ? 13 : 12} r={name === 'camera' ? 4 : 3} /> : null}
    </Svg>
  );
}
