/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Alert,
  Button,
  Form,
  Input,
  Select,
  Space,
  Badge,
} from "@arco-design/web-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ipcBridge, geminiApis } from "../../common";
import { FolderOpen, Link } from "@icon-park/react";
import { systemInfo, IApiKeyStatus } from "../../common/ipcBridge";
import { ConfigStorage } from "@/common/storage";

const GeminiSettings: React.FC<{
  onBack: () => void;
}> = (props) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oldConfig, setOldConfig] = useState({ authType: "", proxy: "" });
  const [keyStatuses, setKeyStatuses] = useState<IApiKeyStatus[]>([]);

  const activeKeyIndex = Form.useWatch("activeKeyIndex", form);

  const fetchKeyStatuses = () => {
    geminiApis.getKeyStatuses.invoke().then(setKeyStatuses);
  };

  const onSubmit = (values: any) => {
    delete values.tempDir;
    // remove old key
    if (values.GEMINI_API_KEY) {
      delete values.GEMINI_API_KEY;
    }
    setLoading(true);
    setError(null);
    ConfigStorage.set("gemini.config", values)
      .then(() => {
        ipcBridge.resetConversation
          .invoke({
            gemini: {
              clearCachedCredentialFile: oldConfig.authType !== values.authType,
            },
          })
          .finally(() => {
            window.location.reload();
          });
      })
      .catch((e) => {
        setError(e.message || e);
      })
      .finally(() => {
        setLoading(false);
      });
  };
  useEffect(() => {
    fetchKeyStatuses();
    ConfigStorage.get("gemini.config").then((data) => {
      if (data) {
        if (
          data.GEMINI_API_KEY &&
          (!data.GEMINI_API_KEYS || data.GEMINI_API_KEYS.length === 0)
        ) {
          data.GEMINI_API_KEYS = [data.GEMINI_API_KEY];
          data.activeKeyIndex = 0;
        }
        form.setFieldsValue(data);
        setOldConfig(data);
      }
    });
    systemInfo.invoke().then((data) => {
      form.setFieldValue("tempDir", data.tempDir);
    });
  }, []);

  const authType = Form.useWatch("authType", form);

  return (
    <Form
      layout="horizontal"
      onSubmit={onSubmit}
      labelCol={{
        span: 5,
        flex: "200px",
      }}
      wrapperCol={{
        flex: "1",
      }}
      form={form}
      className={"[&_.arco-row]:flex-nowrap  max-w-800px"}
    >
      <Form.Item
        label={
          <span className="flex items-center justify-end">
            {t("settings.authMethod")}
            <Link
              size="14"
              onClick={() => {
                ipcBridge.openExternal.invoke(
                  "https://github.com/google-gemini/gemini-cli"
                );
              }}
            />
          </span>
        }
        field="authType"
      >
        <Select
          options={[
            {
              label: t("settings.geminiApiKey"),
              value: "gemini-api-key",
            },
            {
              label: t("settings.vertexApiKey"),
              value: "vertex-ai",
            },
            {
              label: t("settings.personalAuth"),
              value: "oauth-personal",
            },
          ]}
        ></Select>
      </Form.Item>
      {authType === "gemini-api-key" ? (
        <>
          <Form.List field="GEMINI_API_KEYS">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => {
                  const status = keyStatuses[index]?.status;
                  const resetTime = keyStatuses[index]?.resetTime;
                  let statusNode;
                  switch (status) {
                    case "rate-limited":
                      statusNode = (
                        <Badge
                          status="warning"
                          text={`${t(
                            "settings.rateLimited"
                          )} ${new Date(resetTime).toLocaleTimeString()}`}
                        />
                      );
                      break;
                    case "invalid":
                      statusNode = (
                        <Badge
                          status="error"
                          text={t("settings.invalid")}
                        />
                      );
                      break;
                    case "valid":
                      if (index === activeKeyIndex) {
                        statusNode = (
                          <Badge
                            status="success"
                            text={t("settings.active")}
                          />
                        );
                      }
                      break;
                  }

                  return (
                    <Form.Item
                      key={field.key}
                      label={
                        <Space>
                          <span>
                            {index === 0
                              ? t("settings.geminiApiKey")
                              : `${t("settings.geminiApiKey")} ${index + 1}`}
                          </span>
                        </Space>
                      }
                      field={field.name}
                    >
                      <div className="flex flex-col">
                        <Input
                          suffix={
                            <div className="flex gap-5px">
                              <Button
                                size="small"
                                onClick={() => {
                                  form.setFieldValue("activeKeyIndex", index);
                                }}
                                type={
                                  activeKeyIndex === index
                                    ? "primary"
                                    : "default"
                                }
                              >
                                {activeKeyIndex === index
                                  ? t("settings.active")
                                  : t("settings.setActive")}
                              </Button>
                              {fields.length > 1 && (
                                <Button
                                  size="small"
                                  type="dashed"
                                  onClick={() => remove(index)}
                                >
                                  {t("common.remove")}
                                </Button>
                              )}
                            </div>
                          }
                        />
                         <div className="text-right">{statusNode}</div>
                      </div>
                    </Form.Item>
                  );
                })}
                <Form.Item wrapperCol={{ offset: 5 }}>
                  <Button
                    onClick={() => add("")}
                    disabled={fields.length >= 5}
                  >
                    {t("settings.addApiKey")}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
          <Form.Item
            label={t("settings.geminiBaseUrl")}
            field="GOOGLE_GEMINI_BASE_URL"
          >
            <Input placeholder="https://generativelanguage.googleapis.com"></Input>
          </Form.Item>
        </>
      ) : authType === "vertex-ai" ? (
        <Form.Item label={t("settings.vertexApiKey")} field="GOOGLE_API_KEY">
          <Input></Input>
        </Form.Item>
      ) : null}

      <Form.Item label={t("settings.proxyConfig")} field="proxy">
        <Input></Input>
      </Form.Item>
      <Form.Item label={t("settings.tempDir")} field="tempDir">
        {(props) => (
          <Input
            disabled
            value={props.tempDir}
            addAfter={
              <FolderOpen
                theme="outline"
                size="24"
                fill="#333"
                onClick={() => {
                  ipcBridge.showItemInFolder.invoke(props.tempDir);
                }}
              />
            }
          ></Input>
        )}
      </Form.Item>
      {error && (
        <Alert
          className={"m-b-10px"}
          type="error"
          content={typeof error === "string" ? error : JSON.stringify(error)}
        />
      )}
      <div className="flex justify-center gap-10px">
        <Button type="secondary" onClick={props.onBack}>
          {t("common.cancel")}
        </Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          {t("common.save")}
        </Button>
      </div>
    </Form>
  );
};

export default GeminiSettings;
