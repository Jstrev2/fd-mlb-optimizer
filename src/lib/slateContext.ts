/**
 * Shared slate selection — persisted to localStorage so Players and Optimize pages stay in sync.
 */

const KEY = "fd_selected_slate";

export function getSelectedSlate(): string {
  if (typeof window === "undefined") return "all";
  return localStorage.getItem(KEY) || "all";
}

export function setSelectedSlate(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, id);
  // Fire a custom event so other tabs/pages can react if needed
  window.dispatchEvent(new CustomEvent("slateChanged", { detail: id }));
}

export function subscribeSlate(cb: (id: string) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<string>).detail);
  window.addEventListener("slateChanged", handler);
  return () => window.removeEventListener("slateChanged", handler);
}
