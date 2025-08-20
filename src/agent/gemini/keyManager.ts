// src/agent/gemini/keyManager.ts

import { ConfigStorage } from "@/common/storage";
import { IApiKey, IKeyManagerState, IGeminiConfig } from "./types";

class KeyManager {
  private keys: IApiKey[] = [];
  private activeKeyIndex = 0;
  private initialized = false;
  private onStatusChangeCallback?: (
    keys: IApiKey[],
    activeIndex: number
  ) => void;

  constructor() {}

  async init() {
    if (this.initialized) {
      return;
    }
    const config = await ConfigStorage.get("gemini.config");
    let apiKeys: string[] = [];
    let activeIndex = 0;
    let savedState: IKeyManagerState | null = null;

    if (config) {
      // Load saved key manager state if available
      savedState = config.keyManagerState;

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

    // Initialize keys with saved state or default values
    this.keys = apiKeys.map(key => {
      const savedKey = savedState?.keys?.find(k => k.key === key);
      return {
        key,
        status: savedKey?.status || "valid",
        resetTime: savedKey?.resetTime,
        lastUsed: savedKey?.lastUsed,
        errorCount: savedKey?.errorCount || 0,
      };
    });

    // Restore active key index from saved state
    if (
      savedState?.activeKeyIndex !== undefined &&
      savedState.activeKeyIndex < this.keys.length
    ) {
      this.activeKeyIndex = savedState.activeKeyIndex;
    } else if (activeIndex && activeIndex < this.keys.length) {
      this.activeKeyIndex = activeIndex;
    }

    this.cleanupExpiredRateLimits();

    this.initialized = true;
    await this.persistState();
  }

  getActiveKey(): IApiKey | null {
    if (this.keys.length === 0) {
      return null;
    }
    const activeKey = this.keys[this.activeKeyIndex];
    if (activeKey.status === "valid") {
      activeKey.lastUsed = Date.now();
      return activeKey;
    }
    // if the active key is not valid, try to find another one
    return this.switchToNextAvailableKey();
  }

  switchToNextAvailableKey(): IApiKey | null {
    for (let i = 0; i < this.keys.length; i++) {
      const nextIndex = (this.activeKeyIndex + 1 + i) % this.keys.length;
      const nextKey = this.keys[nextIndex];

      if (nextKey.status === "valid") {
        this.activeKeyIndex = nextIndex;
        nextKey.lastUsed = Date.now();
        this.notifyStatusChange();
        this.persistState();
        return nextKey;
      }

      if (
        nextKey.status === "rate-limited" &&
        Date.now() > (nextKey.resetTime || 0)
      ) {
        nextKey.status = "valid";
        nextKey.resetTime = undefined;
        nextKey.errorCount = 0;
        this.activeKeyIndex = nextIndex;
        nextKey.lastUsed = Date.now();
        this.notifyStatusChange();
        this.persistState();
        return nextKey;
      }
    }

    return null; // No available keys
  }

  async switchToKey(keyIndex: number): Promise<boolean> {
    if (keyIndex < 0 || keyIndex >= this.keys.length) {
      return false;
    }

    const targetKey = this.keys[keyIndex];
    if (targetKey.status === "invalid") {
      return false;
    }

    // Allow switching to rate-limited keys if their cooldown has expired
    if (
      targetKey.status === "rate-limited" &&
      Date.now() > (targetKey.resetTime || 0)
    ) {
      targetKey.status = "valid";
      targetKey.resetTime = undefined;
      targetKey.errorCount = 0;
    }

    if (targetKey.status === "valid") {
      this.activeKeyIndex = keyIndex;
      targetKey.lastUsed = Date.now();
      this.notifyStatusChange();
      await this.persistState();
      return true;
    }

    return false;
  }

  getActiveIndex(): number {
    return this.activeKeyIndex;
  }

  async markCurrentAsRateLimited(resetTime?: number) {
    if (this.keys[this.activeKeyIndex]) {
      const key = this.keys[this.activeKeyIndex];
      key.status = "rate-limited";
      key.errorCount = (key.errorCount || 0) + 1;
      // Default reset time is 1 minute from now, but can be longer based on error count
      const baseResetTime = 60 * 1000; // 1 minute
      const backoffMultiplier = Math.min(key.errorCount, 5); // Max 5x backoff
      key.resetTime =
        resetTime || Date.now() + baseResetTime * backoffMultiplier;

      this.notifyStatusChange();
      await this.persistState();
    }
  }

  async markCurrentAsInvalid() {
    if (this.keys[this.activeKeyIndex]) {
      this.keys[this.activeKeyIndex].status = "invalid";
      this.keys[this.activeKeyIndex].errorCount =
        (this.keys[this.activeKeyIndex].errorCount || 0) + 1;
      this.notifyStatusChange();
      await this.persistState();
    }
  }

  getAllKeys(): IApiKey[] {
    return [...this.keys]; // Return a copy to prevent external modification
  }

  getKeyStatuses(): Array<{
    key: string;
    status: string;
    resetTime?: number;
    timeUntilReset?: number;
    isActive: boolean;
  }> {
    return this.keys.map((key, index) => ({
      key:
        key.key.substring(0, 8) + "..." + key.key.substring(key.key.length - 4), // Mask the key for security
      status: key.status,
      resetTime: key.resetTime,
      timeUntilReset: key.resetTime
        ? Math.max(0, key.resetTime - Date.now())
        : undefined,
      isActive: index === this.activeKeyIndex,
    }));
  }
  async addKey(newKey: string): Promise<boolean> {
    if (this.keys.length >= 5) {
      return false; // Maximum 5 keys allowed
    }

    // Check if key already exists
    if (this.keys.some(k => k.key === newKey)) {
      return false;
    }

    this.keys.push({
      key: newKey,
      status: "valid",
      errorCount: 0,
    });

    this.notifyStatusChange();
    await this.persistState();
    return true;
  }

  async removeKey(keyIndex: number): Promise<boolean> {
    if (
      keyIndex < 0 ||
      keyIndex >= this.keys.length ||
      this.keys.length <= 1
    ) {
      return false; // Can't remove if it's the only key or invalid index
    }

    this.keys.splice(keyIndex, 1);

    // Adjust active key index if necessary
    if (this.activeKeyIndex >= keyIndex) {
      this.activeKeyIndex = Math.max(0, this.activeKeyIndex - 1);
    }

    this.notifyStatusChange();
    await this.persistState();
    return true;
  }

  async updateKeys(newKeys: string[]): Promise<void> {
    if (newKeys.length === 0 || newKeys.length > 5) {
      throw new Error("Must have between 1 and 5 API keys");
    }

    // Preserve status for existing keys
    const updatedKeys: IApiKey[] = newKeys.map(key => {
      const existingKey = this.keys.find(k => k.key === key);
      return (
        existingKey || {
          key,
          status: "valid",
          errorCount: 0,
        }
      );
    });

    this.keys = updatedKeys;

    // Ensure active key index is valid
    if (this.activeKeyIndex >= this.keys.length) {
      this.activeKeyIndex = 0;
    }

    this.cleanupExpiredRateLimits();
    this.notifyStatusChange();
    await this.persistState();
  }

  private cleanupExpiredRateLimits(): void {
    const now = Date.now();
    this.keys.forEach(key => {
      if (
        key.status === "rate-limited" &&
        key.resetTime &&
        now > key.resetTime
      ) {
        key.status = "valid";
        key.resetTime = undefined;
        key.errorCount = 0;
      }
    });
  }

  private async persistState(): Promise<void> {
    try {
      const config: Partial<IGeminiConfig> =
        (await ConfigStorage.get("gemini.config")) || {};
      const state: IKeyManagerState = {
        keys: this.keys,
        activeKeyIndex: this.activeKeyIndex,
        lastRotationTime: Date.now(),
      };

      config.keyManagerState = state;
      config.GEMINI_API_KEYS = this.keys.map(k => k.key);
      config.activeKeyIndex = this.activeKeyIndex;

      await ConfigStorage.set("gemini.config", config as IGeminiConfig);
    } catch (error) {
      console.error("Failed to persist key manager state:", error);
    }
  }

  onStatusChange(
    callback: (keys: IApiKey[], activeIndex: number) => void
  ): void {
    this.onStatusChangeCallback = callback;
  }

  private notifyStatusChange(): void {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback([...this.keys], this.activeKeyIndex);
    }
  }

  hasAvailableKeys(): boolean {
    return this.keys.some(
      key =>
        key.status === "valid" ||
        (key.status === "rate-limited" && Date.now() > (key.resetTime || 0))
    );
  }

  getNextResetTime(): number | null {
    const rateLimitedKeys = this.keys.filter(
      key => key.status === "rate-limited" && key.resetTime
    );

    if (rateLimitedKeys.length === 0) {
      return null;
    }

    return Math.min(...rateLimitedKeys.map(key => key.resetTime!));
  }
}

export const keyManager = new KeyManager();
