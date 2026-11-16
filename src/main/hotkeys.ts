/* LexiPop - global keyboard trigger (Ctrl+Shift+D). Ctrl+Right-click is handled by InputHelper's mouse hook. */
import { globalShortcut } from "electron";

export function registerHotkeys(onTrigger: () => void): { unregister: () => void } {
  const combo = "Control+Alt+L";
  const ok = globalShortcut.register(combo, onTrigger);
  if (!ok) console.warn(`[LexiPop] could not register ${combo} (already in use?)`);
  return { unregister: () => globalShortcut.unregisterAll() };
}
