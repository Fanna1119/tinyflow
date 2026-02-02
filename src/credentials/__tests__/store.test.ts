/**
 * Credentials Store Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CredentialStore } from "../store";

describe("CredentialStore", () => {
  let store: CredentialStore;

  beforeEach(() => {
    store = new CredentialStore({
      encryptionKey: "test-key-for-unit-tests-32byte",
    });
  });

  it("should store and retrieve credentials", () => {
    const credential = {
      id: "test-cred-1",
      name: "Test API Key",
      type: "api-key",
      data: {
        apiKey: "secret-key-123",
        endpoint: "https://api.example.com",
      },
    };

    store.set(credential);

    const retrieved = store.get("test-cred-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Test API Key");
    expect(retrieved?.data.apiKey).toBe("secret-key-123");
  });

  it("should encrypt sensitive data", () => {
    const credential = {
      id: "test-cred-2",
      name: "OAuth Token",
      type: "oauth2",
      data: {
        accessToken: "very-secret-token",
        refreshToken: "refresh-secret",
      },
    };

    const stored = store.set(credential);

    // Stored data should be encrypted (starts with 'enc:')
    expect(typeof stored.data.accessToken).toBe("string");
    expect((stored.data.accessToken as string).startsWith("enc:")).toBe(true);

    // Retrieved data should be decrypted
    const retrieved = store.get("test-cred-2");
    expect(retrieved?.data.accessToken).toBe("very-secret-token");
  });

  it("should check if credential exists", () => {
    store.set({
      id: "exists",
      name: "Exists",
      type: "test",
      data: {},
    });

    expect(store.has("exists")).toBe(true);
    expect(store.has("not-exists")).toBe(false);
  });

  it("should delete credentials", () => {
    store.set({
      id: "to-delete",
      name: "Delete Me",
      type: "test",
      data: {},
    });

    expect(store.has("to-delete")).toBe(true);

    const deleted = store.delete("to-delete");
    expect(deleted).toBe(true);
    expect(store.has("to-delete")).toBe(false);
  });

  it("should list credentials without sensitive data", () => {
    store.set({
      id: "cred-1",
      name: "Credential 1",
      type: "api-key",
      data: { secret: "should-not-appear" },
    });

    store.set({
      id: "cred-2",
      name: "Credential 2",
      type: "oauth2",
      data: { token: "also-hidden" },
    });

    const list = store.list();

    expect(list).toHaveLength(2);
    expect(list[0]).toHaveProperty("id");
    expect(list[0]).toHaveProperty("name");
    expect(list[0]).toHaveProperty("type");
    expect(list[0]).not.toHaveProperty("data");
  });

  it("should get specific credential value", () => {
    store.set({
      id: "cred-value",
      name: "Test",
      type: "test",
      data: {
        apiKey: "key-123",
        endpoint: "https://api.test.com",
      },
    });

    const apiKey = store.getValue("cred-value", "apiKey");
    expect(apiKey).toBe("key-123");

    const endpoint = store.getValue("cred-value", "endpoint");
    expect(endpoint).toBe("https://api.test.com");
  });

  it("should clear all credentials", () => {
    store.set({ id: "1", name: "One", type: "test", data: {} });
    store.set({ id: "2", name: "Two", type: "test", data: {} });

    expect(store.list()).toHaveLength(2);

    store.clear();
    expect(store.list()).toHaveLength(0);
  });
});
