import { describe, expect, it } from "vitest";

import { initialWalletMachineState, walletMachineReducer } from "@/lib/wallet/state-machine";

describe("walletMachineReducer", () => {
  it("handles disconnected -> connecting -> connected", () => {
    const connecting = walletMachineReducer(initialWalletMachineState, { type: "CONNECT_REQUEST" });
    expect(connecting.lifecycle).toBe("CONNECTING");

    const connected = walletMachineReducer(connecting, { type: "CONNECT_SUCCESS" });
    expect(connected.lifecycle).toBe("CONNECTED");
    expect(connected.error).toBeNull();
  });

  it("handles reconnect lifecycle", () => {
    const reconnecting = walletMachineReducer(initialWalletMachineState, { type: "RECONNECT_REQUEST" });
    expect(reconnecting.lifecycle).toBe("RECONNECTING");

    const reconnected = walletMachineReducer(reconnecting, { type: "RECONNECT_SUCCESS" });
    expect(reconnected.lifecycle).toBe("CONNECTED");
  });

  it("handles switching chain lifecycle", () => {
    const switching = walletMachineReducer(initialWalletMachineState, { type: "CHAIN_SWITCH_REQUEST" });
    expect(switching.lifecycle).toBe("SWITCHING_CHAIN");

    const switched = walletMachineReducer(switching, { type: "CHAIN_SWITCH_SUCCESS" });
    expect(switched.lifecycle).toBe("CONNECTED");
  });

  it("surfaces and clears errors", () => {
    const errored = walletMachineReducer(initialWalletMachineState, {
      type: "ERROR",
      error: {
        code: "USER_REJECTED_CONNECTION",
        message: "User rejected",
        dismissible: true
      }
    });
    expect(errored.lifecycle).toBe("ERROR");
    expect(errored.error?.code).toBe("USER_REJECTED_CONNECTION");

    const cleared = walletMachineReducer(errored, { type: "CLEAR_ERROR" });
    expect(cleared.lifecycle).toBe("DISCONNECTED");
    expect(cleared.error).toBeNull();
  });

  it("handles hard disconnect from any state", () => {
    const disconnected = walletMachineReducer(
      {
        lifecycle: "CONNECTED",
        error: null
      },
      { type: "DISCONNECT" }
    );
    expect(disconnected.lifecycle).toBe("DISCONNECTED");
    expect(disconnected.error).toBeNull();
  });
});
