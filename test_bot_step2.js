"ui";

// Step 2 test - Add WebView settings
try {
    files.write("/sdcard/step2_1.txt", "Step 1: Script started");
} catch (e) {}

// Job loading
try {
    const jobPath = '/sdcard/job.json';
    const jobData = files.read(jobPath);
    const JOB_PARAMS = JSON.parse(jobData);
    files.write("/sdcard/step2_2.txt", "Step 2: Job loaded - " + JOB_PARAMS.assignment_id);
} catch (e) {
    files.write("/sdcard/step2_error.txt", "Job error: " + e.message);
}

// UI layout
try {
    ui.layout(
        <vertical>
            <webview id="webView" layout_weight="1" w="*" h="*"/>
        </vertical>
    );
    files.write("/sdcard/step2_3.txt", "Step 3: UI layout created");
} catch (e) {
    files.write("/sdcard/step2_error.txt", "UI error: " + e.message);
}

// WebView settings
try {
    const webView = ui.webView;
    const settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    files.write("/sdcard/step2_4.txt", "Step 4: WebView settings applied");
} catch (e) {
    files.write("/sdcard/step2_error.txt", "WebView settings error: " + e.message);
}

// More WebView settings
try {
    const webView = ui.webView;
    const settings = webView.getSettings();
    settings.setCacheMode(android.webkit.WebSettings.LOAD_NO_CACHE);
    files.write("/sdcard/step2_5.txt", "Step 5: Cache mode set");
} catch (e) {
    files.write("/sdcard/step2_error.txt", "Cache mode error: " + e.message);
}

// User Agent
try {
    const settings = ui.webView.getSettings();
    settings.setUserAgentString(
        "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    );
    settings.setMediaPlaybackRequiresUserGesture(false);
    files.write("/sdcard/step2_6.txt", "Step 6: User agent set");
} catch (e) {
    files.write("/sdcard/step2_error.txt", "UA error: " + e.message);
}

toast("Step 2 test complete");
