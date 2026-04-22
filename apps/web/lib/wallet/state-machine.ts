export type WalletLifecycleState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "SWITCHING_CHAIN"
  | "RECONNECTING"
  | "ERROR";

export type WalletErrorCode =
  | "USER_REJECTED_CONNECTION"
  | "USER_REJECTED_CHAIN_SWITCH"
  | "WALLET_LOCKED"
  | "SESSION_EXPIRED"
  | "RPC_TIMEOUT"
  | "INSUFFICIENT_FUNDS"
  | "CHAIN_SWITCH_FAILED"
  | "MOBILE_DEEP_LINK_FAILED"
  | "SAME_DEVICE_QR_SCAN"
  | "UNKNOWN";

export type WalletError = {
  code: WalletErrorCode;
  message: string;
  dismissible?: boolean;
};

export type WalletMachineState = {
  lifecycle: WalletLifecycleState;
  error: WalletError | null;
};

export type WalletMachineEvent =
  | { type: "CONNECT_REQUEST" }
  | { type: "CONNECT_SUCCESS" }
  | { type: "RECONNECT_REQUEST" }
  | { type: "RECONNECT_SUCCESS" }
  | { type: "CHAIN_SWITCH_REQUEST" }
  | { type: "CHAIN_SWITCH_SUCCESS" }
  | { type: "DISCONNECT" }
  | { type: "ERROR"; error: WalletError }
  | { type: "CLEAR_ERROR" };

export const initialWalletMachineState: WalletMachineState = {
  lifecycle: "DISCONNECTED",
  error: null
};

export function walletMachineReducer(
  state: WalletMachineState,
  event: WalletMachineEvent
): WalletMachineState {
  switch (event.type) {
    case "CONNECT_REQUEST":
      return { lifecycle: "CONNECTING", error: null };
    case "CONNECT_SUCCESS":
      return { lifecycle: "CONNECTED", error: null };
    case "RECONNECT_REQUEST":
      return { lifecycle: "RECONNECTING", error: null };
    case "RECONNECT_SUCCESS":
      return { lifecycle: "CONNECTED", error: null };
    case "CHAIN_SWITCH_REQUEST":
      return { lifecycle: "SWITCHING_CHAIN", error: null };
    case "CHAIN_SWITCH_SUCCESS":
      return { lifecycle: "CONNECTED", error: null };
    case "DISCONNECT":
      return { lifecycle: "DISCONNECTED", error: null };
    case "ERROR":
      return { lifecycle: "ERROR", error: event.error };
    case "CLEAR_ERROR":
      return {
        lifecycle: state.lifecycle === "ERROR" ? "DISCONNECTED" : state.lifecycle,
        error: null
      };
    default:
      return state;
  }
}
