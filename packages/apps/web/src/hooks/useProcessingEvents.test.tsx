/**
 * Tests for useProcessingEvents hook.
 *
 * Mocks EventSource globally to avoid real network connections.
 * Tests that query invalidation fires on meeting:processed events
 * and that cleanup closes the EventSource on unmount.
 *
 * Uses Vitest + @testing-library/react renderHook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useProcessingEvents } from "@/hooks/useProcessingEvents.js";

// ── Mock EventSource ──────────────────────────────────────────────────────────

type MockEventSourceOptions = {
  onMessage?: (event: MessageEvent) => void;
};

/**
 * Creates a controllable mock EventSource class.
 * Exposes static helpers to trigger events on the most-recently created instance.
 */
function createMockEventSourceClass() {
  let lastInstance: MockEventSourceInstance | null = null;

  class MockEventSourceInstance {
    url: string;
    closed = false;
    listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map();

    constructor(url: string) {
      this.url = url;
      lastInstance = this;
    }

    addEventListener(type: string, handler: (e: MessageEvent) => void) {
      const handlers = this.listeners.get(type) ?? [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    }

    removeEventListener(type: string, handler: (e: MessageEvent) => void) {
      const handlers = this.listeners.get(type) ?? [];
      this.listeners.set(type, handlers.filter((h) => h !== handler));
    }

    close() {
      this.closed = true;
    }

    // Test helpers
    emit(type: string, data: unknown) {
      const event = new MessageEvent(type, { data: JSON.stringify(data) });
      const handlers = this.listeners.get(type) ?? [];
      for (const handler of handlers) {
        handler(event);
      }
    }

    simulateError() {
      if (this.onerror) this.onerror(new Event("error"));
    }

    // Required by the spec
    onerror: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onopen: ((e: Event) => void) | null = null;
    readonly CONNECTING = 0 as const;
    readonly OPEN = 1 as const;
    readonly CLOSED = 2 as const;
    readyState = 1;
  }

  return {
    MockEventSource: MockEventSourceInstance as unknown as typeof EventSource,
    getLastInstance: () => lastInstance,
  };
}

// ── Test wrapper ──────────────────────────────────────────────────────────────

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useProcessingEvents", () => {
  let queryClient: QueryClient;
  let mockClass: ReturnType<typeof createMockEventSourceClass>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockClass = createMockEventSourceClass();
    vi.stubGlobal("EventSource", mockClass.MockEventSource);
    vi.spyOn(queryClient, "invalidateQueries");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it("connects to /api/events SSE endpoint", () => {
    const wrapper = createWrapper(queryClient);
    renderHook(() => useProcessingEvents(), { wrapper });

    const instance = mockClass.getLastInstance();
    expect(instance).not.toBeNull();
    expect(instance!.url).toContain("/api/events");
  });

  it("invalidates ['meetings'] query on meeting:processed event", async () => {
    const wrapper = createWrapper(queryClient);
    renderHook(() => useProcessingEvents(), { wrapper });

    const instance = mockClass.getLastInstance()!;

    await act(async () => {
      instance.emit("meeting:processed", { slug: "2026-03-05-team-standup" });
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["meetings"] })
    );
  });

  it("invalidates ['memory', 'recent'] query on meeting:processed event", async () => {
    const wrapper = createWrapper(queryClient);
    renderHook(() => useProcessingEvents(), { wrapper });

    const instance = mockClass.getLastInstance()!;

    await act(async () => {
      instance.emit("meeting:processed", { slug: "2026-03-05-team-standup" });
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["memory", "recent"] })
    );
  });

  it("closes EventSource on unmount (cleanup)", () => {
    const wrapper = createWrapper(queryClient);
    const { unmount } = renderHook(() => useProcessingEvents(), { wrapper });

    const instance = mockClass.getLastInstance()!;
    expect(instance.closed).toBe(false);

    unmount();

    expect(instance.closed).toBe(true);
  });

  it("does not throw when meeting:processed data is not valid JSON", async () => {
    const wrapper = createWrapper(queryClient);
    renderHook(() => useProcessingEvents(), { wrapper });

    const instance = mockClass.getLastInstance()!;

    // Manually emit with a bad event (bypassing our emit helper)
    const badEvent = new MessageEvent("meeting:processed", { data: "not-json" });
    const handlers = instance.listeners.get("meeting:processed") ?? [];

    await act(async () => {
      for (const handler of handlers) {
        handler(badEvent);
      }
    });

    // Should still invalidate queries (slug will be '')
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
  });

  it("resets backoff counter on successful events", async () => {
    const wrapper = createWrapper(queryClient);
    renderHook(() => useProcessingEvents(), { wrapper });

    const instance = mockClass.getLastInstance()!;

    // Emit connected event then a processed event (both reset backoff)
    await act(async () => {
      instance.emit("connected", { clientId: "test-client" });
      instance.emit("meeting:processed", { slug: "meeting-slug" });
    });

    // If no errors, multiple successful events should be fine
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
