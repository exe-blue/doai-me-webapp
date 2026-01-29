/**
 * Quick Module Loading Test
 *
 * Purpose: Standalone test for AutoX.js require() compatibility
 * Use this if pre-flight.js fails and you need to debug module loading specifically
 */

"ui";

ui.layout(
    <vertical>
        <text id="title" text="Quick Module Loading Test" textSize="18sp" margin="16"/>
        <scroll layout_weight="1">
            <text id="log" textSize="14sp" margin="16"/>
        </scroll>
    </vertical>
);

function log(msg) {
    console.log(msg);
    ui.run(() => {
        const current = ui.log.getText().toString();
        ui.log.setText(current + "\n" + msg);
    });
}

// =============================================
// Test: Create and Load Module
// =============================================
function testModuleLoading() {
    log("🧪 Starting module loading test...");
    log("");

    try {
        // Step 1: Create test module directory
        const modulesDir = files.cwd() + "/modules";
        if (!files.exists(modulesDir)) {
            files.createWithDirs(modulesDir);
            log("✅ Created modules/ directory");
        }

        // Step 2: Create test module file
        const modulePath = modulesDir + "/dom_utils.js";
        const moduleContent = `
/**
 * Test Module: DOM Utilities
 */

module.exports = {
    // Test function
    waitForElement: function(selector, timeout) {
        return "waitForElement called with: " + selector;
    },

    // Test function with closure
    createSelector: function(base) {
        return function(suffix) {
            return base + " " + suffix;
        };
    },

    // Test value
    version: "1.0.0",

    // Test object
    config: {
        timeout: 5000,
        retries: 3
    }
};
`;

        files.write(modulePath, moduleContent);
        log("✅ Created test module: " + modulePath);
        log("");

        // Step 3: Test different require() patterns
        log("Testing require() patterns:");
        log("─────────────────────────────");

        let testModule;
        let loadMethod = null;

        // Pattern 1: Absolute path with .js
        try {
            testModule = require(modulePath);
            loadMethod = "Absolute path with .js";
            log("✅ Pattern 1: require('" + modulePath + "') - SUCCESS");
        } catch (e1) {
            log("❌ Pattern 1: Absolute path - FAILED: " + e1.message);

            // Pattern 2: Relative path
            try {
                testModule = require('./modules/dom_utils.js');
                loadMethod = "Relative path";
                log("✅ Pattern 2: require('./modules/dom_utils.js') - SUCCESS");
            } catch (e2) {
                log("❌ Pattern 2: Relative path - FAILED: " + e2.message);

                // Pattern 3: Relative without .js
                try {
                    testModule = require('./modules/dom_utils');
                    loadMethod = "Relative without .js";
                    log("✅ Pattern 3: require('./modules/dom_utils') - SUCCESS");
                } catch (e3) {
                    log("❌ Pattern 3: Relative without .js - FAILED: " + e3.message);
                    throw new Error("All require() patterns failed");
                }
            }
        }

        log("");
        log("✅ Working pattern: " + loadMethod);
        log("");

        // Step 4: Verify module contents
        log("Verifying module exports:");
        log("─────────────────────────────");

        // Check function
        if (typeof testModule.waitForElement === 'function') {
            const result = testModule.waitForElement('button.test', 5000);
            log("✅ Function call: " + result);
        } else {
            throw new Error("waitForElement is not a function");
        }

        // Check closure
        if (typeof testModule.createSelector === 'function') {
            const selector = testModule.createSelector('div.container');
            const full = selector('> button');
            log("✅ Closure: " + full);
        } else {
            throw new Error("createSelector is not a function");
        }

        // Check value
        if (testModule.version === "1.0.0") {
            log("✅ Value access: version = " + testModule.version);
        } else {
            throw new Error("Version mismatch");
        }

        // Check object
        if (testModule.config && testModule.config.timeout === 5000) {
            log("✅ Object access: config.timeout = " + testModule.config.timeout);
        } else {
            throw new Error("Config object not accessible");
        }

        log("");
        log("════════════════════════════════");
        log("🎉 ALL TESTS PASSED!");
        log("════════════════════════════════");
        log("");
        log("Summary:");
        log("• Module loading: ✓");
        log("• Function exports: ✓");
        log("• Closure support: ✓");
        log("• Value exports: ✓");
        log("• Object exports: ✓");
        log("");
        log("✅ AutoX.js supports modular architecture");
        log("✅ Safe to proceed with Phase 1 implementation");

        ui.run(() => {
            ui.title.setText("✅ Test Passed");
            ui.title.setTextColor(colors.GREEN);
        });

        // Cleanup
        files.remove(modulePath);
        files.remove(modulesDir);
        log("");
        log("🗑️ Cleanup complete");

    } catch (error) {
        log("");
        log("════════════════════════════════");
        log("❌ TEST FAILED");
        log("════════════════════════════════");
        log("");
        log("Error: " + error.message);
        log("");
        log("⚠️ AutoX.js may not support require()");
        log("");
        log("Alternatives:");
        log("1. Upgrade to AutoX.js Pro");
        log("2. Use eval(files.read()) instead of require()");
        log("3. Inline all module code in bot.js");

        ui.run(() => {
            ui.title.setText("❌ Test Failed");
            ui.title.setTextColor(colors.RED);
        });
    }
}

// Run test after 1 second
setTimeout(testModuleLoading, 1000);
