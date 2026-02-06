"ui";

files.write("/sdcard/wvs_1.txt", "Script started");

ui.layout(
    <vertical>
        <text text="WebView Settings Test" textSize="20sp"/>
        <webview id="webView" layout_weight="1" w="*" h="*"/>
    </vertical>
);

files.write("/sdcard/wvs_2.txt", "Layout created");

var settings = ui.webView.getSettings();
files.write("/sdcard/wvs_3.txt", "Settings accessed");

try {
    settings.setJavaScriptEnabled(true);
    files.write("/sdcard/wvs_4.txt", "JS enabled");
} catch (e) {
    files.write("/sdcard/wvs_e1.txt", "JS error: " + e.message);
}

try {
    settings.setDomStorageEnabled(true);
    files.write("/sdcard/wvs_5.txt", "DOM storage enabled");
} catch (e) {
    files.write("/sdcard/wvs_e2.txt", "DOM error: " + e.message);
}

try {
    settings.setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
    files.write("/sdcard/wvs_6.txt", "Cache mode set");
} catch (e) {
    files.write("/sdcard/wvs_e3.txt", "Cache error: " + e.message);
}

try {
    settings.setUserAgentString("Mozilla/5.0 Test");
    files.write("/sdcard/wvs_7.txt", "User agent set");
} catch (e) {
    files.write("/sdcard/wvs_e4.txt", "UA error: " + e.message);
}

toast("WebView settings test done");
