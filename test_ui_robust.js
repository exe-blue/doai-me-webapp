"ui";

// Robust UI test with try-catch
try {
    files.write("/sdcard/ui_robust_1.txt", "Before layout: " + new Date().toISOString());

    ui.layout(
        <vertical>
            <text text="Robust UI Test" textSize="20sp"/>
        </vertical>
    );

    files.write("/sdcard/ui_robust_2.txt", "After layout: " + new Date().toISOString());

    // Event handler for when the view is shown
    ui.emitter.on("viewLoaded", function() {
        files.write("/sdcard/ui_robust_3.txt", "View loaded: " + new Date().toISOString());
    });

    toast("Robust UI test running");

} catch (e) {
    files.write("/sdcard/ui_robust_error.txt", "Error: " + e.message + " at " + new Date().toISOString());
}
