"ui";

// UI test with deferred file write
ui.layout(
    <vertical>
        <text text="UI Deferred Test" textSize="20sp"/>
    </vertical>
);

// Use ui.run() to execute in UI thread context
ui.run(function() {
    files.write("/sdcard/ui_defer_test.txt", "UI deferred executed at " + new Date().toISOString());
    toast("UI deferred test done!");
});
