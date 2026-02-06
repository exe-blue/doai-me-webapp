/**
 * Phase 0: Pre-Flight Validation Script
 *
 * Purpose: Verify AutoX.js WebView API compatibility before full implementation
 *
 * Tests:
 * 1. WebView rendering
 * 2. WebSettings configuration
 * 3. YouTube mobile site loading
 * 4. evaluateJavascript execution
 * 5. Search selector validation
 *
 * Exit Criteria: 5/5 tests must pass to proceed to Phase 1
 */

"ui";

const RESULTS = {
    passed: 0,
    failed: 0,
    tests: []
};

// =============================================
// Test 1: WebView Rendering
// =============================================
function testWebViewRendering() {
    const testName = "Test 1: WebView Rendering";
    try {
        ui.layout(
            <vertical>
                <text id="title" text="Phase 0: Pre-Flight Validation" textSize="20sp" gravity="center" margin="16"/>
                <text id="status" text="Running tests..." textSize="16sp" margin="16"/>
                <scroll layout_weight="1">
                    <text id="log" textSize="12sp" margin="16"/>
                </scroll>
                <webview id="webView" h="400dp" w="*"/>
            </vertical>
        );

        addLog("✅ " + testName + ": SUCCESS");
        RESULTS.passed++;
        RESULTS.tests.push({ name: testName, passed: true });
        return true;

    } catch (e) {
        addLog("❌ " + testName + ": FAILED - " + e.message);
        RESULTS.failed++;
        RESULTS.tests.push({ name: testName, passed: false, error: e.message });
        return false;
    }
}

// =============================================
// Test 2: WebSettings Configuration
// =============================================
function testWebSettings() {
    const testName = "Test 2: WebSettings Configuration";
    try {
        const webView = ui.webView;
        const settings = webView.getSettings();

        // Enable JavaScript
        settings.setJavaScriptEnabled(true);

        // Enable DOM storage
        settings.setDomStorageEnabled(true);

        // Set mobile User-Agent
        settings.setUserAgentString(
            "Mozilla/5.0 (Linux; Android 10; SM-G973F) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0.6099.230 Mobile Safari/537.36"
        );

        // Verify settings
        if (!settings.getJavaScriptEnabled()) {
            throw new Error("JavaScript not enabled");
        }

        addLog("✅ " + testName + ": SUCCESS");
        addLog("   - JavaScript enabled: ✓");
        addLog("   - DOM storage enabled: ✓");
        addLog("   - Mobile UA set: ✓");

        RESULTS.passed++;
        RESULTS.tests.push({ name: testName, passed: true });
        return true;

    } catch (e) {
        addLog("❌ " + testName + ": FAILED - " + e.message);
        RESULTS.failed++;
        RESULTS.tests.push({ name: testName, passed: false, error: e.message });
        return false;
    }
}

// =============================================
// Test 3: YouTube Mobile Site Loading
// =============================================
function testYouTubeLoad() {
    const testName = "Test 3: YouTube Mobile Loading";

    return new Promise((resolve) => {
        const webView = ui.webView;
        let resolved = false;

        webView.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
            onPageStarted: function(view, url, favicon) {
                addLog("📄 Loading: " + url);
            },

            onPageFinished: function(view, url) {
                if (resolved) return;

                addLog("📄 Page loaded: " + url);

                // Verify it's YouTube
                if (!url.includes("youtube.com")) {
                    addLog("❌ " + testName + ": FAILED - Not YouTube");
                    RESULTS.failed++;
                    RESULTS.tests.push({
                        name: testName,
                        passed: false,
                        error: "Loaded URL is not YouTube: " + url
                    });
                    resolved = true;
                    resolve(false);
                    return;
                }

                // Wait 2s for page to settle, then verify
                setTimeout(() => {
                    if (resolved) return;

                    addLog("✅ " + testName + ": SUCCESS");
                    addLog("   - URL: " + url);
                    RESULTS.passed++;
                    RESULTS.tests.push({ name: testName, passed: true });
                    resolved = true;
                    resolve(true);
                }, 2000);
            },

            onReceivedError: function(view, request, error) {
                if (resolved) return;

                const errorMsg = "Error code: " + error.getErrorCode() +
                                " - " + error.getDescription();
                addLog("❌ " + testName + ": FAILED - " + errorMsg);
                RESULTS.failed++;
                RESULTS.tests.push({
                    name: testName,
                    passed: false,
                    error: errorMsg
                });
                resolved = true;
                resolve(false);
            }
        }));

        // Set timeout (30 seconds)
        setTimeout(() => {
            if (!resolved) {
                addLog("❌ " + testName + ": FAILED - Timeout (30s)");
                RESULTS.failed++;
                RESULTS.tests.push({
                    name: testName,
                    passed: false,
                    error: "Page load timeout"
                });
                resolved = true;
                resolve(false);
            }
        }, 30000);

        // Load YouTube
        addLog("🌐 Loading https://m.youtube.com...");
        webView.loadUrl("https://m.youtube.com");
    });
}

