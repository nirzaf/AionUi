/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from "../common";
import { logger } from "@office-ai/platform";
import { app, dialog, shell } from "electron";
import { generateHashWithFullName, readDirectoryRecursive } from "./utils";
import { createGeminiAgent } from "./initAgent";
import WorkerManage from "./WorkerManage";
import { ProcessChat } from "./initStorage";
import { GeminiAgentTask } from "./task/GeminiAgentTask";
import path from "path";
import fs from "fs/promises";
import { clearCachedCredentialFile } from "@google/gemini-cli-core";
logger.config({ print: true });

ipcBridge.openFileDialog.provider((options) => {
  return dialog
    .showOpenDialog({
      defaultPath: options?.defaultPath,
      properties: options?.properties,
    })
    .then((res) => {
      return res.filePaths;
    });
});

ipcBridge.openFile.provider(async (path) => {
  shell.openPath(path);
});

ipcBridge.showItemInFolder.provider(async (path) => {
  shell.showItemInFolder(path);
});
ipcBridge.openExternal.provider(async (url) => {
  return shell.openExternal(url);
});

ipcBridge.getFilesByDir.provider(async ({ dir }) => {
  const tree = await readDirectoryRecursive(dir);
  return tree ? [tree] : [];
});

ipcBridge.createConversation.provider(async ({ type, extra, name }) => {
  try {
    if (type === "gemini") {
      const conversation = await createGeminiAgent(
        extra.workspace,
        extra.defaultFiles
      );
      if (name) {
        conversation.name = name;
      }
      WorkerManage.buildConversation(conversation);
      await ProcessChat.get("chat.history").then((history) => {
        if (!history) {
          ProcessChat.set("chat.history", [conversation]);
        } else {
          if (history.some((h) => h.id === conversation.id)) return;
          ProcessChat.set("chat.history", [...history, conversation]);
        }
      });
      return conversation;
    }
    throw new Error("Unsupported conversation type");
  } catch (e) {
    console.error("-----createConversation error-----", e);
    return null;
  }
});

ipcBridge.removeConversation.provider(async ({ id }) => {
  return ProcessChat.get("chat.history").then((history) => {
    try {
      WorkerManage.kill(id);
      if (!history) return;
      ProcessChat.set(
        "chat.history",
        history.filter((item) => item.id !== id)
      );
      return true;
    } catch (e) {
      return false;
    }
  });
});

ipcBridge.resetConversation.provider(async ({ id, gemini }) => {
  if (gemini?.clearCachedCredentialFile) {
    await clearCachedCredentialFile();
  }
  if (id) {
    WorkerManage.kill(id);
  } else WorkerManage.clear();
});

ipcBridge.getConversation.provider(async ({ id }) => {
  return ProcessChat.get("chat.history")
    .then((history) => {
      return history.find((item) => item.id === id);
    })
    .then((conversation) => {
      if (conversation) {
        const task = WorkerManage.getTaskById(id);
        conversation.status = task.status;
      }
      return conversation;
    });
});

ipcBridge.restartApp.provider(async () => {
  app.relaunch();
  app.exit(0);
});
ipcBridge.geminiConversation.sendMessage.provider(
  async ({ conversation_id, files, ...other }) => {
    const task = WorkerManage.getTaskById(conversation_id) as GeminiAgentTask;
    if (!task) return { success: false, msg: "conversation not found" };
    if (files) {
      for (const file of files) {
        const fileName = path.basename(file);
        const destPath = path.join(task.workspace, fileName);
        await fs.copyFile(file, destPath);
      }
    }
    return task
      .sendMessage(other)
      .then(() => ({ success: true }))
      .catch((err) => {
        return { success: false, msg: err };
      });
  }
);
ipcBridge.geminiConversation.confirmMessage.provider(
  async ({ confirmKey, msg_id, conversation_id, callId }) => {
    const task: GeminiAgentTask = WorkerManage.getTaskById(
      conversation_id
    ) as any;
    if (!task) return { success: false, msg: "conversation not found" };
    if (task.type !== "gemini") return { success: false, msg: "not support" };
    return task
      .confirmMessage({ confirmKey, msg_id, callId })
      .then(() => ({ success: true }))
      .catch((err) => {
        return { success: false, msg: err };
      });
  }
);

ipcBridge.stopStream.provider(async ({ conversation_id }) => {
  const task = WorkerManage.getTaskById(conversation_id);
  if (!task) return { success: true, msg: "conversation not found" };
  if (task.type !== "gemini") return { success: true, msg: "not support" };
  return task.stop().then(() => ({ success: true }));
});

ipcBridge.geminiConversation.getWorkspace.provider(async ({ workspace }) => {
  const task = WorkerManage.getTaskById(generateHashWithFullName(workspace));
  if (!task || task.type !== "gemini") return [];
  return task
    .postMessagePromise("gemini.get.workspace", {})
    .then((res: any) => {
      return res;
    });
});

import { keyManager } from "@/agent/gemini/keyManager";

ipcBridge.geminiApis.getKeyStatuses.provider(async () => {
  return keyManager.getAllKeys();
});
