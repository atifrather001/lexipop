/* LexiPop - system tray icon and menu */
import { app, Menu, Tray, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";

export interface TrayActions {
  openMain: () => void;
  showAbout: () => void;
  quit: () => void;
}

function findIcon(dir: string): string {
  const candidates = [
    path.join(dir, "..", "..", "..", "build", "icon.png"),   // dev: dist/electron/main -> build/
    path.join(process.resourcesPath ?? "", "icon.png"),       // packaged (extraResources)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return "";
}

export function createTray(dirname: string, actions: TrayActions): Tray {
  const iconPath = findIcon(dirname);
  const img = iconPath ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  const tray = new Tray(img);
  tray.setToolTip("LexiPop — Ctrl+Right-click a word, or Ctrl+Alt+L");

  const rebuild = () => {
    const login = app.getLoginItemSettings().openAtLogin;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open LexiPop", click: actions.openMain },
        { type: "separator" },
        {
          label: "Start with Windows",
          type: "checkbox",
          checked: login,
          enabled: app.isPackaged,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked });
            rebuild();
          },
        },
        { type: "separator" },
        { label: "About LexiPop", click: actions.showAbout },
        { label: "Quit", click: actions.quit },
      ])
    );
  };
  rebuild();
  tray.on("click", actions.openMain);
  tray.on("double-click", actions.openMain);
  return tray;
}
