import { AdbController } from '@doai/worker-core';
import type { UIElement, UISelector } from './types';
import { parseUIDump } from './parser';

/**
 * UIAutomator - ADB-based UI automation wrapper
 * Provides element finding and interaction via UIAutomator dumps
 */
export class UIAutomator {
  private adb: AdbController;
  private lastDump: UIElement[] = [];
  private lastDumpTime = 0;
  private cacheTtlMs = 500; // Cache dump for 500ms

  constructor(adb: AdbController) {
    this.adb = adb;
  }

  /**
   * Dump current UI hierarchy
   */
  async dumpUI(serial: string, forceRefresh = false): Promise<UIElement[]> {
    const now = Date.now();
    if (!forceRefresh && this.lastDump.length > 0 && (now - this.lastDumpTime) < this.cacheTtlMs) {
      return this.lastDump;
    }

    const xml = await this.adb.executeShell(serial, 'uiautomator dump /dev/tty');
    this.lastDump = parseUIDump(xml);
    this.lastDumpTime = Date.now();
    return this.lastDump;
  }

  /**
   * Find elements matching a selector
   */
  async findElements(serial: string, selector: UISelector): Promise<UIElement[]> {
    const elements = await this.dumpUI(serial, true);
    return elements.filter((el) => this.matchesSelector(el, selector));
  }

  /**
   * Find first element matching a selector
   */
  async findElement(serial: string, selector: UISelector): Promise<UIElement | null> {
    const matches = await this.findElements(serial, selector);
    return matches[0] ?? null;
  }

  /**
   * Find element by exact text
   */
  async findByText(serial: string, text: string): Promise<UIElement | null> {
    return this.findElement(serial, { text });
  }

  /**
   * Find element by text containing substring
   */
  async findByTextContains(serial: string, text: string): Promise<UIElement | null> {
    return this.findElement(serial, { textContains: text });
  }

  /**
   * Find element by content description
   */
  async findByDescription(serial: string, desc: string): Promise<UIElement | null> {
    return this.findElement(serial, { contentDesc: desc });
  }

  /**
   * Find element by resource ID
   */
  async findById(serial: string, resourceId: string): Promise<UIElement | null> {
    return this.findElement(serial, { resourceId });
  }

  /**
   * Find all elements by class name
   */
  async findByClass(serial: string, className: string): Promise<UIElement[]> {
    return this.findElements(serial, { className });
  }

  /**
   * Click the center of an element
   */
  async click(serial: string, element: UIElement): Promise<void> {
    const { left, top, right, bottom } = element.bounds;
    const x = Math.floor((left + right) / 2);
    const y = Math.floor((top + bottom) / 2);
    await this.adb.executeShell(serial, `input tap ${x} ${y}`);
  }

  /**
   * Long click an element
   */
  async longClick(serial: string, element: UIElement, durationMs = 1000): Promise<void> {
    const { left, top, right, bottom } = element.bounds;
    const x = Math.floor((left + right) / 2);
    const y = Math.floor((top + bottom) / 2);
    await this.adb.executeShell(serial, `input swipe ${x} ${y} ${x} ${y} ${durationMs}`);
  }

  /**
   * Set text on an element (clears first)
   */
  async setText(serial: string, element: UIElement, text: string): Promise<void> {
    await this.click(serial, element);
    // Select all and delete
    await this.adb.executeShell(serial, 'input keyevent 67'); // KEYCODE_DEL
    await this.adb.executeShell(serial, `input keyevent --longpress 67`);
    // Type new text
    const escaped = text.replace(/ /g, '%s').replace(/(['"\\])/g, '\\$1');
    await this.adb.executeShell(serial, `input text "${escaped}"`);
  }

  /**
   * Scroll in a direction
   */
  async scroll(serial: string, direction: 'up' | 'down' | 'left' | 'right', distance = 300): Promise<void> {
    const centerX = 540;
    const centerY = 960;
    let endX = centerX, endY = centerY;

    switch (direction) {
      case 'up': endY = centerY - distance; break;
      case 'down': endY = centerY + distance; break;
      case 'left': endX = centerX - distance; break;
      case 'right': endX = centerX + distance; break;
    }

    await this.adb.executeShell(serial, `input swipe ${centerX} ${centerY} ${endX} ${endY} 300`);
  }

  /**
   * Wait for an element matching selector to appear
   */
  async waitForElement(serial: string, selector: UISelector, timeoutMs = 10000): Promise<UIElement> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const element = await this.findElement(serial, selector);
      if (element) return element;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Element not found within ${timeoutMs}ms: ${JSON.stringify(selector)}`);
  }

  /**
   * Wait for text to appear on screen
   */
  async waitForText(serial: string, text: string, timeoutMs = 10000): Promise<UIElement> {
    return this.waitForElement(serial, { text }, timeoutMs);
  }

  /**
   * Check if element matches selector
   */
  private matchesSelector(element: UIElement, selector: UISelector): boolean {
    if (selector.text !== undefined && element.text !== selector.text) return false;
    if (selector.textContains !== undefined && !element.text.includes(selector.textContains)) return false;
    if (selector.textStartsWith !== undefined && !element.text.startsWith(selector.textStartsWith)) return false;
    if (selector.contentDesc !== undefined && element.contentDesc !== selector.contentDesc) return false;
    if (selector.contentDescContains !== undefined && !element.contentDesc.includes(selector.contentDescContains)) return false;
    if (selector.resourceId !== undefined && element.resourceId !== selector.resourceId) return false;
    if (selector.resourceIdContains !== undefined && !element.resourceId.includes(selector.resourceIdContains)) return false;
    if (selector.className !== undefined && element.className !== selector.className) return false;
    if (selector.packageName !== undefined && element.packageName !== selector.packageName) return false;
    if (selector.clickable !== undefined && element.clickable !== selector.clickable) return false;
    if (selector.enabled !== undefined && element.enabled !== selector.enabled) return false;
    if (selector.scrollable !== undefined && element.scrollable !== selector.scrollable) return false;
    return true;
  }
}
