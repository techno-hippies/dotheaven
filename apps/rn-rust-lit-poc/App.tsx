import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  debugNativePasskeyAssertion,
  registerMintAndCreateAuthContextWithNativePasskey,
} from './src/lib/native-passkey-auth';
import {
  litRustCreateAuthContextFromPasskeyCallback,
  litRustHealthcheck,
  litRustTestConnect,
  type LitRustNetwork,
} from './src/lib/lit-rust';

const NETWORK_OPTIONS: LitRustNetwork[] = [
  'naga-dev',
  'naga-test',
  'naga-staging',
  'naga-proto',
  'naga',
];

const DEFAULT_RPC_URL = 'https://yellowstone-rpc.litprotocol.com';
const DEFAULT_AUTH_SERVICE_BASE_URL = 'https://naga-dev-auth-service.getlit.dev';
const DEFAULT_PASSKEY_RP_ID = 'dotheaven.org';
const DEFAULT_AUTH_CONTEXT_DOMAIN = '';
const DEFAULT_PASSKEY_USERNAME = 'Heaven';
const DEFAULT_PASSKEY_RP_NAME = 'Heaven';
const DEFAULT_DIRECT_AUTH_METHOD_TYPE = '3';
const DEFAULT_DIRECT_PKP_PUBKEY = '';
const DEFAULT_DIRECT_AUTH_METHOD_ID = '';
const DEFAULT_DIRECT_ACCESS_TOKEN = '';

