export type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

export type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo;
  provider: EIP1193Provider;
};

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
  }
}

export function discoverEip6963Providers(
  onDiscover: (provider: Eip6963ProviderDetail) => void
): () => void {
  const seen = new Set<string>();
  const listener = (event: WindowEventMap["eip6963:announceProvider"]) => {
    const announcedProvider = event.detail;
    const key = `${announcedProvider.info.uuid}:${announcedProvider.info.rdns}`;
    if (seen.has(key)) return;
    seen.add(key);
    onDiscover(announcedProvider);
  };

  window.addEventListener("eip6963:announceProvider", listener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  return () => {
    window.removeEventListener("eip6963:announceProvider", listener);
  };
}
