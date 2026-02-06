"ui";

// Minimal UI test - just create UI and write a file
ui.layout(
    <vertical>
        <text text="Minimal UI Test" textSize="20sp"/>
    </vertical>
);

// Write checkpoint immediately after UI layout
files.write("/sdcard/ui_test.txt", "UI script executed at " + new Date().toISOString());
toast("UI test done!");