export default function App() {
  const [network, setNetwork] = useState<LitRustNetwork>('naga-dev');
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC_URL);
  const [authServiceBaseUrl, setAuthServiceBaseUrl] = useState(DEFAULT_AUTH_SERVICE_BASE_URL);
  const [passkeyRpId, setPasskeyRpId] = useState(DEFAULT_PASSKEY_RP_ID);
  const [authContextDomain, setAuthContextDomain] = useState(DEFAULT_AUTH_CONTEXT_DOMAIN);
  const [passkeyUsername, setPasskeyUsername] = useState(DEFAULT_PASSKEY_USERNAME);
  const [passkeyRpName, setPasskeyRpName] = useState(DEFAULT_PASSKEY_RP_NAME);
  const [directPkpPublicKey, setDirectPkpPublicKey] = useState(DEFAULT_DIRECT_PKP_PUBKEY);
  const [directAuthMethodType, setDirectAuthMethodType] = useState(DEFAULT_DIRECT_AUTH_METHOD_TYPE);
  const [directAuthMethodId, setDirectAuthMethodId] = useState(DEFAULT_DIRECT_AUTH_METHOD_ID);
  const [directAccessToken, setDirectAccessToken] = useState(DEFAULT_DIRECT_ACCESS_TOKEN);
  const [output, setOutput] = useState('Bootstrapping Rust bridge...');
  const [pending, setPending] = useState(false);

  const buttonLabel = useMemo(() => (pending ? 'Working...' : 'Run'), [pending]);

  async function runWithOutput(task: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    try {
      const result = await task();
      console.log('[PoC] Action result', result);
      setOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[PoC] Action error', message);
      setOutput(`Error: ${message}`);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setPending(true);
      try {
        const result = await litRustHealthcheck();
        if (cancelled) return;
        console.log('[PoC] Rust healthcheck OK', result);
        setOutput(JSON.stringify(result, null, 2));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[PoC] Rust healthcheck failed', message);
        setOutput(`Error: ${message}`);
      } finally {
        if (!cancelled) {
          setPending(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>RN Rust Lit PoC</Text>
        <Text style={styles.subtitle}>
          Native passkey prompt + Rust Lit SDK auth context (no browser, no WebView).
        </Text>

        <View style={styles.section}>
          <Text style={styles.label}>Network</Text>
          <View style={styles.rowWrap}>
            {NETWORK_OPTIONS.map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.chip, network === value && styles.chipActive]}
                onPress={() => setNetwork(value)}
                disabled={pending}
              >
                <Text style={[styles.chipText, network === value && styles.chipTextActive]}>
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>RPC URL</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://..."
            placeholderTextColor="#7b8a9b"
            value={rpcUrl}
            onChangeText={setRpcUrl}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Auth Service Base URL</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://naga-dev-auth-service.getlit.dev"
            placeholderTextColor="#7b8a9b"
            value={authServiceBaseUrl}
            onChangeText={setAuthServiceBaseUrl}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Passkey RP ID</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="dotheaven.org"
            placeholderTextColor="#7b8a9b"
            value={passkeyRpId}
            onChangeText={setPasskeyRpId}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Auth Context Domain (optional override)</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="blank = passkey RP ID"
            placeholderTextColor="#7b8a9b"
            value={authContextDomain}
            onChangeText={setAuthContextDomain}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Passkey Username</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Heaven"
            placeholderTextColor="#7b8a9b"
            value={passkeyUsername}
            onChangeText={setPasskeyUsername}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Passkey RP Name</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            placeholder="Heaven"
            placeholderTextColor="#7b8a9b"
            value={passkeyRpName}
            onChangeText={setPasskeyRpName}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Direct Auth Test: PKP Public Key</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="0x04..."
            placeholderTextColor="#7b8a9b"
            value={directPkpPublicKey}
            onChangeText={setDirectPkpPublicKey}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Direct Auth Test: Auth Method Type</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numeric"
            placeholder="3"
            placeholderTextColor="#7b8a9b"
            value={directAuthMethodType}
            onChangeText={setDirectAuthMethodType}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Direct Auth Test: Auth Method ID</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="0x..."
            placeholderTextColor="#7b8a9b"
            value={directAuthMethodId}
            onChangeText={setDirectAuthMethodId}
            editable={!pending}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Direct Auth Test: Access Token JSON</Text>
          <TextInput
            style={styles.textArea}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            placeholder='{"id":"...","rawId":"...","response":{...}}'
            placeholderTextColor="#7b8a9b"
            value={directAccessToken}
            onChangeText={setDirectAccessToken}
            editable={!pending}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              runWithOutput(() =>
                registerMintAndCreateAuthContextWithNativePasskey({
                  network,
                  rpcUrl,
                  authServiceBaseUrl,
                  passkeyRpId,
                  authContextDomain,
                  username: passkeyUsername,
                  rpName: passkeyRpName,
                  onStatus: (message) => {
                    setOutput(message);
                  },
                }),
              )
            }
            disabled={pending}
          >
            <Text style={styles.buttonText}>{buttonLabel} Native Passkey Mint + Auth Context</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={() => runWithOutput(() => debugNativePasskeyAssertion(passkeyRpId))}
            disabled={pending}
          >
            <Text style={styles.buttonText}>{buttonLabel} Native Passkey Assertion (Debug)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              runWithOutput(() =>
                litRustCreateAuthContextFromPasskeyCallback(
                  network,
                  rpcUrl,
                  directPkpPublicKey,
                  Number.parseInt(directAuthMethodType, 10),
                  directAuthMethodId,
                  directAccessToken,
                  authContextDomain.trim() || passkeyRpId,
                ),
              )
            }
            disabled={pending}
          >
            <Text style={styles.buttonText}>{buttonLabel} Direct Create Auth Context (Token)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={() => runWithOutput(() => litRustTestConnect(network, rpcUrl))}
            disabled={pending}
          >
            <Text style={styles.buttonText}>{buttonLabel} Test Connect</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={() => runWithOutput(() => litRustHealthcheck())}
            disabled={pending}
          >
            <Text style={styles.buttonText}>{buttonLabel} Healthcheck</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.outputBox}>
          <Text style={styles.outputLabel}>Output</Text>
          <Text style={styles.outputText}>{output}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#081421',
  },
  container: {
    padding: 20,
    gap: 18,
  },
  title: {
    color: '#f2f7fc',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9fb0c3',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 8,
  },
  label: {
    color: '#d9e6f5',
    fontSize: 13,
    fontWeight: '600',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#26425f',
    backgroundColor: '#112235',
  },
  chipActive: {
    borderColor: '#7cd2ff',
    backgroundColor: '#0f324d',
  },
  chipText: {
    color: '#97acc0',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#d8f4ff',
  },
  input: {
    color: '#f2f7fc',
    borderWidth: 1,
    borderColor: '#26425f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#112235',
    fontSize: 14,
  },
  textArea: {
    color: '#f2f7fc',
    borderWidth: 1,
    borderColor: '#26425f',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#112235',
    fontSize: 12,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  actions: {
    gap: 10,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1c5276',
    borderWidth: 1,
    borderColor: '#7cd2ff',
  },
  buttonText: {
    color: '#ecf8ff',
    fontSize: 14,
    fontWeight: '700',
  },
  outputBox: {
    borderWidth: 1,
    borderColor: '#26425f',
    borderRadius: 12,
    backgroundColor: '#0d1d2d',
    padding: 12,
    gap: 8,
    minHeight: 140,
  },
  outputLabel: {
    color: '#9fb0c3',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  outputText: {
    color: '#d8e7f7',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