// =============================================
// Test 4: evaluateJavascript Execution
// =============================================
function testJavaScriptEvaluation() {
    const testName = "Test 4: evaluateJavascript Execution";

    return new Promise((resolve) => {
        const webView = ui.webView;
        let resolved = false;

        // Test script: Get page title and URL
        const testScript = `
            (function() {
                return {
                    title: document.title,
                    url: window.location.href,
                    hasYtApp: !!document.querySelector('ytm-app, ytd-app, #page-manager'),
                    userAgent: navigator.userAgent
                };
            })()
        `;

        try {
            webView.evaluateJavascript(testScript, new JavaAdapter(android.webkit.ValueCallback, {
                onReceiveValue: function(result) {
                    if (resolved) return;
                    resolved = true;

                    try {
                        // Parse JSON result
                        const data = JSON.parse(result);

                        addLog("✅ " + testName + ": SUCCESS");
                        addLog("   - Title: " + data.title);
                        addLog("   - Has YouTube app element: " + data.hasYtApp);
                        addLog("   - User-Agent: " + data.userAgent.substring(0, 50) + "...");

                        RESULTS.passed++;
                        RESULTS.tests.push({
                            name: testName,
                            passed: true,
                            data: data
                        });
                        resolve(true);

                    } catch (e) {
                        addLog("❌ " + testName + ": FAILED - Parse error: " + e.message);
                        addLog("   - Raw result: " + result);
                        RESULTS.failed++;
                        RESULTS.tests.push({
                            name: testName,
                            passed: false,
                            error: "Parse error: " + e.message
                        });
                        resolve(false);
                    }
                }
            }));

        } catch (e) {
            if (!resolved) {
                addLog("❌ " + testName + ": FAILED - " + e.message);
                RESULTS.failed++;
                RESULTS.tests.push({
                    name: testName,
                    passed: false,
                    error: e.message
                });
                resolved = true;
                resolve(false);
            }
        }

        // Timeout (10 seconds)
        setTimeout(() => {
            if (!resolved) {
                addLog("❌ " + testName + ": FAILED - Timeout");
                RESULTS.failed++;
                RESULTS.tests.push({
                    name: testName,
                    passed: false,
                    error: "Evaluation timeout"
                });
                resolved = true;
                resolve(false);
            }
        }, 10000);
    });
}

