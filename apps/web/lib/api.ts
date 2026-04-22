import type { BotSettings, ControlResponse, DashboardOverview, Opportunity, TradeRecord, WalletSnapshot } from "@/types/domain";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

export const api = {
  getOverview(address?: string) {
    const query = address ? `?address=${address}` : "";
    return request<DashboardOverview>(`/api/overview${query}`);
  },
  getPortfolio(address?: string) {
    const query = address ? `?address=${address}` : "";
    return request<WalletSnapshot>(`/api/portfolio${query}`);
  },
  getSettings() {
    return request<BotSettings>("/api/settings");
  },
  updateSettings(payload: BotSettings) {
    return request<BotSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  getOpportunities() {
    return request<Opportunity[]>("/api/opportunities");
  },
  getTrades() {
    return request<TradeRecord[]>("/api/trades");
  },
  startBot() {
    return request<ControlResponse>("/api/bot/start", { method: "POST" });
  },
  pauseBot() {
    return request<ControlResponse>("/api/bot/pause", { method: "POST" });
  },
  stopBot() {
    return request<ControlResponse>("/api/bot/stop", { method: "POST" });
  },
  emergencyStop() {
    return request<ControlResponse>("/api/bot/emergency-stop", { method: "POST" });
  }
};
