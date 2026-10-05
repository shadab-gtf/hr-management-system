import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApplyForm, ReferralSheet } from "@/components/features/recruitment/careers-forms";
import { AppIcon } from "@/components/ui/app-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText, StatusBadge } from "@/components/ui/display";
import { EmptyState } from "@/components/ui/empty-state";
import { employmentTypeLabels, type MyReferral, type PublicJob } from "@/types/recruitment";

const referralStatus = {
  in_process: { label: "In process", tone: "info" },
  hired: { label: "Hired", tone: "success" },
  not_selected: { label: "Not selected", tone: "neutral" },
} as const;

export function CareersShell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return (
    <div className="careers">
      <header className="careers-top">
        <Link href="/careers" className="careers-brand">
          <Image src="/brand/gtf-logo.png" alt="GTF Technologies" width={500} height={277} sizes="72px" className="careers-logo" priority />
          <span>Careers</span>
        </Link>
        <Link href={signedIn ? "/dashboard" : "/login?next=/careers"} className="button button--secondary button--sm">
          {signedIn ? "Back to GTF HR" : "Employee sign in"}
        </Link>
      </header>
      <main className="careers-main" id="main">
        {children}
      </main>
      <footer className="careers-foot muted small">GTF Technologies · Noida · Gurugram · Mumbai · Remote. We never ask candidates for money.</footer>
    </div>
  );
}

function JobMeta({ job }: { job: PublicJob }) {
  return (
    <span className="careers-meta">
      <span>
        <AppIcon name="building" size={16} /> {job.department}
      </span>
      <span>
        <AppIcon name="location" size={16} /> {job.location}
      </span>
      <span>
        <AppIcon name="briefcase" size={16} /> {employmentTypeLabels[job.employmentType]} · {job.experienceMin}–{job.experienceMax} yrs
      </span>
    </span>
  );
}

export function CareersListSection({ jobs }: { jobs: PublicJob[] }) {
  return (
    <div className="stack">
      <section className="careers-hero" aria-labelledby="careers-title">
        <h1 id="careers-title">Build brands and products with GTF</h1>
        <p className="muted">We&apos;re a design, engineering and performance-marketing studio. Explore open roles and apply in a couple of minutes.</p>
      </section>
      {jobs.length ? (
        <ul className="careers-list" aria-label="Open roles">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link href={`/careers/${job.id}`} className="careers-job">
                <span className="careers-job-title">{job.title}</span>
                <JobMeta job={job} />
                <span className="muted small">
                  Posted <DateText value={job.postedOn} />
                </span>
                <AppIcon name="chevronRight" size={20} className="careers-job-chevron" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="briefcase" title="No open roles right now" description="Check back soon — new roles are posted here first." />
      )}
    </div>
  );
}

export function CareersJobSection({ job, signedIn, referrals }: { job: PublicJob; signedIn: boolean; referrals: MyReferral[] }) {
  const mine = referrals.filter((item) => item.jobId === job.id);
  return (
    <div className="stack">
      <Link href="/careers" className="back-link">
        <AppIcon name="back" size={16} />
        All roles
      </Link>
      <header className="careers-hero">
        <p className="page-eyebrow">{job.reference}</p>
        <h1>{job.title}</h1>
        <JobMeta job={job} />
      </header>
      <div className="split">
        <div className="stack">
          <Card>
            <CardHeader title="About the role" />
            <CardBody className="stack">
              <p className="text-block">{job.description}</p>
              <div className="chip-row" aria-label="Skills">
                {job.skills.map((skill) => (
                  <span key={skill} className="chip">
                    {skill}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
          {signedIn && (
            <Card>
              <CardHeader title="Know someone great?" description="Employees can refer candidates for this role." action={<ReferralSheet jobId={job.id} jobTitle={job.title} />} />
              <CardBody>
                {mine.length ? (
                  <ul className="list" aria-label="Your referrals for this role">
                    {mine.map((item) => (
                      <li key={item.id} className="list-row">
                        <div className="list-row-inner">
                          <span className="list-text">
                            <span className="list-title">{item.name}</span>
                            <span className="list-meta">
                              Referred <DateText value={item.referredAt.slice(0, 10)} />
                            </span>
                          </span>
                          <span className="list-trailing">
                            <StatusBadge status={referralStatus[item.status]} />
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">You haven&apos;t referred anyone for this role yet.</p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader title="Apply" description={<Badge tone="info">Takes about 2 minutes</Badge>} />
          <CardBody>
            <ApplyForm jobId={job.id} jobTitle={job.title} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
