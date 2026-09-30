"use client";

import { useEffect, useState } from "react";

/** Local preview URL for a chosen file; revoked automatically. */
export function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  const select = (file: File | null | undefined) => setUrl(file ? URL.createObjectURL(file) : null);
  const clear = () => setUrl(null);
  return { url, select, clear };
}
