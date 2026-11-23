import { Platform, Share } from 'react-native';
import { exportFileName, exportToText } from './account-logic';

/**
 * Hands the person their data file. On the web it is a real download (a file named by the date). On a phone it opens
 * the system share sheet with the JSON as text, so it can be saved to Files or sent to an email app: Dyce keeps no
 * extra file-system permission for it. Returns false if the person closed the sheet without choosing anything.
 */
export async function saveExport(data: unknown, now: Date = new Date()): Promise<boolean> {
  const text = exportToText(data);
  const name = exportFileName(now);
  if (Platform.OS === 'web') {
    const g = globalThis as unknown as {
      Blob: new (parts: string[], opts: { type: string }) => unknown;
      URL: { createObjectURL(b: unknown): string; revokeObjectURL(u: string): void };
      document: {
        createElement(tag: string): {
          href: string;
          download: string;
          click(): void;
          remove(): void;
        };
        body: { appendChild(el: unknown): void };
      };
    };
    const url = g.URL.createObjectURL(new g.Blob([text], { type: 'application/json' }));
    const a = g.document.createElement('a');
    a.href = url;
    a.download = name;
    g.document.body.appendChild(a);
    a.click();
    a.remove();
    g.URL.revokeObjectURL(url);
    return true;
  }
  const r = await Share.share({ title: name, message: text });
  return r.action !== Share.dismissedAction;
}
