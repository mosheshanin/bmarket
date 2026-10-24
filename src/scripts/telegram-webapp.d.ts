/** Минимальные типы telegram-web-app.js, которые использует проект. */
interface TgBottomButton {
  text: string;
  isVisible: boolean;
  setText(text: string): TgBottomButton;
  show(): TgBottomButton;
  hide(): TgBottomButton;
  enable(): TgBottomButton;
  disable(): TgBottomButton;
  showProgress(leaveActive?: boolean): TgBottomButton;
  hideProgress(): TgBottomButton;
  onClick(cb: () => void): TgBottomButton;
  offClick(cb: () => void): TgBottomButton;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name?: string; last_name?: string; username?: string };
    start_param?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  BackButton: { isVisible: boolean; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: TgBottomButton;
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(t: 'error' | 'success' | 'warning'): void;
  };
  requestWriteAccess(cb?: (allowed: boolean) => void): void;
  requestContact(cb?: (shared: boolean, res?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void): void;
  openTelegramLink(url: string): void;
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  showAlert(msg: string, cb?: () => void): void;
  showConfirm(msg: string, cb?: (ok: boolean) => void): void;
  downloadFile?(params: { url: string; file_name: string }, cb?: (accepted: boolean) => void): void;
  onEvent(e: string, cb: () => void): void;
}

interface Window {
  Telegram?: { WebApp: TgWebApp };
  turnstile?: {
    render(el: HTMLElement | string, opts: Record<string, unknown>): string;
    reset(id?: string): void;
  };
}