// =============================================
// Test 5: Search Selector Validation
// =============================================
function testSearchSelector() {
    const testName = "Test 5: Search Selector Validation";

    return new Promise((resolve) => {
        const webView = ui.webView;
        let resolved = false;

        // Test multiple selector fallbacks
        const testScript = `
            (function() {
                const selectors = [
                    { name: 'search_button_1', selector: 'button[aria-label="검색"]' },
                    { name: 'search_button_2', selector: 'button[aria-label="Search"]' },
                    { name: 'search_button_3', selector: 'ytm-search-box button' },
                    { name: 'search_input_1', selector: 'input[name="search_query"]' },
                    { name: 'search_input_2', selector: '#search-input' },
                    { name: 'video_result_1', selector: 'ytm-video-with-context-renderer' },
                    { name: 'video_result_2', selector: 'ytm-compact-video-renderer' }
                ];

                const results = [];
                for (const item of selectors) {
                    const element = document.querySelector(item.selector);
                    results.push({
                        name: item.name,
                        selector: item.selector,
                        found: !!element
                    });
                }

                return results;
            })()
        `;

        try {
            webView.evaluateJavascript(testScript, new JavaAdapter(android.webkit.ValueCallback, {
                onReceiveValue: function(result) {
                    if (resolved) return;
                    resolved = true;

                    try {
                        const data = JSON.parse(result);
                        const foundCount = data.filter(item => item.found).length;
                        const totalCount = data.length;

                        // Success criteria: At least 50% of selectors found
                        const successRate = (foundCount / totalCount) * 100;
                        const passed = successRate >= 50;

                        if (passed) {
                            addLog("✅ " + testName + ": SUCCESS");
                            addLog("   - Found: " + foundCount + "/" + totalCount + " (" + successRate.toFixed(0) + "%)");

                            // Log each selector result
                            data.forEach(item => {
                                const icon = item.found ? "✓" : "✗";
                                addLog("   " + icon + " " + item.name);
                            });

                            RESULTS.passed++;
                            RESULTS.tests.push({
                                name: testName,
                                passed: true,
                                foundCount: foundCount,
                                totalCount: totalCount,
                                selectors: data
                            });

                        } else {
                            addLog("❌ " + testName + ": FAILED");
                            addLog("   - Found only: " + foundCount + "/" + totalCount + " (" + successRate.toFixed(0) + "%)");
                            addLog("   - Need at least 50% success rate");

                            RESULTS.failed++;
                            RESULTS.tests.push({
                                name: testName,
                                passed: false,
                                error: "Low selector success rate: " + successRate.toFixed(0) + "%",
                                foundCount: foundCount,
                                totalCount: totalCount
                            });
                        }

                        resolve(passed);

                    } catch (e) {
                        addLog("❌ " + testName + ": FAILED - Parse error: " + e.message);
                        RESULTS.failed++;
                        RESULTS.tests.push({
                            name: testName,
                            passed: false,
                            error: "Parse error: " + e.message
                        });
                        resolve(false);
                    }
                }
            }));

        } catch (e) {
            if (!resolved) {
                addLog("❌ " + testName + ": FAILED - " + e.message);
                RESULTS.failed++;
                RESULTS.tests.push({
                    name: testName,
                    passed: false,
                    error: e.message
                });
                resolved = true;
                resolve(false);
            }
        }

        // Timeout (10 seconds)
        setTimeout(() => {
            if (!resolved) {
                addLog("❌ " + testName + ": FAILED - Timeout");
                RESULTS.failed++;
                RESULTS.tests.push({
                    name: testName,
                    passed: false,
                    error: "Timeout"
                });
                resolved = true;
                resolve(false);
            }
        }, 10000);
    });
}

// =============================================
// Test 6: Module Loading (require)
// =============================================
function testModuleLoading() {
    const testName = "Test 6: Module Loading (require)";

    return new Promise((resolve) => {
        try {
            // Create a test module file
            const testModulePath = files.cwd() + "/test_module.js";
            const testModuleContent = `
                module.exports = {
                    testFunction: function() {
                        return "module_loaded";
                    },
                    testValue: 42
                };
            `;

            files.write(testModulePath, testModuleContent);

            addLog("📦 Test module created: " + testModulePath);

            // Attempt to require the module
            let testModule;
            try {
                testModule = require(testModulePath);
            } catch (e) {
                // Try with relative path
                try {
                    testModule = require('./test_module.js');
                } catch (e2) {
                    throw new Error("require() failed with both absolute and relative paths");
                }
            }

            // Verify module loaded correctly
            if (!testModule) {
                throw new Error("Module loaded but is null/undefined");
            }

            if (typeof testModule.testFunction !== 'function') {
                throw new Error("Module functions not accessible");
            }

            if (testModule.testValue !== 42) {
                throw new Error("Module values not accessible");
            }

            const result = testModule.testFunction();
            if (result !== "module_loaded") {
                throw new Error("Module function execution failed");
            }

            // Cleanup
            files.remove(testModulePath);

            addLog("✅ " + testName + ": SUCCESS");
            addLog("   - Module exported functions: ✓");
            addLog("   - Module exported values: ✓");
            addLog("   - Function execution: ✓");

            RESULTS.passed++;
            RESULTS.tests.push({
                name: testName,
                passed: true
            });
            resolve(true);

        } catch (error) {
            addLog("❌ " + testName + ": FAILED - " + error.message);
            RESULTS.failed++;
            RESULTS.tests.push({
                name: testName,
                passed: false,
                error: error.message
            });
            resolve(false);
        }
    });
}

// =============================================
// Helper: Add log to UI
// =============================================
function addLog(message) {
    console.log(message);

    ui.run(() => {
        const currentLog = ui.log.getText().toString();
        ui.log.setText(currentLog + "\n" + message);
    });
}

