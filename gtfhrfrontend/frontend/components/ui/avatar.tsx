import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const tones = ["magenta", "cyan", "yellow", "neutral"] as const;
const pixels = { sm: 32, md: 36, lg: 48, xl: 72 } as const;

/** Stable tone from an id so the same person always gets the same colour token. */
function toneFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length] ?? "neutral";
}

/**
 * Photo when available, initials otherwise. Photo URLs are versioned by the
 * server, so a new upload changes the URL and replaces the image everywhere.
 */
export function Avatar({
  initials,
  seed,
  src,
  size = "md",
  className,
}: {
  initials: string;
  seed: string;
  src?: string | null;
  size?: keyof typeof pixels;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn("avatar", `avatar--${toneFor(seed)}`, `avatar--${size}`, src && "avatar--photo", className)}>
      {src ? (
        // Private, access-checked route: bypass the shared image optimizer cache.
        <Image src={src} alt="" width={pixels[size]} height={pixels[size]} unoptimized className="avatar-img" />
      ) : (
        initials
      )}
    </span>
  );
}
