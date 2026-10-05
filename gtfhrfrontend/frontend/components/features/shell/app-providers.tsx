"use client";

import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { makeQueryClient } from "@/lib/state/query-client";
import { LazyMotion, MotionConfig } from "framer-motion";

const loadMotionFeatures = () =>
  import("@/lib/motion/features").then((module) => module.default);

export function AppProviders({ children }: { children: ReactNode }) {
  // A Suspense boundary below this provider protects its lifetime during streaming.
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <LazyMotion features={loadMotionFeatures} strict>
        <MotionConfig reducedMotion="user">
          {children}
          <Toaster
            position="bottom-right"
            closeButton
            duration={4000}
            toastOptions={{ className: "gtf-toast" }}
          />
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
