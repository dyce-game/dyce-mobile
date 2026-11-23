import { Platform, Share } from 'react-native';

/** What the "copy" menu item is called here (see `copyText`). */
export const COPY_LABEL = Platform.OS === 'web' ? 'Copy' : 'Share text';

/**
 * Copies text on web. There is no clipboard module in the app yet (expo-clipboard is in the BACKLOG), so on
 * a phone this opens the share sheet, which has Copy in it. Resolves to true if something happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const nav = (
        globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }
      ).navigator;
      if (!nav?.clipboard) return false;
      await nav.clipboard.writeText(text);
      return true;
    }
    await Share.share({ message: text });
    return true;
  } catch {
    return false; // closed the share sheet, or the browser refused
  }
}
