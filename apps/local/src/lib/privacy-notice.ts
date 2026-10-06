// The first-run privacy notice is shown once. Whether it has been dismissed is remembered in localStorage, under the
// app's `korra.` prefix so "Delete all local data" starts a fresh first run. Storage can be blocked or missing
// (private windows, blocked site data): then the notice simply shows on every page load until it is dismissed.
import { KEY_PREFIX } from "./data-safety";

export const PRIVACY_NOTICE_KEY = `${KEY_PREFIX}privacyNoticeDismissed`;

type Store = Pick<Storage, "getItem" | "setItem">;
const defaultStore = (): Store | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export function isPrivacyNoticeDismissed(store: Store | null = defaultStore()): boolean {
  try {
    return store?.getItem(PRIVACY_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPrivacyNotice(store: Store | null = defaultStore()): void {
  try {
    store?.setItem(PRIVACY_NOTICE_KEY, "1");
  } catch {
    // Nothing to remember it with: the notice stays hidden for this page load only.
  }
}
