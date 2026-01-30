/**
 * Expo config plugin to configure WebViewAssetLoader for secure context
 *
 * This plugin modifies the Android MainActivity to serve WebView assets
 * via https://appassets.androidplatform.net/ which provides a secure context
 * needed for WebCrypto APIs.
 */

const { withMainActivity } = require('@expo/config-plugins');

const WEBVIEW_ASSET_LOADER_IMPORT = `
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
`;

const WEBVIEW_ASSET_LOADER_CODE = `
  // Configure WebViewAssetLoader for secure context (WebCrypto support)
  static {
    WebView.setWebContentsDebuggingEnabled(true);
  }

  public static class LocalContentWebViewClient extends WebViewClientCompat {
    private final WebViewAssetLoader mAssetLoader;

    LocalContentWebViewClient(WebViewAssetLoader assetLoader) {
      mAssetLoader = assetLoader;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
      return mAssetLoader.shouldInterceptRequest(request.getUrl());
    }
  }

  private void setupWebViewAssetLoader() {
    WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
      .addPathHandler("/lit-bundle/", new WebViewAssetLoader.AssetsPathHandler(this))
      .build();
    // Store the asset loader for use by react-native-webview
    getReactInstanceManager().getCurrentReactContext()
      .getNativeModule(com.reactnativecommunity.webview.RNCWebViewModule.class)
      .setAssetLoader(assetLoader);
  }
`;

module.exports = function withWebViewAssetLoader(config) {
  return withMainActivity(config, async (config) => {
    const { modResults } = config;
    let contents = modResults.contents;

    // Add imports
    if (!contents.includes('WebViewAssetLoader')) {
      const packageIndex = contents.indexOf('package ');
      const firstImportIndex = contents.indexOf('import ', packageIndex);
      contents =
        contents.slice(0, firstImportIndex) +
        WEBVIEW_ASSET_LOADER_IMPORT +
        contents.slice(firstImportIndex);
    }

    // Add WebViewAssetLoader setup code
    if (!contents.includes('LocalContentWebViewClient')) {
      const classIndex = contents.indexOf('public class MainActivity');
      const firstBraceIndex = contents.indexOf('{', classIndex);
      contents =
        contents.slice(0, firstBraceIndex + 1) +
        WEBVIEW_ASSET_LOADER_CODE +
        contents.slice(firstBraceIndex + 1);
    }

    // Call setup in onCreate
    if (!contents.includes('setupWebViewAssetLoader')) {
      const onCreateIndex = contents.indexOf('protected void onCreate(');
      if (onCreateIndex !== -1) {
        const superIndex = contents.indexOf('super.onCreate', onCreateIndex);
        const semiIndex = contents.indexOf(';', superIndex);
        contents =
          contents.slice(0, semiIndex + 1) +
          '\n    setupWebViewAssetLoader();' +
          contents.slice(semiIndex + 1);
      }
    }

    modResults.contents = contents;
    return config;
  });
};
