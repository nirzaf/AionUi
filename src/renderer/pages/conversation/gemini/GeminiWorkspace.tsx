/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/ipcBridge';
import FlexFullContainer from '@/renderer/components/FlexFullContainer';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Empty, Input, Tree } from '@arco-design/web-react';
import { Refresh, Search } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
const GeminiWorkspace: React.FC<{
  workspace: string;
  customWorkspace?: boolean;
}> = ({ workspace, customWorkspace }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<IDirOrFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState<string>('');
  useAddEventListener('gemini.selected.file.clear', () => {
    setSelected([]);
  });

  useAddEventListener('gemini.selected.file', (files) => {
    setSelected(files);
  });

  const refreshWorkspace = () => {
    setLoading(true);
    const startTime = Date.now();
    ipcBridge.geminiConversation.getWorkspace
      .invoke({ workspace: workspace })
      .then((res) => {
        console.log('----getWorkspace', res);
        setFiles(res);
      })
      .finally(() => {
        if (Date.now() - startTime > 1000) {
          setLoading(false);
        } else {
          setTimeout(() => {
            setLoading(false);
          }, 1000);
        }
      });
  };

  useEffect(() => {
    setFiles([]);
    refreshWorkspace();
    emitter.emit('gemini.selected.file', []);
  }, [workspace]);

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((data) => {
      if (data.type === 'tool_group' || data.type === 'tool_call') {
        refreshWorkspace();
      }
    });
  }, [workspace]);

  useAddEventListener('gemini.workspace.refresh', () => refreshWorkspace(), [workspace]);

  // File search filter logic
  const filteredFiles = useMemo(() => {
    if (!searchText.trim()) return files;

    const filterNode = (node: IDirOrFile): IDirOrFile | null => {
      // Keep node if name matches search text
      if (node.name.toLowerCase().includes(searchText.toLowerCase())) {
        return node;
      }

      // Recursively filter children if they exist
      if (node.children?.length > 0) {
        const filteredChildren = node.children.map((child) => filterNode(child)).filter(Boolean) as IDirOrFile[];

        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
      }

      return null;
    };

    return files.map((file) => filterNode(file)).filter(Boolean) as IDirOrFile[];
  }, [files, searchText]);

  const hasFile = filteredFiles.length > 0 && filteredFiles[0]?.children?.length > 0;
  const hasOriginalFiles = files.length > 0 && files[0]?.children?.length > 0;

  return (
    <div className='size-full flex flex-col'>
      <div className='px-16px pb-8px flex items-center justify-start gap-4px'>
        <span className='font-bold text-14px'>{t('common.file')}</span>
        <Refresh className={loading ? 'loading lh-[1] flex' : 'flex'} theme='outline' fill='#333' onClick={refreshWorkspace} />
      </div>
      {hasOriginalFiles && (
        <div className='px-16px pb-8px'>
          <Input className='w-full' placeholder={t('conversation.workspace.searchPlaceholder')} value={searchText} onChange={setSearchText} allowClear prefix={<Search theme='outline' size='14' fill='#333' />} />
        </div>
      )}
      <FlexFullContainer containerClassName='overflow-y-auto'>
        {!hasFile ? (
          <div className=' flex-1 size-full flex items-center justify-center px-16px box-border'>
            <Empty
              description={
                <div>
                  <span className='color-#6b7280 font-bold text-14px'>{t('conversation.workspace.empty')}</span>
                  <div>{t('conversation.workspace.emptyDescription')}</div>
                </div>
              }
            />
          </div>
        ) : (
          <Tree
            className={'!px-16px'}
            showLine
            selectedKeys={selected}
            treeData={filteredFiles}
            autoExpandParent
            fieldNames={{
              children: 'children',
              title: 'name',
              key: 'path',
            }}
            multiple
            renderTitle={(node) => {
              let timer: any;
              const path = node.dataRef.path;
              let time = Date.now();
              return (
                <span
                  className='flex items-center gap-4px group'
                  onClick={() => {
                    return;
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                      setSelected((list) => {
                        let newList = [...list];
                        if (list.some((key) => key === path)) newList = list.filter((key) => key !== path);
                        else newList = [...list, path];
                        emitter.emit('gemini.selected.file', newList);
                        return newList;
                      });
                    }, 100);
                    console.log('----click', timer, Date.now() - time);
                    time = Date.now();
                  }}
                  onDoubleClick={() => {
                    if (path === workspace) {
                      // first node is workspace
                      return ipcBridge.shell.openFile.invoke(path);
                    }
                    ipcBridge.shell.openFile.invoke(workspace + '/' + path);
                  }}
                >
                  {node.title}
                </span>
              );
            }}
            onSelect={(keys) => {
              const newKeys = keys.filter((key) => key !== workspace);
              setSelected(newKeys);
              emitter.emit('gemini.selected.file', newKeys);
            }}
          ></Tree>
        )}
      </FlexFullContainer>
    </div>
  );
};

export default GeminiWorkspace;
