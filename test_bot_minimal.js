"ui";

// Minimal bot test
try {
    files.write("/sdcard/bot_test_1.txt", "Step 1: Script started");
} catch (e) {
    files.write("/sdcard/bot_test_error.txt", "Error at step 1: " + e);
}

// Test job loading
try {
    const jobPath = '/sdcard/job.json';
    files.write("/sdcard/bot_test_2.txt", "Step 2: Checking job.json at " + jobPath);

    if (!files.exists(jobPath)) {
        files.write("/sdcard/bot_test_error.txt", "job.json not found");
    } else {
        const jobData = files.read(jobPath);
        files.write("/sdcard/bot_test_3.txt", "Step 3: Job data: " + jobData);

        const JOB_PARAMS = JSON.parse(jobData);
        files.write("/sdcard/bot_test_4.txt", "Step 4: Parsed OK - " + JOB_PARAMS.assignment_id);
    }
} catch (e) {
    files.write("/sdcard/bot_test_error.txt", "Error: " + e.message);
}

// Test UI layout
try {
    ui.layout(
        <vertical>
            <text text="Bot Test" textSize="20sp"/>
            <webview id="webView" layout_weight="1" w="*" h="*"/>
        </vertical>
    );
    files.write("/sdcard/bot_test_5.txt", "Step 5: UI layout created");
} catch (e) {
    files.write("/sdcard/bot_test_error.txt", "UI Error: " + e.message);
}

toast("Minimal bot test done");
