/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/storage';
import { Alert, Badge, Button, Divider, Form, Input, Tag, Tooltip } from '@arco-design/web-react';
import { Delete, FolderOpen, Plus, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingContainer from './components/SettingContainer';

interface IApiKeyStatus {
  key: string;
  status: string;
  resetTime?: number;
  timeUntilReset?: number;
  isActive: boolean;
}

const GeminiSettings: React.FC = (props) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<string[]>(['']);
  const [keyStatuses, setKeyStatuses] = useState<IApiKeyStatus[]>([]);
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [keyStatusLoading, setKeyStatusLoading] = useState(false);

  const loadKeyStatuses = useCallback(async () => {
    try {
      setKeyStatusLoading(true);
      const statuses = await (ipcBridge as any).geminiApis.getKeyStatuses.invoke();
      setKeyStatuses(statuses);
    } catch (error) {
      console.error('Failed to load key statuses:', error);
    } finally {
      setKeyStatusLoading(false);
    }
  }, []);

  const addApiKey = () => {
    if (apiKeys.length < 5) {
      setApiKeys([...apiKeys, '']);
    }
  };

  const removeApiKey = (index: number) => {
    if (apiKeys.length > 1) {
      const newKeys = apiKeys.filter((_, i) => i !== index);
      setApiKeys(newKeys);
      if (activeKeyIndex >= newKeys.length) {
        setActiveKeyIndex(Math.max(0, newKeys.length - 1));
      }
    }
  };

  const switchActiveKey = (index: number) => {
    setActiveKeyIndex(index);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid': return 'green';
      case 'rate-limited': return 'orange';
      case 'invalid': return 'red';
      case 'expired': return 'red';
      default: return 'gray';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'valid': return t('settings.apiKeys.status.valid');
      case 'rate-limited': return t('settings.apiKeys.status.rateLimited');
      case 'invalid': return t('settings.apiKeys.status.invalid');
      case 'expired': return t('settings.apiKeys.status.expired');
      default: return t('settings.apiKeys.status.unknown');
    }
  };

  const formatTimeUntilReset = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await ConfigStorage.get('gemini.config');
        if (config) {
          setApiKeys(config.GEMINI_API_KEYS || ['']);
          setActiveKeyIndex(config.activeKeyIndex || 0);
        }
        await loadKeyStatuses();
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError(t('settings.loadError'));
      }
    };
    loadConfig();
  }, [loadKeyStatuses, t]);

  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);
      setError(null);
      
      const validKeys = apiKeys.filter(key => key.trim() !== '');
      if (validKeys.length === 0) {
        setError(t('settings.apiKeys.required'));
        return;
      }

      const currentConfig = await ConfigStorage.get('gemini.config') || {
        authType: 'api',
        proxy: ''
      };
      await ConfigStorage.set('gemini.config', {
        ...currentConfig,
        GEMINI_API_KEYS: validKeys,
        activeKeyIndex: Math.min(activeKeyIndex, validKeys.length - 1)
      });
      
      await (ipcBridge as any).geminiApis.updateKeys.invoke({ keys: validKeys });
      await loadKeyStatuses();
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(t('settings.saveError'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setGoogleAccountLoading(true);
      await ipcBridge.googleAuth.login.invoke({});
    } catch (err) {
      console.error('Google auth failed:', err);
      setError(t('settings.googleAuth.error'));
    } finally {
      setGoogleAccountLoading(false);
    }
  };

  const openApiKeyPage = () => {
    ipcBridge.shell.openExternal.invoke('https://aistudio.google.com/app/apikey');
  };

  return (
    <SettingContainer title={t('settings.gemini.title')}>
      <Form form={form} onValuesChange={(_, values) => setApiKeys(values.apiKeys)} onSubmit={handleSubmit} layout='vertical'>
        <Form.Item label={t('settings.gemini.authMethod')}>
          <div className='flex flex-col gap-12px'>
            <Button
              type='outline'
              icon={<FolderOpen />}
              onClick={handleGoogleAuth}
              loading={googleAccountLoading}
            >
              {t('settings.gemini.useGoogleAccount')}
            </Button>
            
            <Divider orientation='center'>{t('settings.gemini.or')}</Divider>
            
            <div className='flex flex-col gap-8px'>
              <div className='flex items-center justify-between'>
                <span className='font-medium'>{t('settings.gemini.apiKeys')}</span>
                <Button
                  type='text'
                  size='small'
                  onClick={openApiKeyPage}
                >
                  {t('settings.gemini.getApiKey')}
                </Button>
              </div>
              
              <Form.List field='apiKeys'>
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, index) => {
                      const keyStatus = keyStatuses.find(s => s.key === apiKeys[index]);
                      const isActive = index === activeKeyIndex;
                      return (
                        <div key={field.key} className='flex items-center gap-8px'>
                          <Form.Item field={field.field} noStyle>
                            <Input
                              placeholder={t('settings.gemini.apiKeyPlaceholder')}
                              className='flex-1'
                            />
                          </Form.Item>
                          
                          {keyStatus && (
                            <Tooltip
                              content={
                                <div>
                                  <div>{getStatusText(keyStatus.status)}</div>
                                  {keyStatus.timeUntilReset && keyStatus.timeUntilReset > 0 && (
                                    <div>{t('settings.apiKeys.resetIn')}: {formatTimeUntilReset(keyStatus.timeUntilReset)}</div>
                                  )}
                                </div>
                              }
                            >
                              <Tag
                                color={getStatusColor(keyStatus.status)}
                                size='small'
                                className='cursor-pointer'
                                onClick={() => !isActive && switchActiveKey(index)}
                              >
                                {isActive && '★ '}{getStatusText(keyStatus.status)}
                                {keyStatus.timeUntilReset && keyStatus.timeUntilReset > 0 &&
                                  ` (${formatTimeUntilReset(keyStatus.timeUntilReset)})`
                                }
                              </Tag>
                            </Tooltip>
                          )}

                          {!isActive && (
                            <Button
                              type='text'
                              size='small'
                              onClick={() => switchActiveKey(index)}
                            >
                              {t('settings.apiKeys.setActive')}
                            </Button>
                          )}

                          {apiKeys.length > 1 && (
                            <Button
                              type='text'
                              size='small'
                              icon={<Delete />}
                              onClick={() => remove(index)}
                              status='danger'
                            />
                          )}
                        </div>
                      );
                    })}
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-8px'>
                        {apiKeys.length < 5 && (
                          <Button
                            type='outline'
                            size='small'
                            icon={<Plus />}
                            onClick={() => add('')}
                          >
                            {t('settings.apiKeys.addKey')}
                          </Button>
                        )}

                        <Button
                          type='text'
                          size='small'
                          icon={<Refresh />}
                          onClick={loadKeyStatuses}
                          loading={keyStatusLoading}
                        >
                          {t('settings.apiKeys.refreshStatus')}
                        </Button>
                      </div>

                      <div className='text-12px text-gray-500'>
                        {t('settings.apiKeys.maxKeys', { max: 5, current: apiKeys.length })}
                      </div>
                    </div>
                  </>
                )}
              </Form.List>
            </div>
          </div>
        </Form.Item>

        <Form.Item>
          <Button type='primary' htmlType='submit' loading={loading}>
            {t('settings.save')}
          </Button>
        </Form.Item>

        {error && <Alert className={'m-b-10px'} type='error' content={typeof error === 'string' ? error : JSON.stringify(error)} />}
      </Form>
    </SettingContainer>
  );
};

export default GeminiSettings;