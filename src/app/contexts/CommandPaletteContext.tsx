import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Ctx = { open: boolean; openPalette: () => void; closePalette: () => void };
const Ctx = createContext<Ctx>({ open: false, openPalette: () => {}, closePalette: () => {} });

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return <Ctx.Provider value={{ open, openPalette, closePalette }}>{children}</Ctx.Provider>;
}

export function useCommandPalette() {
  return useContext(Ctx);
}
