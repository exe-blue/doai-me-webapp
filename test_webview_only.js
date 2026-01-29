"ui";

files.write("/sdcard/wv_1.txt", "Script started");

ui.layout(
    <vertical>
        <text text="WebView Test" textSize="20sp"/>
        <webview id="webView" layout_weight="1" w="*" h="*"/>
    </vertical>
);

files.write("/sdcard/wv_2.txt", "Layout created");

try {
    var webView = ui.webView;
    files.write("/sdcard/wv_3.txt", "WebView accessed: " + webView);
} catch (e) {
    files.write("/sdcard/wv_error.txt", "WebView access error: " + e.message);
}

try {
    var settings = ui.webView.getSettings();
    files.write("/sdcard/wv_4.txt", "Settings accessed: " + settings);
} catch (e) {
    files.write("/sdcard/wv_error2.txt", "Settings error: " + e.message);
}

toast("WebView test done");
