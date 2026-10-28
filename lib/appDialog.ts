/**
 * Cross-platform, non-blocking replacements for routine React Native alerts.
 * Displays confirmations inside the branded VolunServe UI, never with OS/browser popups.
 * Button callbacks intentionally execute ONLY when the user chooses that button.
 */
export type AppDialogButton = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
  isPreferred?: boolean;
};
export type AppDialogOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};
export type AppDialogRequest = {
  id: number;
  title: string;
  message: string;
  buttons: AppDialogButton[];
  options?: AppDialogOptions;
};
type Subscriber = (request: AppDialogRequest | null) => void;
let nextId = 1;
let active: AppDialogRequest | null = null;
const queue: AppDialogRequest[] = [];
const subscribers = new Set<Subscriber>();

function publish() {
  subscribers.forEach(listener => listener(active));
}

function promote() {
  active = queue.shift() || null;
  publish();
}

export function subscribeAppDialog(listener: Subscriber): () => void {
  subscribers.add(listener);
  listener(active);
  return () => { subscribers.delete(listener); };
}

export function closeAppDialog(id: number, button?: AppDialogButton) {
  if (!active || active.id !== id) return;
  const current = active;
  promote(); // Remove the active dialog before any callback can show another.
  if (button) {
    try { button.onPress?.(); } catch (error) {
      console.error("Dialog action failed:", error);
      AppAlert.alert("Action failed", "Please try that action again.");
    }
  } else {
    current.options?.onDismiss?.();
  }
}

export function dismissAppDialog(id: number) {
  if (!active || active.id !== id) return;
  if (active.options?.cancelable === false) return;
  const cancel = active.buttons.find(button => button.style === "cancel");
  if (cancel) closeAppDialog(id, cancel);
  else closeAppDialog(id);
}

export const AppAlert = {
  alert(
    title?: string,
    message?: string,
    buttons?: AppDialogButton[],
    options?: AppDialogOptions
  ): void {
    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    const safeButtons = Array.isArray(buttons) && buttons.length
      ? buttons.filter(button => !!button && typeof button === "object")
      : [{ text: "OK" }];
    queue.push({
      id: nextId++,
      title: trimmedTitle || "VolunServe",
      message: trimmedMessage,
      buttons: safeButtons.length ? safeButtons : [{ text: "OK" }],
      options,
    });
    if (!active) promote();
  },
  /** Promise-based confirmation for former window.confirm() calls. */
  confirm(title: string, message: string, confirmLabel = "Confirm"): Promise<boolean> {
    return new Promise(resolve => {
      AppAlert.alert(title, message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ], { cancelable: false });
    });
  },
};
