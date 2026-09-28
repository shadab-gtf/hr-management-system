import Link from "next/link";
import type { FoundationData } from "@/types/foundation";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ComponentPlayground } from "@/components/features/component-playground";
import { TablePreview } from "@/components/features/table-preview";

const summary: {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
  accent: string;
}[] = [
  {
    label: "One visual language",
    value: "GTF, at heart",
    detail: "Inspired by our three brand strokes",
    icon: "palette",
    accent: "magenta",
  },
  {
    label: "Thoughtful typography",
    value: "Google Sans",
    detail: "Clear, familiar, and locally hosted",
    icon: "text",
    accent: "cyan",
  },
  {
    label: "Every environment",
    value: "Light & dark",
    detail: "A comfortable view, day or night",
    icon: "sun",
    accent: "yellow",
  },
  {
    label: "Shared building blocks",
    value: "Made to reuse",
    detail: "Consistent details across every screen",
    icon: "layers",
    accent: "neutral",
  },
];
const colors = [
  {
    name: "Magenta",
    hex: "#E24397",
    description: "Our signature",
    className: "swatch--magenta",
  },
  {
    name: "Cyan",
    hex: "#2AAEE4",
    description: "A fresh perspective",
    className: "swatch--cyan",
  },
  {
    name: "Yellow",
    hex: "#FDE93D",
    description: "A little optimism",
    className: "swatch--yellow",
  },
];
export function FoundationSection({ data }: { data: FoundationData }) {
  return (
    <div className="foundation-content">
      <section id="overview" className="intro">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-line" />
            GTF HR · FOUNDATION 01
          </p>
          <h1>
            Good work starts here<span className="title-dot">.</span>
          </h1>
          <p className="intro-copy">
            A shared foundation for a more thoughtful people experience.
          </p>
        </div>
        <a className="button button--secondary" href="#components">
          Explore components <AppIcon name="arrow" size={16} />
        </a>
      </section>
      <div className="preview-notice">
        <AppIcon name="info" size={16} />
        <p>
          You’re exploring the foundation. All people and records are fictional.
        </p>
        <Badge>FE1 preview</Badge>
      </div>
      <div className="summary-grid">
        {summary.map((item) => (
          <div className="summary-card" key={item.value}>
            <div className="summary-top">
              <span>{item.label}</span>
              <span className={`summary-icon avatar--${item.accent}`}>
                <AppIcon name={item.icon} />
              </span>
            </div>
            <h2>{item.value}</h2>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
      <div className="section-divider">
        <span>THE DETAILS THAT BRING US TOGETHER</span>
        <span>01 / FOUNDATIONS</span>
      </div>
      <div className="preview-grid">
        <Card id="brand">
          <CardHeader
            title="Distinctly GTF"
            description="Three colors. One connected experience."
            action={<span className="tiny-label">BRAND PALETTE</span>}
          />
          <div className="swatch-grid">
            {colors.map((color) => (
              <div className="swatch-item" key={color.name}>
                <div className={`swatch ${color.className}`}>
                  <span aria-hidden="true">↗</span>
                  <span>{color.hex}</span>
                </div>
                <strong>{color.name}</strong>
                <span className="muted small">{color.description}</span>
              </div>
            ))}
          </div>
          <div className="card-footnote">
            <span className="mini-palette">
              <i />
              <i />
              <i />
            </span>
            <span>Brand accents, balanced with calm neutral surfaces.</span>
          </div>
        </Card>
        <Card id="typography" className="typography-card">
          <CardHeader
            title="Clarity in every word"
            description="Google Sans · Variable 400–700"
            action={<span className="type-mark">Aa</span>}
          />
          <div className="type-specimen">
            <p className="specimen-heading">
              People make
              <br />
              the difference.
            </p>
            <p>
              A little more human.
              <br />A lot more possibility.
            </p>
          </div>
          <div className="type-footer">
            <span>Aa Bb Cc Dd Ee Ff Gg</span>
            <span>0123456789</span>
            <Badge>Self-hosted</Badge>
          </div>
        </Card>
      </div>
      <div className="preview-grid components-grid">
        <Card id="components">
          <CardHeader
            title="Small details. Better interactions."
            description="Try the shared inputs, buttons, and dialog."
            action={<AppIcon name="layers" />}
          />
          <ComponentPlayground departments={data.departments} />
        </Card>
        <Card className="status-card">
          <CardHeader
            title="A language for every state"
            description="Always clear. Never just a color."
          />
          <div className="status-list">
            <div>
              <Badge tone="success">Approved</Badge>
              <span>Everything is in place</span>
            </div>
            <div>
              <Badge tone="warning">Pending review</Badge>
              <span>A decision is needed</span>
            </div>
            <div>
              <Badge tone="info">In progress</Badge>
              <span>Moving things forward</span>
            </div>
            <div>
              <Badge tone="danger">Needs attention</Badge>
              <span>A clear next step</span>
            </div>
          </div>
          <div className="icon-gallery" aria-label="Iconsax icon examples">
            {(
              [
                "people",
                "layers",
                "palette",
                "shield",
                "settings",
                "check",
              ] as const
            ).map((name) => (
              <span key={name}>
                <AppIcon name={name} label={name} />
              </span>
            ))}
            <p>
              Iconsax <span>· Linear · 20px</span>
            </p>
          </div>
        </Card>
      </div>
      <Card id="data-preview" className="data-card">
        <CardHeader
          title="Familiar people. Fictional data."
          description="A preview of the shared employee table, search, and status patterns."
          action={<Badge tone="info">Sample data</Badge>}
        />
        <TablePreview members={data.members} />
      </Card>
      <section id="states" className="states-section">
        <div className="section-heading">
          <h2>A considered experience, in every state.</h2>
          <p className="muted">
            Helpful feedback and gentle movement keep the interface out of your
            way.
          </p>
        </div>
        <div className="state-grid">
          <div className="state-tile">
            <div className="loading-example" aria-hidden="true">
              <Skeleton className="skeleton-avatar" />
              <div>
                <Skeleton className="skeleton-label" />
                <Skeleton className="skeleton-copy" />
              </div>
            </div>
            <h3>
              <Link href="/loading-preview" className="inline-link">
                A moment of patience ↗
              </Link>
            </h3>
            <p>Layout-matched skeletons keep their place while a view loads.</p>
          </div>
          <div className="state-tile">
            <span className="state-tile-icon">
              <AppIcon name="search" size={24} />
            </span>
            <h3>Room for what’s next</h3>
            <p>Search for an unknown name above to try the empty state.</p>
          </div>
          <div className="state-tile">
            <span className="state-tile-icon">
              <AppIcon name="shield" size={24} />
            </span>
            <h3>Calm, by design</h3>
            <p>
              Subtle feedback, short transitions, and respect for reduced
              motion.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