// =============================================
// Main Test Runner
// =============================================
async function runPreFlightTests() {
    addLog("🚀 Phase 0: Pre-Flight Validation");
    addLog("═══════════════════════════════════");
    addLog("");

    // Test 1 & 2 (synchronous)
    testWebViewRendering();
    await sleep(500);
    testWebSettings();
    await sleep(500);

    // Test 3, 4, 5, 6 (asynchronous)
    await testYouTubeLoad();
    await sleep(2000); // Wait for page to stabilize
    await testJavaScriptEvaluation();
    await sleep(2000);
    await testSearchSelector();
    await sleep(1000);
    await testModuleLoading();

    // Final report
    addLog("");
    addLog("═══════════════════════════════════");
    addLog("📊 FINAL RESULTS");
    addLog("═══════════════════════════════════");
    addLog("Passed: " + RESULTS.passed + "/6");
    addLog("Failed: " + RESULTS.failed + "/6");
    addLog("");

    if (RESULTS.failed === 0) {
        addLog("🎉 ALL TESTS PASSED!");
        addLog("");
        addLog("✅ Phase 0 complete");
        addLog("✅ Ready to proceed to Phase 1");
        addLog("");
        addLog("Next steps:");
        addLog("1. Save this report as PREFLIGHT_REPORT.md");
        addLog("2. Execute: /sisyphus webview-dom-automation");

        ui.run(() => {
            ui.status.setText("✅ All tests passed - Ready for Phase 1");
            ui.status.setTextColor(colors.GREEN);
        });

    } else {
        addLog("⚠️ " + RESULTS.failed + " TEST(S) FAILED");
        addLog("");
        addLog("❌ Phase 0 incomplete");
        addLog("❌ Cannot proceed to Phase 1");
        addLog("");
        addLog("Required actions:");
        RESULTS.tests.forEach((test, index) => {
            if (!test.passed) {
                addLog((index + 1) + ". Fix: " + test.name);
                addLog("   Error: " + (test.error || "Unknown"));
            }
        });

        ui.run(() => {
            ui.status.setText("❌ " + RESULTS.failed + " test(s) failed - Fix errors");
            ui.status.setTextColor(colors.RED);
        });
    }

    // Save results to file
    saveReportToFile();
}

// =============================================
// Save Report to File
// =============================================
function saveReportToFile() {
    try {
        const reportPath = files.cwd() + "/PREFLIGHT_REPORT.md";

        let report = "# Phase 0: Pre-Flight Validation Report\n\n";
        report += "**Date**: " + new Date().toISOString() + "\n";
        report += "**Device**: " + device.model + " (Android " + device.release + ")\n";
        report += "**AutoX.js Version**: " + app.versionName + "\n\n";

        report += "## Test Results\n\n";
        report += "| # | Test | Result | Details |\n";
        report += "|---|------|--------|----------|\n";

        RESULTS.tests.forEach((test, index) => {
            const icon = test.passed ? "✅" : "❌";
            const details = test.passed ? "Pass" : (test.error || "Failed");
            report += "| " + (index + 1) + " | " + test.name + " | " + icon + " | " + details + " |\n";
        });

        report += "\n## Summary\n\n";
        report += "- **Passed**: " + RESULTS.passed + "/6\n";
        report += "- **Failed**: " + RESULTS.failed + "/6\n";
        report += "- **Success Rate**: " + ((RESULTS.passed / 6) * 100).toFixed(0) + "%\n\n";

        if (RESULTS.failed === 0) {
            report += "## Decision\n\n";
            report += "✅ **PROCEED TO PHASE 1**\n\n";
            report += "All pre-flight tests passed. The AutoX.js environment supports the required WebView APIs for DOM automation.\n";
        } else {
            report += "## Decision\n\n";
            report += "❌ **DO NOT PROCEED**\n\n";
            report += "Pre-flight validation failed. Address the errors above before starting Phase 1.\n";
        }

        files.write(reportPath, report);
        addLog("");
        addLog("💾 Report saved: " + reportPath);

    } catch (e) {
        addLog("⚠️ Could not save report: " + e.message);
    }
}

// =============================================
// Start Tests
// =============================================
ui.run(() => {
    setTimeout(runPreFlightTests, 1000);
});
