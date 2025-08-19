/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import initStorage from "./initStorage";
import "./initBridge";
import { app } from "electron";
import { keyManager } from "@/agent/gemini/keyManager";

setTimeout(initStorage);

app.whenReady().then(() => {
  initStorage().then(() => {
    keyManager.init();
  });
});
