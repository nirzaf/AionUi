/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from "@office-ai/platform";
import { TChatConversation } from "./storage";
import { OpenDialogOptions } from "electron";

// 发送消息
const sendMessage = bridge.buildProvider<
  {
    success: boolean;
    msg?: string;
  },
  {
    input: string;
    msg_id: string;
    conversation_id: string;
    files?: string[];
  }
>("chat.send.message");

//接受消息
const responseStream = bridge.buildEmitter<IResponseMessage>(
  "chat.response.stream"
);
// 停止会话
export const stopStream = bridge.buildProvider<
  { success: boolean; msg?: string },
  { conversation_id: string }
>("chat.stop.stream");

// 打开文件/文件夹选择窗口
export const openFileDialog = bridge.buildProvider<
  string[] | undefined,
  | { defaultPath?: string; properties?: OpenDialogOptions["properties"] }
  | undefined
>("open-dialog");

// 使用系统默认程序打开文件
export const openFile = bridge.buildProvider<void, string>("open-file");

// 显示文件夹
export const showItemInFolder = bridge.buildProvider<void, string>(
  "show-item-in-folder"
);

// 使用系统默认程序打开外部链接
export const openExternal = bridge.buildProvider<void, string>("open-external");

// 获取文件夹或文件列表
export interface IDirOrFile {
  name: string;
  path: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}
// 获取指定文件夹下所有文件夹和文件列表
export const getFilesByDir = bridge.buildProvider<
  Array<IDirOrFile>,
  { dir: string }
>("get-file-by-dir");

// 获取系统信息
export const systemInfo = bridge.buildProvider<
  {
    tempDir: string;
  },
  void
>("system.info");

// 创建对话
export const createConversation = bridge.buildProvider<
  TChatConversation,
  {
    type: "gemini";
    name?: string;
    extra: { workspace?: string; defaultFiles?: string[] };
  }
>("create-conversation");

// 获取对话信息
export const getConversation = bridge.buildProvider<
  TChatConversation,
  { id: string }
>("get-conversation");

// 删除对话
export const removeConversation = bridge.buildProvider<boolean, { id: string }>(
  "remove-conversation"
);

// gemini对话相关接口
export const geminiConversation = {
  sendMessage: sendMessage,
  confirmMessage: bridge.buildProvider<
    {
      success: boolean;
      mgs?: string;
    },
    {
      confirmKey: string;
      msg_id: string;
      conversation_id: string;
      callId: string;
    }
  >("input.confirm.message"),
  responseStream: responseStream,
  getWorkspace: bridge.buildProvider<IDirOrFile[], { workspace: string }>(
    "gemini.get-workspace"
  ),
};

export const geminiApis = {
  getKeyStatuses: bridge.buildProvider<IApiKeyStatus[], void>(
    "gemini.get-key-statuses"
  ),
};

// 重置对话
export const resetConversation = bridge.buildProvider<
  void,
  {
    id?: string;
    gemini?: {
      clearCachedCredentialFile?: boolean;
    };
  }
>("reset-conversation");

// 重启应用
export const restartApp = bridge.buildProvider<void, void>("restart-app");

// 打开开发者工具
export const openDevTools = bridge.buildProvider<void, void>("open-dev-tools");

export interface IResponseMessage {
  type: string;
  data: any;
  msg_id: string;
  conversation_id: string;
}

export interface IApiKeyStatus {
  key: string;
  status: "valid" | "rate-limited" | "invalid";
  resetTime?: number;
}
