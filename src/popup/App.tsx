import React, { useState, useEffect } from 'react';
import { Switch, Select, PasswordInput, Button, Stack, Group, Divider, Progress, Text, List } from '@mantine/core';
import { Typography } from '@mantine/core';
import { Tabs } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useI18n } from '../hooks/useI18n';
import { DEFAULT_CONFIG } from './config';
import './App.css';

interface ConfigForm {
  aiModel: string;
  apiKey: string;
}

const App: React.FC = () => {
  const { t } = useI18n();
  const [autoSkip, setAutoSkip] = useState<boolean>(DEFAULT_CONFIG.autoSkip);
  const [ignoreVideoLessThan5Minutes, setignoreVideoLessThan5Minutes] = useState<boolean>(DEFAULT_CONFIG.ignoreVideoLessThan5Minutes);

  const [browserModelReachable, setBrowserModelReachable] = useState<boolean>(false);
  const [browserModelDownloadProgress, updateBrowserModelDownloadProgress] = useState<number>(0);
  const [browserModelInDownloading, setBrowserModelInDownloading] = useState<boolean>(false);
  const [browserModelAvailable, setBrowserModelAvailable] = useState<boolean>(false);
  const [usingBrowserAIModel, setUsingBrowserAIModel] = useState<boolean>(DEFAULT_CONFIG.usingBrowserAIModel);

  async function checkLocalModelAvailability(): Promise<boolean> {
    if (!window.LanguageModel) {
      showFailedNotification(t("browserModelNotSupported"))
      setBrowserModelReachable(false);
      setBrowserModelAvailable(false)
      return false;
    }

    const availability = await LanguageModel.availability({
      languages: ["cn"]
    });
    
    console.log("📺 🤖 Browser AI model availability", availability);
    if (availability == "unavailable") {
      showFailedNotification(t("browserModelNotSupported"))
      setBrowserModelInDownloading(false);
      setBrowserModelReachable(false);
      setBrowserModelAvailable(false)
      return false;
    }

    if (availability == "downloadable") {
      showSuccessNotification(t("modelIsDownloading"))
      downloadLocalModel();
      setBrowserModelInDownloading(false);
      setBrowserModelReachable(true);
      setBrowserModelAvailable(false)
      return false;
    }

    if (availability == "available") {
      setBrowserModelInDownloading(false);
      setBrowserModelReachable(true);
      setBrowserModelAvailable(true)
      return true;
    }


    if (availability == "downloading") {
      showSuccessNotification(t("modelIsDownloading"))
      setBrowserModelInDownloading(true);
      setBrowserModelReachable(true);
      setBrowserModelAvailable(false)
      return false;
    }

    return false;
  }

  async function downloadLocalModel() {
    return;

    if (!window.LanguageModel) {
      return;
    }

    try {
      await LanguageModel.create({
        monitor(m) {
          m.addEventListener('downloadprogress', (e:any) => {
            const downloadprogress = Math.round(e.loaded * 100);
            console.log("Download progress", downloadprogress)
          });
        },
      });
    } catch (error) {
      console.log(error);
      showFailedNotification(t('failedToDownloadModel'))
    }
  }
  
  useEffect(() => {
    const loadSettings = async () => {
      const result = await chrome.storage.local.get(['autoSkip', 'usingBrowserAIModel', 'ignoreVideoLessThan5Minutes']);
      console.log("📺 ✔️ Loading settings:", result.autoSkip, result.usingBrowserAIModel, result.ignoreVideoLessThan5Minutes);
      if (result.autoSkip !== undefined) {
        setAutoSkip(result.autoSkip);
      } else {
        await chrome.storage.local.set({ autoSkip: DEFAULT_CONFIG.autoSkip });
      }

      if (result.usingBrowserAIModel !== undefined) {
        setUsingBrowserAIModel(result.usingBrowserAIModel);
      } else {
        await chrome.storage.local.set({ usingBrowserAIModel: DEFAULT_CONFIG.usingBrowserAIModel });
      }

      if (result.ignoreVideoLessThan5Minutes !== undefined) {
        setignoreVideoLessThan5Minutes(result.ignoreVideoLessThan5Minutes);
      } else {
        await chrome.storage.local.set({ ignoreVideoLessThan5Minutes: DEFAULT_CONFIG.ignoreVideoLessThan5Minutes });
      }
    };
    
    loadSettings();
    // checkLocalModelAvailability();
  }, []);

  const showSuccessNotification = (message: string) => {
    notifications.show({
      title: t('saved'),
      message: message,
      color: 'green',
      position: 'top-right',
    });
  }

  const showFailedNotification = (message: string) => {
    notifications.show({
      title: t('error'),
      message: message,
      color: 'red',
      position: 'top-right',
    });
  }

  const updateAutoSkip = async (value: boolean) => {
    setAutoSkip(value);
    await chrome.storage.local.set({ autoSkip: value });
    showSuccessNotification(t('refreshToApply'));
  }

  const updateUsingBrowserAIModel = async (value: boolean) => {
    const browserAIModelAvailable = await checkLocalModelAvailability();
    if (!browserAIModelAvailable) {
      return;
    }
    
    setUsingBrowserAIModel(value);
    await chrome.storage.local.set({ usingBrowserAIModel: value });
    showSuccessNotification(t('refreshToApply'));
  }

  const updateignoreVideoLessThan5Minutes = async (value: boolean) => {
    setignoreVideoLessThan5Minutes(value);
    await chrome.storage.local.set({ ignoreVideoLessThan5Minutes: value });
    showSuccessNotification(t('refreshToApply'));
  }

  const form = useForm<ConfigForm>({
    mode: 'uncontrolled',
    initialValues: {
      aiModel: DEFAULT_CONFIG.aiModel,
      apiKey: DEFAULT_CONFIG.apiKey,
    },
  });

  useEffect(() => {
    const loadFormData = async () => {
      const result = await chrome.storage.local.get(['aiModel', 'apiKey']);
      
      form.setValues({
        aiModel: result.aiModel || DEFAULT_CONFIG.aiModel,
        apiKey: result.apiKey || DEFAULT_CONFIG.apiKey,
      });
      form.resetDirty();
    };
    
    loadFormData();
  }, []);

  const handleSubmit = async (values: ConfigForm) => {
    console.log('Saving config:', values);
    await chrome.storage.local.set({
      aiModel: values.aiModel,
      apiKey: values.apiKey
    });
    form.resetDirty();
    showSuccessNotification(t('refreshToApply'));
  };

  return (
    <Tabs defaultValue="config" styles={{ tabLabel: { fontSize: "13px" } }}>
      <Tabs.List>
        <Tabs.Tab value="config">
          {t('configTab')}
        </Tabs.Tab>
        <Tabs.Tab value="instructions">
          {t('instructionsTab')}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="config">
        <div className="app" style={{ padding: '18px', color: 'inherit' }}>
          <Stack gap="sm">
            <Divider size="xs" label={t('basicConfig')} labelPosition='center'></Divider>
            <Switch
              label={t('autoSkipAds')}
              labelPosition="left"
              size="sm"
              styles={{
                body: { justifyContent: 'space-between' },
                trackLabel: { width: '100%' },
                label: { fontSize: '13px' }
              }}
              checked={autoSkip}
              onChange={(event) => updateAutoSkip(event.currentTarget.checked)}
            />
            {/* <Switch
              label={t('usingBrowserAIModel')}
              labelPosition="left"
              size="sm"
              styles={{
                body: { justifyContent: 'space-between' },
                trackLabel: { width: '100%' },
                label: { fontSize: '13px' }
              }}
              checked={usingBrowserAIModel}
              onChange={(event) => updateUsingBrowserAIModel(event.currentTarget.checked)}
            /> */}
            <Switch
              label={t('ignoreVideoLessThan5Minutes')}
              labelPosition="left"
              size="sm"
              styles={{
                body: { justifyContent: 'space-between' },
                trackLabel: { width: '100%' },
                label: { fontSize: '13px' }
              }}
              checked={ignoreVideoLessThan5Minutes}
              onChange={(event) => updateignoreVideoLessThan5Minutes(event.currentTarget.checked)}
            />
          </Stack>
          <form onSubmit={form.onSubmit(handleSubmit)} onReset={form.onReset}>
            <Stack gap="sm">
              <div>
                <Divider my="xs" label={t('aiConfig')} labelPosition="center" styles={{
                  root: {
                    marginBlock: 0,
                    marginBottom: "0px"
                  }
                }} />
                <Select
                  {...form.getInputProps('aiModel')}
                  key={form.key('aiModel')}
                  label={t('aiModel')}
                  placeholder="Pick value"
                  maxDropdownHeight={100}
                  searchable
                  size="xs"
                  data={[
                    {
                      group: 'Gemini',
                      items: [
                        {
                          value: "gemini-3.0-flash",
                          label: "gemini-3.0-flash"
                        },
                        {
                          value: "gemini-2.5-pro",
                          label: "gemini-2.5-pro"
                        },
                        {
                          value: "gemini-2.5-flash",
                          label: "gemini-2.5-flash"
                        },
                      ]
                    }
                  ]}
                />

                <PasswordInput
                  label={t('apiKey')}
                  placeholder={t('enterApiKey')}
                  {...form.getInputProps('apiKey')}
                  size="xs"
                />

              </div>
              <Group justify="flex-end" mt="sm" gap="xs">
                <Button type="submit" size="xs" disabled={!form.isDirty()}>
                  {t('save')}
                </Button>
              </Group>
            </Stack>
          </form>
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="instructions">
        <div style={{ padding: '18px'}}>
          <Text 
            size="sm"
            fw={600}
          >
            {t('howToUse')}
          </Text>
          <List size="sm">
            <List.Item><a href="https://github.com/hh54188/bilibili-ad-killer" target="_blank">English Version</a></List.Item>
            <List.Item><a href="https://www.v2think.com/ad-killer" target="_blank">中文教程</a></List.Item>
          </List>
        </div>
        <div style={{ padding: '18px'}}>
          <Text 
            size="sm"
            fw={600}
          >
            {t('sourceCode')}
          </Text>
          <List size="sm">
            <List.Item><a href="https://github.com/hh54188/bilibili-ad-killer" target="_blank">GitHub</a></List.Item>
          </List>
        </div>
      </Tabs.Panel>

    </Tabs>
  );
};

export default App;
