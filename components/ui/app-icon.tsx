"use client";

import {
  ArrowRight,
  TickCircle,
  CloseCircle,
  Layer,
  ColorSwatch,
  Text,
  Category,
  People,
  Sun1,
  Moon,
  Monitor,
  ArrowDown2,
  SearchNormal1,
  Setting2,
  InfoCircle,
  Add,
  ExportSquare,
  ShieldTick,
  SidebarLeft,
} from "iconsax-reactjs";

const icons = {
  arrow: ArrowRight,
  check: TickCircle,
  close: CloseCircle,
  layers: Layer,
  palette: ColorSwatch,
  text: Text,
  grid: Category,
  people: People,
  sun: Sun1,
  moon: Moon,
  monitor: Monitor,
  chevron: ArrowDown2,
  search: SearchNormal1,
  settings: Setting2,
  info: InfoCircle,
  plus: Add,
  external: ExportSquare,
  shield: ShieldTick,
  sidebar: SidebarLeft,
};
export type IconName = keyof typeof icons;
interface AppIconProps {
  name: IconName;
  size?: 16 | 20 | 24;
  label?: string;
}

export function AppIcon({ name, size = 20, label }: AppIconProps) {
  const Icon = icons[name];
  return (
    <span
      className="app-icon"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon
        size={size}
        color="currentColor"
        variant="Linear"
        aria-hidden="true"
      />
    </span>
  );
}
