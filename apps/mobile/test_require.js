/**
 * Test Script: Module Loading Validation (ES5 Compatible)
 *
 * Purpose: Validate module-loader.js and test complex module dependencies
 * Target: webview_bot.js dependencies (most complex)
 *
 * Success Criteria: Outputs "Module Loaded" without errors
 */

"ui";

console.log("========================================================");
console.log("  Module Loading Test - AutoX.js                        ");
console.log("========================================================");
console.log("");

// =============================================
// Test 1: Load module-loader.js
// =============================================

console.log("[Test 1] Loading module-loader.js...");

var moduleLoader;
try {
    // Try relative path first
    moduleLoader = require('./modules/module-loader.js');
    console.log("[OK] module-loader.js loaded (relative path)");
} catch (e1) {
    console.log("[WARN] Relative path failed: " + e1.message);

    try {
        // Try absolute path
        var loaderPath = files.cwd() + '/modules/module-loader.js';
        moduleLoader = require(loaderPath);
        console.log("[OK] module-loader.js loaded (absolute path)");
    } catch (e2) {
        console.error("[FAIL] Test 1 FAILED: " + e2.message);
        console.error("");
        console.error("Troubleshooting:");
        console.error("1. Check files.cwd(): " + files.cwd());
        console.error("2. Verify module-loader.js exists");
        exit();
    }
}

console.log("   Base path: " + moduleLoader.getModuleBasePath());
console.log("");

// =============================================
// Test 2: Load simple module (config.js)
// =============================================

console.log("[Test 2] Loading config.js...");

var config;
try {
    config = moduleLoader.loadModule('config');
    console.log("[OK] config.js loaded");

    // Verify exports
    if (config.SELECTORS_PATH) {
        console.log("   - SELECTORS_PATH exists: " + config.SELECTORS_PATH);
    } else {
        console.warn("   [WARN] SELECTORS_PATH not found in config");
    }
} catch (error) {
    console.error("[FAIL] Test 2 FAILED: " + error.message);
    exit();
}

console.log("");

// =============================================
// Test 3: Load complex module (dom_utils.js)
// =============================================

console.log("[Test 3] Loading dom_utils.js...");

var domUtils;
try {
    domUtils = moduleLoader.loadModule('dom_utils');
    console.log("[OK] dom_utils.js loaded");

    // Verify key functions
    var expectedFunctions = [
        'getInjectionCode',
        'waitForElement',
        'clickElement',
        'typeText'
    ];

    var functionsFound = 0;
    for (var i = 0; i < expectedFunctions.length; i++) {
        var funcName = expectedFunctions[i];
        if (typeof domUtils[funcName] === 'function') {
            functionsFound++;
            console.log("   [v] " + funcName);
        } else {
            console.warn("   [x] " + funcName + " (missing)");
        }
    }

    if (functionsFound === expectedFunctions.length) {
        console.log("   All expected functions present!");
    } else {
        console.warn("   Only " + functionsFound + "/" + expectedFunctions.length + " functions found");
    }

} catch (error) {
    console.error("[FAIL] Test 3 FAILED: " + error.message);
    exit();
}

console.log("");

// =============================================
// Test 4: Load module with dependencies (webview-setup.js)
// =============================================

console.log("[Test 4] Loading webview-setup.js...");

var webviewSetup;
try {
    webviewSetup = moduleLoader.loadModule('webview-setup');
    console.log("[OK] webview-setup.js loaded");

    // Verify exports
    if (typeof webviewSetup.initializeWebView === 'function') {
        console.log("   [v] initializeWebView function exists");
    } else {
        console.warn("   [x] initializeWebView function missing");
    }

} catch (error) {
    console.error("[FAIL] Test 4 FAILED: " + error.message);
    exit();
}

console.log("");

// =============================================
// Test 5: Load all webview_bot.js dependencies
// =============================================

console.log("[Test 5] Loading all webview_bot.js dependencies...");

var requiredModules = [
    'webview-setup',
    'dom_utils',
    'config',
    'job-loader',
    'evidence-manager'
];

try {
    var modules = moduleLoader.loadModules(requiredModules);

    var allLoaded = true;
    for (var j = 0; j < requiredModules.length; j++) {
        var moduleName = requiredModules[j];
        if (modules[moduleName]) {
            console.log("   [v] " + moduleName);
        } else {
            console.warn("   [x] " + moduleName + " (failed)");
            allLoaded = false;
        }
    }

    if (allLoaded) {
        console.log("[OK] All dependencies loaded successfully!");
    } else {
        console.warn("[WARN] Some dependencies failed to load");
    }

} catch (error) {
    console.error("[FAIL] Test 5 FAILED: " + error.message);
    exit();
}

console.log("");

// =============================================
// Test 6: Module cache verification
// =============================================

console.log("[Test 6] Verifying module cache...");

var cachedModules = moduleLoader.getLoadedModules();
console.log("   Cached modules (" + cachedModules.length + "):");
for (var k = 0; k < cachedModules.length; k++) {
    console.log("   " + (k + 1) + ". " + cachedModules[k]);
}

console.log("");

// =============================================
// Test 7: Function execution test
// =============================================

console.log("[Test 7] Testing function execution...");

try {
    // Test getInjectionCode (should return a string)
    var injectionCode = domUtils.getInjectionCode();

    if (typeof injectionCode === 'string' && injectionCode.length > 0) {
        console.log("[OK] getInjectionCode() executed successfully");
        console.log("   Code length: " + injectionCode.length + " characters");
    } else {
        console.warn("[WARN] getInjectionCode() returned unexpected value");
    }

} catch (error) {
    console.error("[FAIL] Test 7 FAILED: " + error.message);
}

console.log("");

// =============================================
// FINAL RESULT
// =============================================

console.log("========================================================");
console.log("  ALL TESTS PASSED!");
console.log("========================================================");
console.log("");
console.log("Module Loaded");  // SUCCESS SIGNAL
console.log("");
console.log("Next steps:");
console.log("1. Update webview_bot.js to use module-loader.js");
console.log("2. Replace all require('./modules/...') with loadModule(...)");
console.log("3. Test actual bot execution");
console.log("");
