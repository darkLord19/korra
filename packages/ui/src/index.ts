// @korra/ui: the shared screens. Isomorphic (browser and server); talks to the app only through `KorraApi` and `KorraNav`.

export type { KorraApi, KorraCapabilities, PackDownloads, UploadHint } from "./api";
export { KorraApiError, isKorraApiError, parseFieldErrors, errorMessage, toFormErrors, GENERIC_ERROR } from "./errors";
export type { KorraApiErrorInit, KorraApiErrorKind, FormErrors } from "./errors";
export { KorraProvider, NavProvider, useApi, useNav } from "./context";
export type { KorraNav, NavLinkProps } from "./context";

export { Alert, Badge, Button, buttonClass, Card, CardBody, CardHeader, cx, Field, Input, Select, Textarea, Table, Td, Th } from "./components";
export { Footer, DISCLAIMER } from "./components/Footer";
export { Markdown } from "./components/Markdown";

export { MonthScreen } from "./screens/MonthScreen";
export type { MonthData } from "./screens/MonthScreen";
export { TrackerScreen } from "./screens/TrackerScreen";
export { PackScreen } from "./screens/PackScreen";
export { OnboardingScreen } from "./screens/OnboardingScreen";
export { SettingsScreen } from "./screens/SettingsScreen";
export type { SettingsSlots } from "./screens/SettingsScreen";

// Presentational views, for read-only pages that already have their data (a CA's view).
export { MonthView } from "./month/MonthView";
export type { MonthViewProps } from "./month/MonthView";
export { TrackerView } from "./tracker/TrackerView";
export { PackView } from "./pack/PackView";
export type { PackViewProps } from "./pack/PackView";

export { ProfileForm } from "./forms/ProfileForm";
export type { InvoiceHandoff } from "./forms/ProfileForm";

export { mimeOf, UNSUPPORTED_FILE_MESSAGE } from "./lib/files";
export { currentMonthIST, dateLabel, daysBetween, monthLabel, money, shiftMonth, FIELD_LABELS } from "./lib/format";
export { majorToMinor, minorToMajor } from "./lib/money-input";
