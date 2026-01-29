/**
 * Module Loader for AutoX.js (ES5 Compatible)
 *
 * Purpose: Abstract module loading to handle AutoX.js path limitations
 * Usage: var loader = require('./modules/module-loader.js');
 *        var myModule = loader.loadModule('config');
 */

// =============================================
// Configuration
// =============================================

// Base path for modules (configurable)
var MODULE_BASE_PATH = files.cwd() + '/modules/';

// Module registry (cache loaded modules)
var moduleCache = {};

// =============================================
// Core Functions
// =============================================

/**
 * Load a module by name
 * @param {string} moduleName - Module name without .js extension
 * @returns {object} - Exported module object
 *
 * Example:
 *   var config = loadModule('config');
 *   var domUtils = loadModule('dom_utils');
 */
function loadModule(moduleName) {
    // Check cache first
    if (moduleCache[moduleName]) {
        console.log("[ModuleLoader] Using cached: " + moduleName);
        return moduleCache[moduleName];
    }

    console.log("[ModuleLoader] Loading: " + moduleName);

    // Try different path variations
    var pathVariations = [
        MODULE_BASE_PATH + moduleName + '.js',           // /sdcard/scripts/modules/config.js
        MODULE_BASE_PATH + moduleName,                   // /sdcard/scripts/modules/config
        files.cwd() + '/modules/' + moduleName + '.js',  // {cwd}/modules/config.js
        '/sdcard/scripts/modules/' + moduleName + '.js', // /sdcard/scripts/modules/config.js
        files.cwd() + '/' + moduleName + '.js',          // {cwd}/config.js (if called from modules dir)
        '/sdcard/scripts/' + moduleName + '.js'          // /sdcard/scripts/config.js (direct script)
    ];

    for (var i = 0; i < pathVariations.length; i++) {
        var modulePath = pathVariations[i];
        try {
            if (files.exists(modulePath)) {
                console.log("[ModuleLoader] Found at: " + modulePath);

                // Load module using require with absolute path
                var loadedModule = require(modulePath);

                // Cache the module
                moduleCache[moduleName] = loadedModule;

                console.log("[ModuleLoader] [OK] Loaded: " + moduleName);
                return loadedModule;
            }
        } catch (error) {
            console.log("[ModuleLoader] [WARN] Path check failed: " + modulePath + " (" + error.message + ")");
            // Try next path
            continue;
        }
    }

    // Module not found - provide detailed error
    console.error("[ModuleLoader] [FAIL] Module not found: " + moduleName);
    console.error("[ModuleLoader] Tried paths:");
    for (var j = 0; j < pathVariations.length; j++) {
        var path = pathVariations[j];
        var status = files.exists(path) ? 'EXISTS' : 'NOT FOUND';
        console.error("  " + (j + 1) + ". " + path + " - " + status);
    }
    throw new Error("[ModuleLoader] Module not found: " + moduleName);
}

/**
 * Load multiple modules at once
 * @param {Array<string>} moduleNames - Array of module names
 * @returns {object} - Object with module name as key
 *
 * Example:
 *   var modules = loadModules(['config', 'dom_utils']);
 */
function loadModules(moduleNames) {
    var modules = {};

    for (var i = 0; i < moduleNames.length; i++) {
        var moduleName = moduleNames[i];
        try {
            modules[moduleName] = loadModule(moduleName);
        } catch (error) {
            console.error("[ModuleLoader] Failed to load " + moduleName + ": " + error.message);
            modules[moduleName] = null;
        }
    }

    return modules;
}

/**
 * Get current working directory (module base path)
 * @returns {string} - Base path for modules
 */
function getModuleBasePath() {
    return MODULE_BASE_PATH;
}

/**
 * Clear module cache (for testing)
 */
function clearCache() {
    for (var key in moduleCache) {
        if (moduleCache.hasOwnProperty(key)) {
            delete moduleCache[key];
        }
    }
    console.log('[ModuleLoader] Cache cleared');
}

/**
 * Get loaded modules list
 * @returns {Array<string>} - List of cached module names
 */
function getLoadedModules() {
    return Object.keys(moduleCache);
}

// =============================================
// Module Exports
// =============================================

module.exports = {
    loadModule: loadModule,
    loadModules: loadModules,
    getModuleBasePath: getModuleBasePath,
    clearCache: clearCache,
    getLoadedModules: getLoadedModules
};
