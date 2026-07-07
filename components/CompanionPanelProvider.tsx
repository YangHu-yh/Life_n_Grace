"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

export type CompanionPageContext = {
  topic: string;
  notes?: string;
};

type CompanionPanelState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  pageContext: CompanionPageContext | null;
  setPageContext: (context: CompanionPageContext | null) => void;
};

const CompanionPanelContext = createContext<CompanionPanelState | null>(null);

// Sensible page-derived defaults so the panel has context even on pages that
// never call setPageContext explicitly.
function defaultContextForPath(pathname: string): CompanionPageContext | null {
  if (pathname.startsWith("/prayers")) {
    return { topic: "Looking over my prayer wall and journal" };
  }
  if (pathname.startsWith("/topics")) {
    return { topic: "Browsing prayer topics and Scripture" };
  }
  if (pathname.startsWith("/profile")) {
    return { topic: "Reviewing my prayer habits" };
  }
  return null;
}

export function CompanionPanelProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<CompanionPageContext | null>(
    null
  );

  // Navigating resets the context to the new page's default; pages that know
  // better (e.g. a topic detail page) override it via setPageContext.
  useEffect(() => {
    setPageContext(defaultContextForPath(pathname));
  }, [pathname]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, open, close, pageContext, setPageContext }),
    [isOpen, open, close, pageContext]
  );

  return (
    <CompanionPanelContext.Provider value={value}>
      {children}
    </CompanionPanelContext.Provider>
  );
}

export function useCompanionPanel(): CompanionPanelState {
  const context = useContext(CompanionPanelContext);
  if (!context) {
    throw new Error(
      "useCompanionPanel must be used within CompanionPanelProvider"
    );
  }
  return context;
}
