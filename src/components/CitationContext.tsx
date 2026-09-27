"use client";

import { createContext, useContext } from "react";
import type { Citation } from "@/lib/types";

/**
 * What clicking a citation does, provided once by the page (open the source in
 * the notebook, or navigate to it from search) so every Markdown and
 * InlineCited renderer can make citations actionable without threading a
 * callback through each artifact component.
 */
export const CitationContext = createContext<((c: Citation) => void) | null>(null);

export const useCitationHandler = () => useContext(CitationContext);
