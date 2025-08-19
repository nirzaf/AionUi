// src/agent/gemini/keyManager.ts

import { ConfigStorage } from "@/common/storage";

export interface IApiKey {
  key: string;
  status: "valid" | "rate-limited" | "invalid";
  resetTime?: number;
}

class KeyManager {
  private keys: IApiKey[] = [];
  private activeKeyIndex = 0;
  private initialized = false;

  constructor() {}

  async init() {
    if (this.initialized) {
      return;
    }
    const config = await ConfigStorage.get("gemini.config");
    let apiKeys: string[] = [];
    let activeIndex = 0;
    if (config) {
      if (
        config.GEMINI_API_KEY &&
        (!config.GEMINI_API_KEYS || config.GEMINI_API_KEYS.length === 0)
      ) {
        apiKeys = [config.GEMINI_API_KEY];
        activeIndex = 0;
      } else {
        apiKeys = config.GEMINI_API_KEYS || [];
        activeIndex = config.activeKeyIndex || 0;
      }
    }

    this.keys = apiKeys.map((key) => ({
      key,
      status: "valid",
    }));

    if (activeIndex && activeIndex < this.keys.length) {
      this.activeKeyIndex = activeIndex;
    }
    this.initialized = true;
  }

  getActiveKey(): IApiKey | null {
    if (this.keys.length === 0) {
      return null;
    }
    const activeKey = this.keys[this.activeKeyIndex];
    if (activeKey.status === "valid") {
      return activeKey;
    }
    // if the active key is not valid, try to find another one
    return this.switchToNextAvailableKey();
  }

  switchToNextAvailableKey(): IApiKey | null {
    for (let i = 0; i < this.keys.length; i++) {
      const nextIndex = (this.activeKeyIndex + 1 + i) % this.keys.length;
      const nextKey = this.keys[nextIndex];
      if (
        nextKey.status === "valid" ||
        (nextKey.status === "rate-limited" &&
          Date.now() > (nextKey.resetTime || 0))
      ) {
        if (nextKey.status === "rate-limited") {
          nextKey.status = "valid";
          nextKey.resetTime = undefined;
        }
        this.activeKeyIndex = nextIndex;
        return nextKey;
      }
    }
    return null; // No available keys
  }

  getActiveIndex(): number {
    return this.activeKeyIndex;
  }

  markCurrentAsRateLimited(resetTime?: number) {
    if (this.keys[this.activeKeyIndex]) {
      this.keys[this.activeKeyIndex].status = "rate-limited";
      // Default reset time is 1 minute from now
      this.keys[this.activeKeyIndex].resetTime =
        resetTime || Date.now() + 60 * 1000;
    }
  }

  markCurrentAsInvalid() {
    if (this.keys[this.activeKeyIndex]) {
      this.keys[this.activeKeyIndex].status = "invalid";
    }
  }

  getAllKeys() {
    return this.keys;
  }
}

export const keyManager = new KeyManager();
